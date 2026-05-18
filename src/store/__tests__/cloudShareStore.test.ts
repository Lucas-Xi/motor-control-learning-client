import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLOUD_SHARE_SESSION_KEYS,
  __resetCloudShareStoreForTests,
  useCloudShareStore,
} from '../cloudShareStore';

/** 一个简易内存 sessionStorage，用于断言 PAT / team / sync 落盘行为 */
function installMemoryStorage(): {
  store: Record<string, string>;
  uninstall: () => void;
} {
  const store: Record<string, string> = {};
  const api = {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
  vi.stubGlobal('sessionStorage', api);
  return { store, uninstall: () => vi.unstubAllGlobals() };
}

describe('useCloudShareStore', () => {
  beforeEach(() => {
    __resetCloudShareStoreForTests();
  });

  it('初始状态：未绑定 / 无团队 / 实时同步关', () => {
    const s = useCloudShareStore.getState();
    expect(s.pat).toBe('');
    expect(s.ghLogin).toBe('');
    expect(s.team).toEqual([]);
    expect(s.realtimeSync).toBe(false);
    expect(s.connectedTabs).toBe(1);
  });

  it('setPat 写入 sessionStorage（而非 localStorage）', () => {
    const mem = installMemoryStorage();
    try {
      useCloudShareStore.getState().setPat('ghp_test_token');
      expect(useCloudShareStore.getState().pat).toBe('ghp_test_token');
      expect(mem.store[CLOUD_SHARE_SESSION_KEYS.pat]).toBe('ghp_test_token');
    } finally {
      mem.uninstall();
    }
  });

  it('clearPat 清掉所有身份字段 + 移除 sessionStorage', () => {
    const mem = installMemoryStorage();
    try {
      const st = useCloudShareStore.getState();
      st.setPat('ghp_x');
      st.setIdentity('alice', 100, 5000);
      expect(useCloudShareStore.getState().ghLogin).toBe('alice');
      useCloudShareStore.getState().clearPat();
      const after = useCloudShareStore.getState();
      expect(after.pat).toBe('');
      expect(after.ghLogin).toBe('');
      expect(after.rateLimitRemaining).toBe(0);
      expect(mem.store[CLOUD_SHARE_SESSION_KEYS.pat]).toBeUndefined();
    } finally {
      mem.uninstall();
    }
  });

  it('setIdentity 归一化 login 为小写', () => {
    useCloudShareStore.getState().setIdentity('AliceDev', 10, 60);
    const s = useCloudShareStore.getState();
    expect(s.ghLogin).toBe('alicedev');
    expect(s.rateLimitRemaining).toBe(10);
    expect(s.rateLimitLimit).toBe(60);
  });

  it('addTeamMember 校验用户名格式', () => {
    const r1 = useCloudShareStore.getState().addTeamMember('');
    expect(r1.ok).toBe(false);
    const r2 = useCloudShareStore.getState().addTeamMember('not_valid!');
    expect(r2.ok).toBe(false);
    const r3 = useCloudShareStore.getState().addTeamMember('alice-dev');
    expect(r3.ok).toBe(true);
    expect(useCloudShareStore.getState().team).toHaveLength(1);
  });

  it('addTeamMember 同名去重', () => {
    useCloudShareStore.getState().addTeamMember('alice');
    const r = useCloudShareStore.getState().addTeamMember('Alice');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('已在');
  });

  it('addTeamMember 上限 5 人', () => {
    const st = useCloudShareStore.getState();
    for (let i = 0; i < 5; i++) st.addTeamMember(`user${i}`);
    expect(useCloudShareStore.getState().team).toHaveLength(5);
    const r = useCloudShareStore.getState().addTeamMember('user5');
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('上限');
  });

  it('removeTeamMember 按 username 删除', () => {
    const st = useCloudShareStore.getState();
    st.addTeamMember('alice');
    st.addTeamMember('bob');
    useCloudShareStore.getState().removeTeamMember('Alice');
    const t = useCloudShareStore.getState().team;
    expect(t).toHaveLength(1);
    expect(t[0].username).toBe('bob');
  });

  it('setRealtimeSync 关闭时把 connectedTabs 复位到 1', () => {
    useCloudShareStore.getState().setRealtimeSync(true);
    useCloudShareStore.getState().setConnectedTabs(4);
    expect(useCloudShareStore.getState().connectedTabs).toBe(4);
    useCloudShareStore.getState().setRealtimeSync(false);
    expect(useCloudShareStore.getState().realtimeSync).toBe(false);
    expect(useCloudShareStore.getState().connectedTabs).toBe(1);
  });

  it('setConnectedTabs 下限 1', () => {
    useCloudShareStore.getState().setConnectedTabs(-5);
    expect(useCloudShareStore.getState().connectedTabs).toBe(1);
    useCloudShareStore.getState().setConnectedTabs(3.7);
    expect(useCloudShareStore.getState().connectedTabs).toBe(3);
  });

  it('team 落盘到 sessionStorage（不到 localStorage）', () => {
    const mem = installMemoryStorage();
    try {
      useCloudShareStore.getState().addTeamMember('alice', '小张');
      expect(mem.store[CLOUD_SHARE_SESSION_KEYS.team]).toBeDefined();
      const parsed = JSON.parse(mem.store[CLOUD_SHARE_SESSION_KEYS.team]);
      expect(parsed[0].username).toBe('alice');
      expect(parsed[0].alias).toBe('小张');
    } finally {
      mem.uninstall();
    }
  });

  it('realtimeSync 落盘到 sessionStorage', () => {
    const mem = installMemoryStorage();
    try {
      useCloudShareStore.getState().setRealtimeSync(true);
      expect(mem.store[CLOUD_SHARE_SESSION_KEYS.sync]).toBe('1');
      useCloudShareStore.getState().setRealtimeSync(false);
      expect(mem.store[CLOUD_SHARE_SESSION_KEYS.sync]).toBeUndefined();
    } finally {
      mem.uninstall();
    }
  });
});
