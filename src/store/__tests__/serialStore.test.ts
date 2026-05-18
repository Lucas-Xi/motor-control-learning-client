import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RING_BUFFER_CAPACITY, useSerialStore } from '../serialStore';
import { __resetSerialBridgeForTests } from '../../utils/serialBridge';
import type { SerialSample } from '../../utils/serialBridge';

function makeSample(t_ms: number, ia = 0, ib = 0, ic = 0): SerialSample {
  return { t_ms, ia, ib, ic };
}

describe('useSerialStore — 状态机', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useSerialStore.getState().clearBuffer();
    // 确保 store 内部 _unsub* 清干净，避免上次 mock connect 漏的 listener 污染本用例
    void useSerialStore.getState().disconnect();
    __resetSerialBridgeForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
    __resetSerialBridgeForTests();
  });

  it('初始 state：未连接 + 空 buffer', () => {
    const s = useSerialStore.getState();
    expect(s.connected).toBe(false);
    expect(s.source).toBeNull();
    expect(s.buffer).toEqual([]);
    expect(s.sampleRateHz).toBe(0);
  });

  it('pushSample 追加到 buffer + 重算采样率', () => {
    const { pushSample } = useSerialStore.getState();
    pushSample(makeSample(0));
    pushSample(makeSample(10));
    pushSample(makeSample(20));
    const s = useSerialStore.getState();
    expect(s.buffer).toHaveLength(3);
    // 3 帧、20 ms → 2 / 0.02 = 100 Hz
    expect(s.sampleRateHz).toBeCloseTo(100, 0);
  });

  it('buffer overflow → 丢最旧（容量限制）', () => {
    const { pushSample } = useSerialStore.getState();
    // 推 RING_BUFFER_CAPACITY + 30 帧
    for (let i = 0; i < RING_BUFFER_CAPACITY + 30; i++) {
      pushSample(makeSample(i, i));
    }
    const s = useSerialStore.getState();
    expect(s.buffer).toHaveLength(RING_BUFFER_CAPACITY);
    // 最旧 30 帧应被丢弃 → 首帧 t_ms 应为 30
    expect(s.buffer[0].t_ms).toBe(30);
    expect(s.buffer[s.buffer.length - 1].t_ms).toBe(RING_BUFFER_CAPACITY + 29);
  });

  it('clearBuffer 清空 buffer + 采样率归零', () => {
    const { pushSample, clearBuffer } = useSerialStore.getState();
    pushSample(makeSample(0));
    pushSample(makeSample(10));
    clearBuffer();
    expect(useSerialStore.getState().buffer).toEqual([]);
    expect(useSerialStore.getState().sampleRateHz).toBe(0);
  });

  it('connect(mock=true) 切到 connected + source=mock + 样本入 buffer', async () => {
    await useSerialStore.getState().connect({ mock: true });
    expect(useSerialStore.getState().connected).toBe(true);
    expect(useSerialStore.getState().source).toBe('mock');
    // 推时钟以让 mock 出几帧
    vi.advanceTimersByTime(48);
    const buf = useSerialStore.getState().buffer;
    expect(buf.length).toBeGreaterThan(0);
    await useSerialStore.getState().disconnect();
  });

  it('disconnect 切回未连接 + 停止样本流', async () => {
    await useSerialStore.getState().connect({ mock: true });
    vi.advanceTimersByTime(32);
    const before = useSerialStore.getState().buffer.length;
    expect(before).toBeGreaterThan(0);
    await useSerialStore.getState().disconnect();
    expect(useSerialStore.getState().connected).toBe(false);
    expect(useSerialStore.getState().source).toBeNull();
    vi.advanceTimersByTime(200);
    // disconnect 之后 buffer 不应再增长
    expect(useSerialStore.getState().buffer.length).toBe(before);
  });

  it('重复 connect 不重复建立监听（无重复样本）', async () => {
    await useSerialStore.getState().connect({ mock: true });
    await useSerialStore.getState().connect({ mock: true });
    vi.advanceTimersByTime(40);
    const buf = useSerialStore.getState().buffer;
    // 8ms 一帧、40ms → ~5 帧；double listener 会让计数翻倍
    expect(buf.length).toBeLessThanOrEqual(7);
    await useSerialStore.getState().disconnect();
  });
});
