import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetSerialBridgeForTests,
  getSerialBridge,
  isWebSerialAvailable,
  parseSerialLine,
  type SerialSample,
} from '../serialBridge';

describe('parseSerialLine', () => {
  it('解析短协议（仅 t,Ia,Ib,Ic）', () => {
    const sample = parseSerialLine('12345,1.23,-0.85,-0.38');
    expect(sample).not.toBeNull();
    // 12345 μs → 12.345 ms
    expect(sample!.t_ms).toBeCloseTo(12.345, 3);
    expect(sample!.ia).toBeCloseTo(1.23);
    expect(sample!.ib).toBeCloseTo(-0.85);
    expect(sample!.ic).toBeCloseTo(-0.38);
    expect(sample!.iq).toBeUndefined();
  });

  it('解析全字段（t,Ia,Ib,Ic,Iq,Id,θe）', () => {
    const sample = parseSerialLine('100000, 0.5, -0.3, -0.2, 4.0, 0.1, 1.57');
    expect(sample).not.toBeNull();
    expect(sample!.t_ms).toBeCloseTo(100, 3);
    expect(sample!.iq).toBeCloseTo(4.0);
    expect(sample!.id).toBeCloseTo(0.1);
    expect(sample!.theta_e).toBeCloseTo(1.57);
  });

  it('字段不足 / 包含 NaN → null', () => {
    expect(parseSerialLine('12345,1.0')).toBeNull();
    expect(parseSerialLine('12345,abc,0,0')).toBeNull();
    expect(parseSerialLine('')).toBeNull();
    expect(parseSerialLine('   ')).toBeNull();
  });

  it('跳过 # 或 // 注释行', () => {
    expect(parseSerialLine('# header line')).toBeNull();
    expect(parseSerialLine('// debug')).toBeNull();
  });
});

describe('isWebSerialAvailable', () => {
  const originalNav = globalThis.navigator;
  afterEach(() => {
    // 还原 navigator
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNav,
      configurable: true,
      writable: true,
    });
  });

  it('navigator 中没有 serial → false', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    expect(isWebSerialAvailable()).toBe(false);
  });

  it('navigator.serial 存在 → true', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { serial: {} },
      configurable: true,
      writable: true,
    });
    expect(isWebSerialAvailable()).toBe(true);
  });
});

describe('SerialBridge — mock 模式生命周期', () => {
  beforeEach(() => {
    __resetSerialBridgeForTests();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    __resetSerialBridgeForTests();
  });

  it('connect(mock=true) 切到 mock 源 + 持续 emit', async () => {
    const bridge = getSerialBridge();
    const received: SerialSample[] = [];
    const off = bridge.onSample((s) => received.push(s));
    await bridge.connect({ mock: true });
    expect(bridge.getState().connected).toBe(true);
    expect(bridge.getState().source).toBe('mock');
    // 推 80 ms（≥ 10 帧 @ 8ms 一帧）
    vi.advanceTimersByTime(80);
    expect(received.length).toBeGreaterThanOrEqual(8);
    // 字段齐全
    expect(received[0].iq).toBeDefined();
    expect(received[0].theta_e).toBeDefined();
    off();
    await bridge.disconnect();
    expect(bridge.getState().connected).toBe(false);
    expect(bridge.getState().source).toBeNull();
  });

  it('disconnect 停掉 mock interval（不再 emit 新样本）', async () => {
    const bridge = getSerialBridge();
    const received: SerialSample[] = [];
    bridge.onSample((s) => received.push(s));
    await bridge.connect({ mock: true });
    vi.advanceTimersByTime(50);
    const before = received.length;
    expect(before).toBeGreaterThan(0);
    await bridge.disconnect();
    vi.advanceTimersByTime(200);
    expect(received.length).toBe(before);
  });

  it('浏览器不支持 Web Serial 时 connect 自动 fallback 到 mock', async () => {
    const originalNav = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    });
    // 必须重建 bridge —— 它的 connect 内部用 isWebSerialAvailable 探测
    __resetSerialBridgeForTests();
    try {
      const bridge = getSerialBridge();
      await bridge.connect({});
      expect(bridge.getState().connected).toBe(true);
      expect(bridge.getState().source).toBe('mock');
      await bridge.disconnect();
    } finally {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNav,
        configurable: true,
        writable: true,
      });
    }
  });

  it('重复 connect 不会创建第二个 mock interval', async () => {
    const bridge = getSerialBridge();
    const received: SerialSample[] = [];
    bridge.onSample((s) => received.push(s));
    await bridge.connect({ mock: true });
    await bridge.connect({ mock: true }); // no-op，已连接
    vi.advanceTimersByTime(40);
    // 8ms 一帧 → ~5 帧；如果 double-start 会是 ~10 帧
    expect(received.length).toBeLessThanOrEqual(7);
    await bridge.disconnect();
  });
});
