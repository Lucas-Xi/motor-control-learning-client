import { create } from 'zustand';
import {
  getSerialBridge,
  isWebSerialAvailable,
  type SerialConnectOptions,
  type SerialSample,
} from '../utils/serialBridge';

/**
 * 实测对照 Zustand store。
 *
 * 关键设计：
 *  - buffer 是固定容量的环形数组（512 帧），超出自动丢最旧——避免长时间运行后内存爆炸；
 *  - sampleRateHz 用滑动窗口（最近 64 帧）估算，UI 上展示用；
 *  - actions 直接代理 SerialBridge 单例，store 只承担"快照 / 订阅"职责，
 *    不直接管理底层流（保持 store 纯）。
 *
 * 与 simulationStore 解耦：实测样本流是事件式（每收到一行就 push），
 * 不参与仿真时钟，因此独立 store；订阅者用切片选择器避免高频重渲染。
 */

export const RING_BUFFER_CAPACITY = 512;
const RATE_WINDOW = 64;

interface SerialStoreState {
  connected: boolean;
  source: 'mock' | 'web-serial' | null;
  portLabel: string | null;
  lastError: string | null;
  /** 浏览器是否支持 Web Serial（启动时一次性探测，避免每次按钮点击都重测）。 */
  webSerialSupported: boolean;
  /** 环形缓冲，按时间升序；新样本 push 到尾部，超容时丢最旧。 */
  buffer: SerialSample[];
  /** 实测采样率（Hz），用最近 RATE_WINDOW 帧时间跨度估算。 */
  sampleRateHz: number;
  /** Bridge 监听器解绑函数（disconnect 时调用，避免泄漏）。 */
  _unsubSample: (() => void) | null;
  _unsubState: (() => void) | null;
  connect: (opts?: SerialConnectOptions) => Promise<void>;
  disconnect: () => Promise<void>;
  pushSample: (sample: SerialSample) => void;
  clearBuffer: () => void;
}

function appendToRing(buffer: SerialSample[], sample: SerialSample): SerialSample[] {
  // 用浅拷贝 + slice，触发 React 引用变更；512 帧的拷贝在 8ms 一帧的频率下可忽略。
  if (buffer.length >= RING_BUFFER_CAPACITY) {
    return [...buffer.slice(buffer.length - RING_BUFFER_CAPACITY + 1), sample];
  }
  return [...buffer, sample];
}

function computeRate(buffer: SerialSample[]): number {
  if (buffer.length < 2) return 0;
  const start = Math.max(0, buffer.length - RATE_WINDOW);
  const a = buffer[start];
  const b = buffer[buffer.length - 1];
  const dtMs = b.t_ms - a.t_ms;
  if (dtMs <= 0) return 0;
  const frames = buffer.length - 1 - start;
  return (frames / dtMs) * 1000;
}

export const useSerialStore = create<SerialStoreState>((set, get) => ({
  connected: false,
  source: null,
  portLabel: null,
  lastError: null,
  webSerialSupported: isWebSerialAvailable(),
  buffer: [],
  sampleRateHz: 0,
  _unsubSample: null,
  _unsubState: null,

  connect: async (opts?: SerialConnectOptions) => {
    if (get().connected) return;
    const bridge = getSerialBridge();
    // 先订阅再 connect，避免连接瞬间打来的样本丢失。
    const unsubSample = bridge.onSample((sample) => {
      // 用 get().pushSample 而非闭包捕获，确保拿到最新 buffer。
      get().pushSample(sample);
    });
    const unsubState = bridge.onState((state) => {
      set({
        connected: state.connected,
        source: state.source,
        portLabel: state.portLabel,
        lastError: state.lastError,
      });
    });
    set({ _unsubSample: unsubSample, _unsubState: unsubState });
    try {
      await bridge.connect(opts);
    } catch (err) {
      // 连接失败：解绑监听 + 把 lastError 推给 UI。
      unsubSample();
      unsubState();
      const msg = err instanceof Error ? err.message : String(err);
      set({
        _unsubSample: null,
        _unsubState: null,
        lastError: msg,
        connected: false,
        source: null,
        portLabel: null,
      });
      throw err;
    }
  },

  disconnect: async () => {
    const { _unsubSample, _unsubState } = get();
    if (_unsubSample) _unsubSample();
    if (_unsubState) _unsubState();
    set({ _unsubSample: null, _unsubState: null });
    const bridge = getSerialBridge();
    await bridge.disconnect();
    set({ connected: false, source: null, portLabel: null });
  },

  pushSample: (sample) => {
    const buffer = appendToRing(get().buffer, sample);
    set({ buffer, sampleRateHz: computeRate(buffer) });
  },

  clearBuffer: () => set({ buffer: [], sampleRateHz: 0 }),
}));
