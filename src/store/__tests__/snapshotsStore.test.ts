import { describe, expect, it } from 'vitest';
import { parseSnapshots, serializeSnapshots, type BenchSnapshot } from '../snapshotsStore';

const fixture: BenchSnapshot = {
  id: 'snap_abc',
  label: '空调高温',
  color: '#34d6ff',
  refrigerant: 'R32',
  states: [
    { index: 1, P: 0.9, T: 10, h: 410, label: '吸气过热' },
    { index: 2, P: 3.0, T: 95, h: 460, label: '排气' },
    { index: 3, P: 3.0, T: 45, h: 270, label: '冷凝过冷' },
    { index: 4, P: 0.9, T: 5, h: 270, label: '节流后两相' },
  ],
  cop: 3.5,
  Wcomp: 0.6,
  Qc: 2.1,
  pressureRatio: 3.3,
  Tdischarge: 95,
  takenAt: 1234567890,
  overlay: true,
};

describe('serialize / parse 快照', () => {
  it('serialize 包出 schema + version 头', () => {
    const text = serializeSnapshots([fixture]);
    const obj = JSON.parse(text);
    expect(obj.schema).toBe('compressor-bench-snapshots');
    expect(obj.version).toBe(1);
    expect(Array.isArray(obj.snapshots)).toBe(true);
    expect(obj.snapshots).toHaveLength(1);
  });

  it('parse(serialize(x)) 返回等价数组', () => {
    const text = serializeSnapshots([fixture]);
    const back = parseSnapshots(text);
    expect(back).toHaveLength(1);
    expect(back[0].id).toBe(fixture.id);
    expect(back[0].cop).toBe(fixture.cop);
    expect(back[0].states).toHaveLength(4);
  });

  it('空数组也能往返', () => {
    const text = serializeSnapshots([]);
    expect(parseSnapshots(text)).toEqual([]);
  });

  it('非 JSON → 抛"不是合法 JSON"', () => {
    expect(() => parseSnapshots('not-json')).toThrow(/JSON/);
  });

  it('schema 不匹配 → 抛"schema 不匹配"', () => {
    const bad = JSON.stringify({ schema: 'other-thing', version: 1, snapshots: [] });
    expect(() => parseSnapshots(bad)).toThrow(/schema/);
  });

  it('version 不兼容 → 抛"版本不兼容"', () => {
    const bad = JSON.stringify({
      schema: 'compressor-bench-snapshots',
      version: 99,
      snapshots: [],
    });
    expect(() => parseSnapshots(bad)).toThrow(/版本/);
  });

  it('snapshots 不是数组 → 抛错', () => {
    const bad = JSON.stringify({
      schema: 'compressor-bench-snapshots',
      version: 1,
      snapshots: 'oops',
    });
    expect(() => parseSnapshots(bad)).toThrow(/snapshots/);
  });

  it('某条 snapshot 缺必要字段 → 抛错', () => {
    const bad = JSON.stringify({
      schema: 'compressor-bench-snapshots',
      version: 1,
      snapshots: [{ id: 'x', label: 'y', states: [1, 2, 3, 4] /* cop 缺失 */ }],
    });
    expect(() => parseSnapshots(bad)).toThrow();
  });
});
