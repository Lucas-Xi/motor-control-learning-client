import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GIST_API_BASE,
  GIST_SCHEMA_VERSION,
  GistError,
  SNAPSHOT_FILENAME,
  COMMENTS_FILENAME,
  computeUploadSize,
  createSnapshot,
  deleteSnapshot,
  extractGistId,
  fetchSnapshot,
  listMine,
  listUser,
  updateComments,
  verifyToken,
  __decodeBase64ForTests,
  __encodeBase64ForTests,
} from '../gistCloud';

/** 把 fetch mock 简化为 { url, init } 队列 + 可编排的响应序列 */
interface MockResponseInit {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

function makeResponse({ status = 200, body, headers = {} }: MockResponseInit): Response {
  const merged = new Headers(headers);
  // 204 / 205 / 304 不允许 body
  if (status === 204 || status === 205 || status === 304) {
    return new Response(null, { status, headers: merged });
  }
  const bodyText = typeof body === 'string' ? body : JSON.stringify(body ?? {});
  return new Response(bodyText, { status, headers: merged });
}

interface MockFetchEntry {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

interface MockFetchSetup {
  responses: MockFetchEntry[];
  /** 失败时抛网络异常 */
  throwOn?: number;
}

function installMockFetch(setup: MockFetchSetup) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let i = 0;
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === 'string' ? url : url instanceof Request ? url.url : url.toString();
    calls.push({ url: urlStr, init });
    if (setup.throwOn === i) {
      i += 1;
      throw new Error('mocked network failure');
    }
    const entry = setup.responses[i] ?? { status: 200, body: {} };
    i += 1;
    return makeResponse(entry);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

describe('gistCloud · base64 helpers', () => {
  it('roundtrip ASCII', () => {
    const s = 'hello world 123';
    expect(__decodeBase64ForTests(__encodeBase64ForTests(s))).toBe(s);
  });
  it('roundtrip UTF-8（中文）', () => {
    const s = '中文混合 emoji 🚀 测试';
    expect(__decodeBase64ForTests(__encodeBase64ForTests(s))).toBe(s);
  });
});

describe('extractGistId', () => {
  it('完整 URL → id', () => {
    expect(extractGistId('https://gist.github.com/user/0123456789abcdef0123456789abcdef')).toBe(
      '0123456789abcdef0123456789abcdef',
    );
  });
  it('短形式 URL（无 user）', () => {
    expect(extractGistId('https://gist.github.com/aabbccddeeff00112233445566778899')).toBe(
      'aabbccddeeff00112233445566778899',
    );
  });
  it('裸 id 直接放行', () => {
    expect(extractGistId('aabbccddeeff00112233445566778899')).toBe(
      'aabbccddeeff00112233445566778899',
    );
  });
  it('非法输入返回空串', () => {
    expect(extractGistId('not-a-gist')).toBe('');
    expect(extractGistId('')).toBe('');
    expect(extractGistId(undefined as unknown as string)).toBe('');
  });
});

describe('computeUploadSize', () => {
  it('返回 base64 后的长度', () => {
    const size = computeUploadSize('1abcd');
    expect(size).toBeGreaterThan(0);
    // base64 长度 ≥ 原长度 4/3
    expect(size).toBeGreaterThanOrEqual(Math.ceil(5 / 3));
  });
});

describe('verifyToken', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('返回 login / rate-limit', async () => {
    const { calls } = installMockFetch({
      responses: [
        {
          body: { login: 'AliceDev' },
          headers: { 'x-ratelimit-remaining': '4999', 'x-ratelimit-limit': '5000' },
        },
      ],
    });
    const info = await verifyToken('ghp_test123');
    expect(info.login).toBe('alicedev');
    expect(info.remaining).toBe(4999);
    expect(info.limit).toBe(5000);
    expect(calls[0].url).toBe(`${GIST_API_BASE}/user`);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer ghp_test123',
    );
  });

  it('PAT 太短 → unauthorized', async () => {
    await expect(verifyToken('abc')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('401 响应 → GistError unauthorized', async () => {
    installMockFetch({ responses: [{ status: 401, body: { message: 'Bad credentials' } }] });
    await expect(verifyToken('ghp_invalid')).rejects.toMatchObject({
      code: 'unauthorized',
      status: 401,
    });
  });

  it('403 + remaining=0 → rate-limit', async () => {
    installMockFetch({
      responses: [
        {
          status: 403,
          body: { message: 'API rate limit exceeded' },
          headers: { 'x-ratelimit-remaining': '0' },
        },
      ],
    });
    await expect(verifyToken('ghp_x')).rejects.toMatchObject({
      code: 'rate-limit',
      status: 403,
    });
  });

  it('429 → rate-limit', async () => {
    installMockFetch({ responses: [{ status: 429 }] });
    await expect(verifyToken('ghp_x')).rejects.toMatchObject({ code: 'rate-limit', status: 429 });
  });

  it('网络抛错 → network', async () => {
    installMockFetch({ responses: [{}], throwOn: 0 });
    await expect(verifyToken('ghp_x')).rejects.toMatchObject({ code: 'network' });
  });
});

describe('createSnapshot', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('上传 snapshot.json + comments.md（默认私密）', async () => {
    const { calls } = installMockFetch({
      responses: [
        {
          status: 201,
          body: {
            id: 'gist_abc123',
            html_url: 'https://gist.github.com/u/gist_abc123',
            files: { [SNAPSHOT_FILENAME]: { raw_url: 'https://raw/snapshot' } },
          },
        },
      ],
    });
    const res = await createSnapshot('ghp_t', '1abcdef', {
      description: 'unit test snap',
      public: false,
      label: '测试',
    });
    expect(res.gistId).toBe('gist_abc123');
    expect(res.url).toContain('gist_abc123');
    expect(res.rawUrl).toBe('https://raw/snapshot');

    const init = calls[0].init!;
    expect(init.method).toBe('POST');
    const sent = JSON.parse(init.body as string);
    expect(sent.public).toBe(false);
    expect(sent.description).toBe('unit test snap');
    expect(sent.files[SNAPSHOT_FILENAME].content).toBeTypeOf('string');
    expect(sent.files[COMMENTS_FILENAME].content).toBeTypeOf('string');

    // 解出 snapshot.json，确认 schemaVersion 和 payloadB64 能 round-trip
    const stored = JSON.parse(sent.files[SNAPSHOT_FILENAME].content);
    expect(stored.schemaVersion).toBe(GIST_SCHEMA_VERSION);
    expect(__decodeBase64ForTests(stored.payloadB64)).toBe('1abcdef');
  });

  it('缺 token → unauthorized', async () => {
    await expect(
      createSnapshot('', 'x', { description: '', public: false }),
    ).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('API 返回缺 id → parse', async () => {
    installMockFetch({ responses: [{ status: 201, body: { html_url: 'x' } }] });
    await expect(
      createSnapshot('ghp_t', '1abc', { description: '', public: false }),
    ).rejects.toMatchObject({ code: 'parse' });
  });
});

describe('fetchSnapshot', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('成功路径：返回 encodedToken + meta + comments', async () => {
    const snap = {
      schemaVersion: GIST_SCHEMA_VERSION,
      payloadB64: __encodeBase64ForTests('1payload_token'),
      savedAt: '2026-01-01T00:00:00Z',
    };
    installMockFetch({
      responses: [
        {
          body: {
            id: 'aaaa1111bbbb2222cccc3333',
            description: 'shared snap',
            public: true,
            html_url: 'https://gist.github.com/u/gist_xyz',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-02T00:00:00Z',
            owner: { login: 'bob' },
            files: {
              [SNAPSHOT_FILENAME]: {
                content: JSON.stringify(snap),
                raw_url: 'https://raw/snap',
              },
              [COMMENTS_FILENAME]: { content: '_comment body_' },
            },
          },
        },
      ],
    });
    const res = await fetchSnapshot('aaaa1111bbbb2222cccc3333');
    expect(res.encodedToken).toBe('1payload_token');
    expect(res.meta.id).toBe('aaaa1111bbbb2222cccc3333');
    expect(res.meta.public).toBe(true);
    expect(res.meta.ownerLogin).toBe('bob');
    expect(res.comments).toBe('_comment body_');
  });

  it('404 → not-found', async () => {
    installMockFetch({ responses: [{ status: 404, body: { message: 'Not Found' } }] });
    await expect(fetchSnapshot('deadbeefdeadbeefdeadbeefdeadbeef')).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('缺 snapshot.json → parse', async () => {
    installMockFetch({
      responses: [
        {
          body: {
            id: 'aaaa1111bbbb2222cccc4444',
            files: { 'other.txt': { content: 'hi' } },
          },
        },
      ],
    });
    await expect(fetchSnapshot('aaaa1111bbbb2222cccc4444')).rejects.toMatchObject({ code: 'parse' });
  });

  it('schema 不匹配 → parse', async () => {
    installMockFetch({
      responses: [
        {
          body: {
            id: 'aaaa1111bbbb2222cccc5555',
            files: {
              [SNAPSHOT_FILENAME]: {
                content: JSON.stringify({ schemaVersion: 99, payloadB64: 'aGk=' }),
              },
            },
          },
        },
      ],
    });
    await expect(fetchSnapshot('aaaa1111bbbb2222cccc5555')).rejects.toMatchObject({ code: 'parse' });
  });

  it('无法解析 gist id → parse', async () => {
    await expect(fetchSnapshot('not-an-id')).rejects.toMatchObject({ code: 'parse' });
  });
});

describe('listMine / listUser', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('listMine 过滤掉非本客户端 gist', async () => {
    installMockFetch({
      responses: [
        {
          body: [
            {
              id: 'g1',
              description: 'mine',
              public: false,
              html_url: 'https://gist.github.com/u/g1',
              files: { [SNAPSHOT_FILENAME]: { raw_url: 'r1' } },
            },
            {
              id: 'g2',
              description: 'unrelated',
              files: { 'random.json': {} },
            },
          ],
        },
      ],
    });
    const list = await listMine('ghp_t');
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('g1');
  });

  it('listMine 缺 token → unauthorized', async () => {
    await expect(listMine('')).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('listUser 用 public headers（不带 Authorization）', async () => {
    const { calls } = installMockFetch({
      responses: [
        {
          body: [
            {
              id: 'gu1',
              files: { [SNAPSHOT_FILENAME]: {} },
              html_url: 'h',
            },
          ],
        },
      ],
    });
    const out = await listUser('Alice');
    expect(out).toHaveLength(1);
    expect(calls[0].url).toContain('/users/alice/gists');
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('deleteSnapshot / updateComments', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('delete 204 视为成功', async () => {
    installMockFetch({ responses: [{ status: 204 }] });
    await expect(deleteSnapshot('ghp_t', 'g1')).resolves.toBeUndefined();
  });

  it('updateComments PATCH 调用方法 + body 正确', async () => {
    const { calls } = installMockFetch({ responses: [{ status: 200, body: {} }] });
    await updateComments('ghp_t', 'g1', 'hello *world*');
    expect(calls[0].init?.method).toBe('PATCH');
    const sent = JSON.parse(calls[0].init?.body as string);
    expect(sent.files[COMMENTS_FILENAME].content).toBe('hello *world*');
  });

  it('updateComments 401 → unauthorized', async () => {
    installMockFetch({ responses: [{ status: 401, body: { message: 'Bad credentials' } }] });
    await expect(updateComments('ghp_t', 'g1', 'x')).rejects.toMatchObject({ code: 'unauthorized' });
  });
});

describe('GistError', () => {
  it('保留 code / status / message', () => {
    const e = new GistError('rate-limit', 'busy', 429);
    expect(e.code).toBe('rate-limit');
    expect(e.status).toBe(429);
    expect(e.message).toBe('busy');
    expect(e.name).toBe('GistError');
  });
});

describe('integration: encode → upload → fetch → decode（payload schema）', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('上传与下载 payloadB64 字段双向一致', async () => {
    // 1) create
    const created = installMockFetch({
      responses: [
        {
          status: 201,
          body: {
            id: '0123456789abcdef01234567',
            html_url: 'https://gist.github.com/u/gist_int',
            files: { [SNAPSHOT_FILENAME]: { raw_url: 'r' } },
          },
        },
      ],
    });
    await createSnapshot('ghp_t', '1abcDEF_token', { description: 'd', public: false });
    const sent = JSON.parse(created.calls[0].init?.body as string);
    const storedFile = sent.files[SNAPSHOT_FILENAME].content as string;
    vi.unstubAllGlobals();

    // 2) fetch 反序列化同一份 file
    installMockFetch({
      responses: [
        {
          body: {
            id: '0123456789abcdef01234567',
            files: { [SNAPSHOT_FILENAME]: { content: storedFile } },
          },
        },
      ],
    });
    const fetched = await fetchSnapshot('0123456789abcdef01234567');
    expect(fetched.encodedToken).toBe('1abcDEF_token');
  });
});
