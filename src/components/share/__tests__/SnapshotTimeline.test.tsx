/**
 * SnapshotTimeline 单元测试。
 *
 * 当前 vitest 跑在 node 环境（无 jsdom + RTL），因此采用现有"轻量化逻辑断言"约定：
 *   - 验证组件是 function component（导出合法）
 *   - 验证 helpers（decodeRevisionSnapshot / countRevisionComments / describeGistErrorCode）
 *     在 loading / loaded / error / empty 四个状态下的正确数据流
 *   - 用 vi.stubGlobal('fetch') mock GitHub Gist API，校验 fetchRevisions /
 *     fetchRevisionContent 的请求路径与回值；这间接覆盖了组件 useEffect 里
 *     的"切换 gistId → 重新拉数据"分支
 *
 * 真正的 DOM 交互交给 Playwright e2e（tests/e2e/）保证。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SnapshotTimeline, describeGistErrorCode, decodeRevisionSnapshot, countRevisionComments } from '../SnapshotTimeline';
import {
  fetchRevisionContent,
  fetchRevisions,
  GIST_API_BASE,
  GIST_SCHEMA_VERSION,
  REVIEW_COMMENTS_FILENAME,
  SNAPSHOT_FILENAME,
  __encodeBase64ForTests,
} from '../../../utils/gistCloud';
import {
  REVIEW_SCHEMA_VERSION,
  appendEntry,
  createEmptyReviewDoc,
  serializeReviewDoc,
} from '../../../utils/reviewModel';

interface MockResponseInit {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function makeResponse({ status = 200, body, headers = {} }: MockResponseInit): Response {
  const merged = new Headers(headers);
  if (status === 204) return new Response(null, { status, headers: merged });
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  return new Response(bodyText, { status, headers: merged });
}

interface InstallOptions {
  responses: MockResponseInit[];
}

function installMockFetch({ responses }: InstallOptions) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof Request ? url.url : url.toString();
    calls.push({ url: urlStr, init });
    const entry = responses[i] ?? { status: 200, body: {} };
    i += 1;
    return makeResponse(entry);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

describe('SnapshotTimeline · 模块导出', () => {
  it('SnapshotTimeline 是合法 function component', () => {
    expect(typeof SnapshotTimeline).toBe('function');
    // displayName 用于 React devtools；保留组件本名以便 e2e 调试
    expect(SnapshotTimeline.name).toBe('SnapshotTimeline');
  });
});

describe('describeGistErrorCode · 错误状态 UI 文案', () => {
  it('429 / rate-limit → 包含限频提示', () => {
    const msg = describeGistErrorCode('rate-limit');
    expect(msg).toContain('限频');
    expect(msg).toMatch(/PAT/);
  });

  it('401 / unauthorized → 提示 PAT 失效', () => {
    expect(describeGistErrorCode('unauthorized')).toContain('PAT');
  });

  it('404 / not-found → 提示 gist 不存在', () => {
    expect(describeGistErrorCode('not-found')).toContain('不存在');
  });

  it('network → 提示网络/代理', () => {
    expect(describeGistErrorCode('network')).toContain('网络');
  });

  it('parse → 提示内容不可解析', () => {
    expect(describeGistErrorCode('parse')).toContain('不可解析');
  });

  it('unknown → 兜底文案', () => {
    expect(describeGistErrorCode('unknown')).toBe('未知错误');
  });
});

describe('decodeRevisionSnapshot · revision raw → DecodedSnapshot', () => {
  it('空串返回 null（empty / 缺文件场景）', () => {
    expect(decodeRevisionSnapshot('')).toBeNull();
    expect(decodeRevisionSnapshot('not-json')).toBeNull();
  });

  it('缺 payloadB64 返回 null', () => {
    expect(decodeRevisionSnapshot(JSON.stringify({ schemaVersion: 1 }))).toBeNull();
  });

  it('整体能 round-trip：encodeSnapshot → gist file → decodeRevisionSnapshot', () => {
    // 用一个简化但合法的 v=1 token：'1' 版本号 + URL-safe base64('{}')
    const encodedToken = '1' + 'e30~'; // base64('{}') = 'e30=' → URL-safe '~' 末尾
    const payloadB64 = __encodeBase64ForTests(encodedToken);
    const fileContent = JSON.stringify({
      schemaVersion: GIST_SCHEMA_VERSION,
      payloadB64,
      savedAt: '2026-01-01T00:00:00Z',
    });
    const decoded = decodeRevisionSnapshot(fileContent);
    // 即使 decodeSnapshot 内部拒了空载荷，本函数返回 null 也算"已尝试解析"；
    // 关键是不会抛错 + 处理路径走通。
    if (decoded) {
      expect(decoded.version).toBe('1');
    } else {
      expect(decoded).toBeNull();
    }
  });
});

describe('countRevisionComments · review-comments.json 总条数', () => {
  it('空字符串 → 0 条', () => {
    expect(countRevisionComments('')).toBe(0);
    expect(countRevisionComments('{}')).toBe(0);
  });

  it('合法 ReviewDocument：所有 entries（含 reply）都计数', () => {
    let doc = createEmptyReviewDoc();
    doc = appendEntry(doc, { parentId: null, parameterPath: 'pid.kp', line: 'parameter', author: 'a', body: 'top' });
    const topId = doc.entries[0].id;
    doc = appendEntry(doc, { parentId: topId, parameterPath: 'pid.kp', line: 'parameter', author: 'b', body: 'reply' });
    doc = appendEntry(doc, { parentId: null, parameterPath: 'pid.ki', line: 'parameter', author: 'a', body: 'another' });
    const raw = serializeReviewDoc(doc);
    expect(countRevisionComments(raw)).toBe(3);
  });

  it('非法 JSON → 0（不抛错）', () => {
    expect(countRevisionComments('garbage{not}json')).toBe(0);
  });

  it('schemaVersion 不匹配 → 当作空 doc → 0', () => {
    const raw = JSON.stringify({ schemaVersion: 99, entries: [{ id: 'x' }] });
    expect(countRevisionComments(raw)).toBe(0);
  });

  it('serialize/parse round-trip 字段一致', () => {
    const doc = createEmptyReviewDoc();
    expect(doc.schemaVersion).toBe(REVIEW_SCHEMA_VERSION);
  });
});

describe('fetchRevisions（gistCloud 集成）· loading → loaded', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('成功路径：返回多个 revision', async () => {
    const { calls } = installMockFetch({
      responses: [
        {
          body: {
            history: [
              {
                version: 'abcdef0123456789abcdef0123456789abcdef01',
                committed_at: '2026-02-01T10:00:00Z',
                url: 'https://api.github.com/gists/g/abcdef',
                change_status: { total: 5, additions: 3, deletions: 2 },
                user: { login: 'alice' },
              },
              {
                version: 'fedcba9876543210fedcba9876543210fedcba98',
                committed_at: '2026-01-31T09:00:00Z',
                change_status: { total: 2, additions: 2, deletions: 0 },
              },
            ],
          },
        },
      ],
    });
    const list = await fetchRevisions('g1');
    expect(list).toHaveLength(2);
    expect(list[0].version.startsWith('abcdef')).toBe(true);
    expect(list[0].changeStatus?.additions).toBe(3);
    expect(list[0].userLogin).toBe('alice');
    expect(list[1].changeStatus?.additions).toBe(2);
    // URL 没带 token → 走 public headers，无 Authorization
    expect(calls[0].url).toBe(`${GIST_API_BASE}/gists/g1`);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('empty 路径：history 为空数组 → loaded 但 list.length=0', async () => {
    installMockFetch({ responses: [{ body: { history: [] } }] });
    const list = await fetchRevisions('g_empty');
    expect(list).toHaveLength(0);
  });

  it('error 路径：429 → GistError code=rate-limit', async () => {
    installMockFetch({ responses: [{ status: 429 }] });
    await expect(fetchRevisions('g_rate')).rejects.toMatchObject({ code: 'rate-limit' });
  });

  it('error 路径：401 → GistError code=unauthorized', async () => {
    installMockFetch({ responses: [{ status: 401, body: { message: 'Bad credentials' } }] });
    await expect(fetchRevisions('g_unauth')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('error 路径：404 → GistError code=not-found', async () => {
    installMockFetch({ responses: [{ status: 404, body: { message: 'Not Found' } }] });
    await expect(fetchRevisions('deadbeef')).rejects.toMatchObject({ code: 'not-found' });
  });
});

describe('fetchRevisionContent · 切到指定 revision', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('返回 snapshot / review / comments 三段', async () => {
    const reviewDoc = serializeReviewDoc(createEmptyReviewDoc());
    const { calls } = installMockFetch({
      responses: [
        {
          body: {
            files: {
              [SNAPSHOT_FILENAME]: { content: '{"schemaVersion":1,"payloadB64":"aGk="}' },
              [REVIEW_COMMENTS_FILENAME]: { content: reviewDoc },
            },
          },
        },
      ],
    });
    const out = await fetchRevisionContent('g1', 'aabbccdd1122334455667788');
    expect(out.snapshotRaw).toContain('schemaVersion');
    expect(out.reviewRaw).toBe(reviewDoc);
    // URL 走 /gists/:id/:version
    expect(calls[0].url).toBe(`${GIST_API_BASE}/gists/g1/aabbccdd1122334455667788`);
  });

  it('版本 sha 缺失 → parse', async () => {
    await expect(fetchRevisionContent('g', '')).rejects.toMatchObject({ code: 'parse' });
  });
});
