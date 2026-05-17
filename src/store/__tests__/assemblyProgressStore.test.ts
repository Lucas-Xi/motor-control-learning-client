import { describe, expect, it, beforeEach } from 'vitest';
import { useAssemblyProgressStore } from '../assemblyProgressStore';

const sampleSlotIds = {
  compressorBundleId: 'highly-15hp-r32-sanken',
  inverterPartNo: 'SCM1241MF',
  strategyId: 'foc-hfi-bemf',
  loadId: 'cooling-summer-typical',
  pfcId: 'boost-single',
  separatorId: 'standard',
};

describe('assemblyProgressStore', () => {
  beforeEach(() => {
    useAssemblyProgressStore.getState().reset();
  });

  describe('challenge records', () => {
    it('recordPass writes first time, keeps best on retry', () => {
      const { recordPass } = useAssemblyProgressStore.getState();
      recordPass('c1', 5);
      expect(useAssemblyProgressStore.getState().records.c1.bestAttempts).toBe(5);
      recordPass('c1', 8);  // 8 > 5，应保留 5
      expect(useAssemblyProgressStore.getState().records.c1.bestAttempts).toBe(5);
      recordPass('c1', 3);  // 3 < 5，刷新
      expect(useAssemblyProgressStore.getState().records.c1.bestAttempts).toBe(3);
    });

    it('reset clears both records and snapshots', () => {
      const { recordPass, saveSnapshot, reset } = useAssemblyProgressStore.getState();
      recordPass('c1', 5);
      saveSnapshot('test', sampleSlotIds);
      reset();
      const s = useAssemblyProgressStore.getState();
      expect(s.records).toEqual({});
      expect(s.snapshots).toEqual([]);
    });
  });

  describe('snapshots', () => {
    it('saveSnapshot adds, deleteSnapshot removes', () => {
      const { saveSnapshot, deleteSnapshot } = useAssemblyProgressStore.getState();
      saveSnapshot('config A', sampleSlotIds);
      const snaps1 = useAssemblyProgressStore.getState().snapshots;
      expect(snaps1).toHaveLength(1);
      expect(snaps1[0].name).toBe('config A');
      deleteSnapshot(snaps1[0].id);
      expect(useAssemblyProgressStore.getState().snapshots).toHaveLength(0);
    });

    it('same name overwrites (no duplicate)', () => {
      const { saveSnapshot } = useAssemblyProgressStore.getState();
      saveSnapshot('shared', sampleSlotIds);
      saveSnapshot('shared', { ...sampleSlotIds, pfcId: 'none' });
      const snaps = useAssemblyProgressStore.getState().snapshots;
      expect(snaps).toHaveLength(1);
      expect(snaps[0].slotIds.pfcId).toBe('none');
    });

    it('exceeding 5 evicts oldest', () => {
      const { saveSnapshot } = useAssemblyProgressStore.getState();
      for (let i = 1; i <= 6; i += 1) {
        saveSnapshot(`s${i}`, sampleSlotIds);
      }
      const snaps = useAssemblyProgressStore.getState().snapshots;
      expect(snaps).toHaveLength(5);
      expect(snaps[0].name).toBe('s2');  // s1 被挤掉
      expect(snaps[4].name).toBe('s6');
    });

    it('renameSnapshot updates name only', () => {
      const { saveSnapshot, renameSnapshot } = useAssemblyProgressStore.getState();
      saveSnapshot('原名', sampleSlotIds);
      const id = useAssemblyProgressStore.getState().snapshots[0].id;
      renameSnapshot(id, '新名');
      expect(useAssemblyProgressStore.getState().snapshots[0].name).toBe('新名');
      expect(useAssemblyProgressStore.getState().snapshots[0].slotIds).toEqual(sampleSlotIds);
    });
  });

  describe('history', () => {
    const sampleEntry = {
      mode: 'sandbox' as const,
      slotIds: sampleSlotIds,
      verdict: 'pass-warn' as const,
      cop: 4.2,
      Tdischarge: 65,
      reachedTarget: true,
      faultCount: 0,
      warnCount: 2,
    };

    it('pushHistory adds entries with id + timestamp', () => {
      const { pushHistory } = useAssemblyProgressStore.getState();
      pushHistory(sampleEntry);
      const h = useAssemblyProgressStore.getState().history;
      expect(h).toHaveLength(1);
      expect(h[0].id).toBeTruthy();
      expect(h[0].timestamp).toBeGreaterThan(0);
      expect(h[0].verdict).toBe('pass-warn');
    });

    it('exceeding 20 evicts oldest', () => {
      const { pushHistory } = useAssemblyProgressStore.getState();
      for (let i = 0; i < 22; i += 1) {
        // 让 slotIds 每条不一样，避免被 dedupe 拦
        pushHistory({
          ...sampleEntry,
          slotIds: { ...sampleSlotIds, compressorBundleId: `mock-${i}` },
          cop: i + 1,
        });
      }
      const h = useAssemblyProgressStore.getState().history;
      expect(h).toHaveLength(20);
      // 最早的 2 条（cop=1,2）应被挤掉
      expect(h[0].cop).toBe(3);
      expect(h[19].cop).toBe(22);
    });

    it('dedupes identical consecutive entries (same slotIds + verdict)', () => {
      const { pushHistory } = useAssemblyProgressStore.getState();
      pushHistory(sampleEntry);
      pushHistory(sampleEntry);  // 完全一样 → 不 push
      pushHistory(sampleEntry);
      expect(useAssemblyProgressStore.getState().history).toHaveLength(1);

      // 改了 verdict 应该是新一条
      pushHistory({ ...sampleEntry, verdict: 'pass' });
      expect(useAssemblyProgressStore.getState().history).toHaveLength(2);
    });

    it('clearHistory empties array', () => {
      const { pushHistory, clearHistory } = useAssemblyProgressStore.getState();
      pushHistory(sampleEntry);
      pushHistory({ ...sampleEntry, verdict: 'fail' });
      clearHistory();
      expect(useAssemblyProgressStore.getState().history).toEqual([]);
    });

    it('reset clears history along with records and snapshots', () => {
      const { pushHistory, recordPass, saveSnapshot, reset } = useAssemblyProgressStore.getState();
      recordPass('c1', 5);
      saveSnapshot('s1', sampleSlotIds);
      pushHistory(sampleEntry);
      reset();
      const s = useAssemblyProgressStore.getState();
      expect(s.records).toEqual({});
      expect(s.snapshots).toEqual([]);
      expect(s.history).toEqual([]);
    });
  });
});
