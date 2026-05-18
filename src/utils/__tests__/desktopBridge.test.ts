/**
 * 桌面桥（renderer 侧）单测。
 *
 * 重点覆盖：
 *   1. 没有 window.motorControlDesktop 时 → 所有 API 安全降级（null / no-op）
 *   2. 注入一个 mock 桥后 → check / download / install 调用透传
 *   3. subscribeUpdateEvents 的 unsubscribe 行为
 *   4. dismiss / read session helper 在没有 sessionStorage 时不抛
 *   5. UpdateBanner::eventToView 纯函数：6 个状态各自映射对
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkForUpdateNow,
  dismissUpdateBannerThisSession,
  isDesktopRuntime,
  quitAndInstallUpdate,
  readDismissedBannerVersion,
  startUpdateDownload,
  subscribeUpdateEvents,
  type UpdateEvent,
} from '../desktopBridge';
import { __testing as bannerTesting } from '../../components/desktop/UpdateBanner';

// vitest 默认 node 环境：用 globalThis 注入最小的 window/sessionStorage stub
// 这里全用 any 绕过 DOM lib 的类型冲突；测试目标是行为而非类型完整性

// 简易 sessionStorage polyfill 给 node env 用
function createMemoryStorage() {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
    removeItem: (k: string) => {
      m.delete(k);
    },
    key: (i: number) => Array.from(m.keys())[i] ?? null,
  };
}

beforeEach(() => {
  // 默认无桥
  (globalThis as any).window = undefined;
  (globalThis as any).sessionStorage = createMemoryStorage();
});

afterEach(() => {
  (globalThis as any).window = undefined;
});

describe('desktopBridge — 没有桥时安全降级', () => {
  it('isDesktopRuntime 返回 false', () => {
    expect(isDesktopRuntime()).toBe(false);
  });

  it('checkForUpdateNow / startUpdateDownload / quitAndInstallUpdate 返回 null', async () => {
    expect(await checkForUpdateNow()).toBeNull();
    expect(await startUpdateDownload()).toBeNull();
    expect(await quitAndInstallUpdate()).toBeNull();
  });

  it('subscribeUpdateEvents 返回 no-op unsubscribe', () => {
    const off = subscribeUpdateEvents(() => {});
    expect(typeof off).toBe('function');
    // 调用不会抛
    expect(() => off()).not.toThrow();
  });

  it('window 不存在时 dismiss / read 不抛', () => {
    (globalThis as any).sessionStorage = undefined;
    expect(() => dismissUpdateBannerThisSession('1.2.3')).not.toThrow();
    expect(readDismissedBannerVersion()).toBeNull();
  });
});

describe('desktopBridge — 注入 mock 桥', () => {
  it('checkForUpdateNow 透传到 bridge.checkForUpdateNow', async () => {
    const spy = vi.fn().mockResolvedValue({ status: 'checked', current: '0.1.0', latest: '0.2.0' });
    (globalThis as any).window = {
      motorControlDesktop: {
        checkForUpdateNow: spy,
      },
    };
    const res = await checkForUpdateNow();
    expect(spy).toHaveBeenCalledOnce();
    expect(res?.status).toBe('checked');
    expect(res?.latest).toBe('0.2.0');
  });

  it('bridge 抛错时 checkForUpdateNow 包成 { status: error }', async () => {
    (globalThis as any).window = {
      motorControlDesktop: {
        checkForUpdateNow: vi.fn().mockRejectedValue(new Error('net fail')),
      },
    };
    const res = await checkForUpdateNow();
    expect(res?.status).toBe('error');
    expect(res?.error).toBe('net fail');
  });

  it('startUpdateDownload / quitAndInstallUpdate 都能拿到 ok', async () => {
    const dl = vi.fn().mockResolvedValue({ status: 'ok' });
    const qi = vi.fn().mockResolvedValue({ status: 'ok' });
    (globalThis as any).window = {
      motorControlDesktop: {
        startUpdateDownload: dl,
        quitAndInstallUpdate: qi,
      },
    };
    expect((await startUpdateDownload())?.status).toBe('ok');
    expect((await quitAndInstallUpdate())?.status).toBe('ok');
    expect(dl).toHaveBeenCalledOnce();
    expect(qi).toHaveBeenCalledOnce();
  });

  it('subscribeUpdateEvents 触发 → handler 收到事件；unsubscribe 后不再收到', () => {
    let registered: ((ev: UpdateEvent) => void) | null = null;
    const off = vi.fn();
    (globalThis as any).window = {
      motorControlDesktop: {
        subscribeUpdateEvents: (h: (ev: UpdateEvent) => void) => {
          registered = h;
          return off;
        },
      },
    };
    const seen: UpdateEvent[] = [];
    const unsubscribe = subscribeUpdateEvents((ev) => seen.push(ev));
    expect(registered).not.toBeNull();
    registered!({ status: 'available', currentVersion: '0.1.0', latest: '0.2.0' });
    registered!({ status: 'downloading', currentVersion: '0.1.0', percent: 42 });
    expect(seen).toHaveLength(2);
    expect(seen[0].status).toBe('available');
    expect(seen[1].percent).toBe(42);
    unsubscribe();
    expect(off).toHaveBeenCalledOnce();
  });

  it('dismiss/read session 持久化版本号', () => {
    dismissUpdateBannerThisSession('0.2.0');
    expect(readDismissedBannerVersion()).toBe('0.2.0');
    dismissUpdateBannerThisSession(null);
    expect(readDismissedBannerVersion()).toBe('*');
  });
});

describe('UpdateBanner::eventToView 纯映射', () => {
  const { eventToView } = bannerTesting;
  const cur = '0.1.0';

  it('checking → kind=checking', () => {
    expect(eventToView({ status: 'checking', currentVersion: cur }, null)).toEqual({
      kind: 'checking',
    });
  });

  it('available 未被 dismiss → kind=available + 版本号', () => {
    const v = eventToView(
      { status: 'available', currentVersion: cur, latest: '0.2.0' },
      null,
    );
    expect(v).toEqual({ kind: 'available', latest: '0.2.0', current: cur });
  });

  it('available 命中精确 dismiss 版本 → kind=hidden', () => {
    const v = eventToView(
      { status: 'available', currentVersion: cur, latest: '0.2.0' },
      '0.2.0',
    );
    expect(v.kind).toBe('hidden');
  });

  it('available 命中通配 * dismiss → kind=hidden', () => {
    const v = eventToView(
      { status: 'available', currentVersion: cur, latest: '0.3.0' },
      '*',
    );
    expect(v.kind).toBe('hidden');
  });

  it('downloading → 取整 percent', () => {
    const v = eventToView(
      { status: 'downloading', currentVersion: cur, percent: 42.7 },
      null,
    );
    expect(v).toEqual({ kind: 'downloading', percent: 43 });
  });

  it('downloaded → 带 latest', () => {
    const v = eventToView(
      { status: 'downloaded', currentVersion: cur, latest: '0.2.0' },
      null,
    );
    expect(v).toEqual({ kind: 'downloaded', latest: '0.2.0' });
  });

  it('not-available → kind=not-available', () => {
    expect(
      eventToView({ status: 'not-available', currentVersion: cur }, null),
    ).toEqual({ kind: 'not-available' });
  });

  it('error → 透传 message，缺省给"未知错误"', () => {
    expect(
      eventToView({ status: 'error', currentVersion: cur, message: 'oops' }, null),
    ).toEqual({ kind: 'error', message: 'oops' });
    expect(
      eventToView({ status: 'error', currentVersion: cur }, null),
    ).toEqual({ kind: 'error', message: '未知错误' });
  });

  it('disabled → 完全隐藏 banner', () => {
    expect(eventToView({ status: 'disabled', currentVersion: cur }, null)).toEqual({
      kind: 'hidden',
    });
  });

  it('downloading 缺 percent → 默认 0', () => {
    const v = eventToView({ status: 'downloading', currentVersion: cur }, null);
    expect(v).toEqual({ kind: 'downloading', percent: 0 });
  });
});

describe('update.cjs::buildUpdateEvent 纯函数（主进程归一化）', () => {
  // 通过 dynamic import 加载 CJS 模块；vitest 在 node env 下能解析 .cjs
  it('多种 autoUpdater 事件 → 统一 payload', async () => {
    // @ts-expect-error - importing .cjs in TS without a declaration; runtime works in vitest node env
    const mod: any = await import('../../../electron/update.cjs');
    const { buildUpdateEvent } = mod;

    expect(buildUpdateEvent('checking-for-update', null, '0.1.0').status).toBe('checking');
    expect(
      buildUpdateEvent('update-available', { version: '0.2.0' }, '0.1.0'),
    ).toMatchObject({ status: 'available', latest: '0.2.0' });
    expect(
      buildUpdateEvent('update-not-available', { version: '0.1.0' }, '0.1.0'),
    ).toMatchObject({ status: 'not-available', latest: '0.1.0' });

    const dl = buildUpdateEvent('download-progress', { percent: 55.5, total: 100 }, '0.1.0');
    expect(dl.status).toBe('downloading');
    expect(dl.percent).toBeCloseTo(55.5, 3);

    expect(buildUpdateEvent('update-downloaded', { version: '0.2.0' }, '0.1.0').status).toBe(
      'downloaded',
    );
    expect(
      buildUpdateEvent('error', { message: 'boom' }, '0.1.0'),
    ).toMatchObject({ status: 'error', message: 'boom' });
    expect(buildUpdateEvent('disabled', null, '0.1.0').status).toBe('disabled');
    expect(buildUpdateEvent('weird-event', null, '0.1.0').status).toBe('error');
  });

  it('download-progress 负值 / >100 会被夹到 [0,100]', async () => {
    // @ts-expect-error - importing .cjs in TS without a declaration; runtime works in vitest node env
    const mod: any = await import('../../../electron/update.cjs');
    const { buildUpdateEvent } = mod;
    expect(buildUpdateEvent('download-progress', { percent: -10 }, '0.1.0').percent).toBe(0);
    expect(buildUpdateEvent('download-progress', { percent: 250 }, '0.1.0').percent).toBe(100);
  });
});
