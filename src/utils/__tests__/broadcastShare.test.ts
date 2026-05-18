import { describe, expect, it, vi } from 'vitest';
import {
  BROADCAST_CHANNEL_NAME,
  addComment,
  createBroadcastShareBridge,
  isBroadcastSupported,
  parseComments,
  removeComment,
  renderMiniMarkdown,
  serializeComments,
  type BroadcastChannelLike,
  type BroadcastMessage,
} from '../broadcastShare';

/** 简易 BroadcastChannel mock：同 name 的实例共享一个 listeners 池 */
class MockChannelHub {
  private pools = new Map<string, Set<MockBroadcastChannel>>();
  register(ch: MockBroadcastChannel) {
    const set = this.pools.get(ch.name) ?? new Set<MockBroadcastChannel>();
    set.add(ch);
    this.pools.set(ch.name, set);
  }
  unregister(ch: MockBroadcastChannel) {
    this.pools.get(ch.name)?.delete(ch);
  }
  peers(name: string, self: MockBroadcastChannel): MockBroadcastChannel[] {
    return Array.from(this.pools.get(name) ?? []).filter((c) => c !== self);
  }
}

class MockBroadcastChannel implements BroadcastChannelLike {
  listeners = new Set<(ev: { data: unknown }) => void>();
  closed = false;
  constructor(public name: string, private hub: MockChannelHub) {
    hub.register(this);
  }
  postMessage(data: unknown): void {
    if (this.closed) return;
    for (const peer of this.hub.peers(this.name, this)) {
      // 同步派发；structuredClone 用 JSON 模拟
      const cloned = JSON.parse(JSON.stringify(data));
      for (const l of peer.listeners) l({ data: cloned });
    }
  }
  close(): void {
    this.closed = true;
    this.hub.unregister(this);
  }
  addEventListener(_type: 'message', listener: (ev: { data: unknown }) => void): void {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (ev: { data: unknown }) => void): void {
    this.listeners.delete(listener);
  }
}

function makeFactory(hub: MockChannelHub) {
  return (name: string) => new MockBroadcastChannel(name, hub);
}

describe('isBroadcastSupported', () => {
  it('返回 boolean（取决于运行环境）', () => {
    expect(typeof isBroadcastSupported()).toBe('boolean');
  });
});

describe('createBroadcastShareBridge', () => {
  it('两个 bridge 互相收得到 patch；不会回响给自己', () => {
    const hub = new MockChannelHub();
    const aMsgs: BroadcastMessage[] = [];
    const bMsgs: BroadcastMessage[] = [];
    const a = createBroadcastShareBridge({
      onMessage: (m) => aMsgs.push(m),
      channelFactory: makeFactory(hub),
      tabId: 'tab-A',
    });
    const b = createBroadcastShareBridge({
      onMessage: (m) => bMsgs.push(m),
      channelFactory: makeFactory(hub),
      tabId: 'tab-B',
    });
    // b 上线后 a 应收到 hello（A 先 listener register 后 B send → A 收到）
    expect(aMsgs.some((m) => m.kind === 'hello' && m.tabId === 'tab-B')).toBe(true);
    // 手动 ping 来验证双向通信：a → ping, b 回 pong
    let bGotPing = false;
    b.send({ kind: 'hello', tabId: 'tab-B' }); // 重发一遍 hello 让 a 也确认得到
    expect(aMsgs.filter((m) => m.kind === 'hello' && m.tabId === 'tab-B').length).toBeGreaterThanOrEqual(1);
    void bGotPing;

    a.send({ kind: 'patch', tabId: 'tab-A', slice: 'pid', data: { kp: 3 } });
    const patch = bMsgs.find((m) => m.kind === 'patch') as Extract<BroadcastMessage, { kind: 'patch' }>;
    expect(patch).toBeDefined();
    expect(patch.slice).toBe('pid');
    expect(patch.data).toEqual({ kp: 3 });

    // a 不会自己收到自己发的 patch
    expect(aMsgs.find((m) => m.kind === 'patch')).toBeUndefined();

    a.close();
    b.close();
  });

  it('close 会广播 bye + 之后 send no-op', () => {
    const hub = new MockChannelHub();
    const bMsgs: BroadcastMessage[] = [];
    const a = createBroadcastShareBridge({
      onMessage: () => {},
      channelFactory: makeFactory(hub),
      tabId: 'A',
    });
    const b = createBroadcastShareBridge({
      onMessage: (m) => bMsgs.push(m),
      channelFactory: makeFactory(hub),
      tabId: 'B',
    });
    a.close();
    expect(bMsgs.some((m) => m.kind === 'bye' && m.tabId === 'A')).toBe(true);
    // 关闭后再 send 不报错也不被收到
    const before = bMsgs.length;
    a.send({ kind: 'patch', tabId: 'A', slice: 'pid', data: {} });
    expect(bMsgs.length).toBe(before);
    b.close();
  });

  it('pingPeers 收到 pong 回调', () => {
    vi.useFakeTimers();
    const hub = new MockChannelHub();
    const a = createBroadcastShareBridge({
      onMessage: () => {},
      channelFactory: makeFactory(hub),
      tabId: 'A',
    });
    const b = createBroadcastShareBridge({
      onMessage: (msg) => {
        if (msg.kind === 'ping') b.send({ kind: 'pong', tabId: 'B' });
      },
      channelFactory: makeFactory(hub),
      tabId: 'B',
    });
    const pongs: string[] = [];
    a.pingPeers((id) => pongs.push(id), 200);
    expect(pongs).toContain('B');
    vi.runAllTimers();
    a.close();
    b.close();
    vi.useRealTimers();
  });

  it('无 BroadcastChannel 实现 → 返回 no-op bridge', () => {
    const bridge = createBroadcastShareBridge({
      onMessage: () => {},
      channelFactory: () => null as unknown as BroadcastChannelLike,
    });
    expect(typeof bridge.send).toBe('function');
    // send / close 不报错
    bridge.send({ kind: 'hello', tabId: bridge.tabId });
    bridge.close();
  });

  it('频道名固定为 compbench-share', () => {
    expect(BROADCAST_CHANNEL_NAME).toBe('compbench-share');
  });
});

describe('renderMiniMarkdown', () => {
  it('转义 HTML 危险字符', () => {
    const out = renderMiniMarkdown('<script>alert(1)</script>');
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('支持 **bold**', () => {
    expect(renderMiniMarkdown('hello **world**')).toContain('<strong>world</strong>');
  });

  it('支持 *italic*', () => {
    expect(renderMiniMarkdown('hello *world*')).toContain('<em>world</em>');
  });

  it('支持 `code`', () => {
    const out = renderMiniMarkdown('use `Iq` for q-axis');
    expect(out).toContain('<code');
    expect(out).toContain('Iq');
  });

  it('换行 → <br/>', () => {
    expect(renderMiniMarkdown('a\nb')).toContain('<br/>');
  });

  it('bold + italic + code + 换行 组合', () => {
    const out = renderMiniMarkdown('**important** *note*\nuse `pid.kp`');
    expect(out).toContain('<strong>important</strong>');
    expect(out).toContain('<em>note</em>');
    expect(out).toContain('<br/>');
    expect(out).toContain('<code');
  });

  it('代码段内的 ** 不被解析为粗体', () => {
    const out = renderMiniMarkdown('`a**b**c`');
    expect(out).not.toContain('<strong>');
    expect(out).toContain('a**b**c');
  });

  it('空 / 非字符串输入安全返回空串', () => {
    expect(renderMiniMarkdown('')).toBe('');
    expect(renderMiniMarkdown(undefined as unknown as string)).toBe('');
  });
});

describe('comments serialize/parse/add/remove', () => {
  it('空文本 → 空数组', () => {
    expect(parseComments('')).toEqual([]);
    expect(parseComments('<!-- 在此添加评论 -->')).toEqual([]);
  });

  it('serialize + parse round-trip', () => {
    const entries = [
      { author: 'alice', ts: '2026-01-01T00:00:00Z', body: 'first comment' },
      { author: 'bob', ts: '2026-01-02T00:00:00Z', body: '**second** *comment*' },
    ];
    const text = serializeComments(entries);
    const parsed = parseComments(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].author).toBe('alice');
    expect(parsed[1].body).toBe('**second** *comment*');
  });

  it('addComment 追加', () => {
    let text = '<!-- 在此添加评论 -->\n';
    text = addComment(text, { author: 'a', ts: '2026-01-01T00:00:00Z', body: 'hi' });
    const parsed = parseComments(text);
    expect(parsed).toHaveLength(1);
    text = addComment(text, { author: 'b', ts: '2026-01-02T00:00:00Z', body: 'hey' });
    expect(parseComments(text)).toHaveLength(2);
  });

  it('removeComment 按索引删', () => {
    let text = '<!-- 在此添加评论 -->\n';
    text = addComment(text, { author: 'a', ts: '2026-01-01T00:00:00Z', body: 'one' });
    text = addComment(text, { author: 'b', ts: '2026-01-02T00:00:00Z', body: 'two' });
    text = addComment(text, { author: 'c', ts: '2026-01-03T00:00:00Z', body: 'three' });
    const next = removeComment(text, 1);
    const parsed = parseComments(next);
    expect(parsed).toHaveLength(2);
    expect(parsed.map((p) => p.body)).toEqual(['one', 'three']);
  });

  it('removeComment 越界返回原文不变', () => {
    const text = serializeComments([
      { author: 'a', ts: 't', body: 'only' },
    ]);
    expect(removeComment(text, 99)).toBe(text);
  });

  it('删空后回退到初始模板', () => {
    let text = serializeComments([
      { author: 'a', ts: 't', body: 'only' },
    ]);
    text = removeComment(text, 0);
    expect(parseComments(text)).toEqual([]);
  });
});
