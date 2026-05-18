/**
 * Serial bridge：浏览器 Web Serial API 抽象层（实测对照模块）。
 *
 * 设计目标：
 *  - 把 navigator.serial 的细节（端口 / readable 流 / TextDecoder / 行拆分）
 *    包成一个回调驱动的接口，让 React 组件 / Zustand store 不直接接触底层流。
 *  - 提供 mock 模式（Web Serial 不可用 或 用户主动选择）：复用
 *    `simulateCurrentLoop` 生成"假板子"样本流，让没有真板也能看到完整 UI。
 *  - 浏览器兼容性：Web Serial 仅在 Chromium 系（Chrome / Edge / Opera）可用；
 *    Safari / Firefox 走 mock 兜底，不引发任何 console 异常。
 *
 * 协议：板端发送 ASCII 行，每行字段以英文逗号分隔，行尾 `\n`：
 *   t_us, Ia, Ib, Ic [, Iq, Id, theta_e]
 *
 * 单位约定：
 *   - 时间字段 t_us 单位是微秒（μs），本层换算成 ms 暴露给上层
 *   - 三相电流单位 A
 *   - theta_e 单位 rad（电角度）
 */

import { simulateCurrentLoop } from '../simulation/math/motorModel';

/** 一帧串口采样，已归一化到统一单位（时间 ms、电流 A、角度 rad）。 */
export interface SerialSample {
  t_ms: number;
  ia: number;
  ib: number;
  ic: number;
  iq?: number;
  id?: number;
  /** 电角度，单位 rad */
  theta_e?: number;
}

/** 连接配置；波特率默认值 921600，对齐 STM32 板端文档示例。 */
export interface SerialConnectOptions {
  baud?: 921600 | 460800 | 230400 | 115200;
  /** 强制 mock 模式（不弹端口选择对话框）。用于无真板的演示 / 单测。 */
  mock?: boolean;
}

export type SampleListener = (sample: SerialSample) => void;
export type StateListener = (state: SerialBridgeState) => void;

export interface SerialBridgeState {
  connected: boolean;
  /** "mock" 表示走假数据；"web-serial" 表示走真端口；null 表示未连接。 */
  source: 'mock' | 'web-serial' | null;
  /** 端口显示名（厂商 + 产品 ID 拼接）。Web Serial 拿不到 COM 编号，只能给 USB info。 */
  portLabel: string | null;
  lastError: string | null;
}

/**
 * 检测 Web Serial 是否可用。Safari / Firefox / iOS WebKit 均会返回 false；
 * Chromium 桌面端 + Edge 返回 true。
 *
 * 用 `'serial' in navigator` 而非 typeof，避免 SSR 环境下访问 navigator 报错。
 */
export function isWebSerialAvailable(): boolean {
  if (typeof navigator === 'undefined') return false;
  return 'serial' in navigator;
}

/** 把一行 ASCII 文本解析成 SerialSample；非法行返回 null。 */
export function parseSerialLine(line: string): SerialSample | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) return null;
  const parts = trimmed.split(',').map((s) => s.trim());
  if (parts.length < 4) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => Number.isNaN(n))) return null;
  const sample: SerialSample = {
    t_ms: nums[0] / 1000, // 板端 μs → ms
    ia: nums[1],
    ib: nums[2],
    ic: nums[3],
  };
  if (parts.length >= 7) {
    sample.iq = nums[4];
    sample.id = nums[5];
    sample.theta_e = nums[6];
  }
  return sample;
}

/**
 * Serial bridge 单例工厂。
 *
 * 用单例（而不是按需 new）是因为 navigator.serial.requestPort 必须在用户手势
 * 上下文调用，多实例会让事件归属混乱。Store 通过 `getSerialBridge()` 拿到同一个实例。
 */
class SerialBridge {
  private state: SerialBridgeState = {
    connected: false,
    source: null,
    portLabel: null,
    lastError: null,
  };
  private sampleListeners = new Set<SampleListener>();
  private stateListeners = new Set<StateListener>();
  private port: unknown = null; // SerialPort (Web Serial)；any-typed 避免 lib.dom 缺类型时报错
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private readTask: Promise<void> | null = null;
  private mockTimer: ReturnType<typeof setInterval> | null = null;
  private aborted = false;

  getState(): SerialBridgeState {
    return this.state;
  }

  onSample(cb: SampleListener): () => void {
    this.sampleListeners.add(cb);
    return () => this.sampleListeners.delete(cb);
  }

  onState(cb: StateListener): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  private emitSample(sample: SerialSample) {
    for (const cb of this.sampleListeners) cb(sample);
  }

  private setState(patch: Partial<SerialBridgeState>) {
    this.state = { ...this.state, ...patch };
    for (const cb of this.stateListeners) cb(this.state);
  }

  /**
   * 弹原生端口选择对话框并连接；不可用 / 用户取消时抛错并回到 disconnected。
   *
   * 若 opts.mock=true 或浏览器不支持 Web Serial，自动走 mock 通道。
   */
  async connect(opts: SerialConnectOptions = {}): Promise<void> {
    if (this.state.connected) return;
    const useMock = opts.mock === true || !isWebSerialAvailable();
    this.aborted = false;
    if (useMock) {
      this.startMockStream();
      const reason = opts.mock === true ? 'mock' : 'no-web-serial';
      this.setState({
        connected: true,
        source: 'mock',
        portLabel: reason === 'no-web-serial' ? '浏览器不支持 Web Serial · 已切换 mock' : 'Mock 数据源',
        lastError: null,
      });
      return;
    }
    try {
      // navigator.serial 在 lib.dom 中没有 TS 类型（截至 2026 仍是 working draft），
      // 用 unknown 桥接 + 局部 any-cast，保持其它代码严格类型。
      const nav = navigator as unknown as {
        serial: {
          requestPort(): Promise<unknown>;
        };
      };
      const port = (await nav.serial.requestPort()) as {
        open(options: { baudRate: number }): Promise<void>;
        readable: ReadableStream<Uint8Array>;
        getInfo(): { usbVendorId?: number; usbProductId?: number };
      };
      await port.open({ baudRate: opts.baud ?? 921600 });
      this.port = port;
      const info = port.getInfo();
      const label =
        info.usbVendorId != null
          ? `USB ${info.usbVendorId.toString(16)}:${(info.usbProductId ?? 0).toString(16)}`
          : '串口设备';
      this.setState({ connected: true, source: 'web-serial', portLabel: label, lastError: null });
      this.readTask = this.pumpReader(port.readable);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState({ connected: false, source: null, portLabel: null, lastError: msg });
      throw err;
    }
  }

  /** 关闭端口 / 停 mock，清干净所有底层资源。 */
  async disconnect(): Promise<void> {
    this.aborted = true;
    if (this.mockTimer) {
      clearInterval(this.mockTimer);
      this.mockTimer = null;
    }
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch {
        // 已经取消 / 流关闭 —— 忽略
      }
      try {
        this.reader.releaseLock();
      } catch {
        // 同上
      }
      this.reader = null;
    }
    if (this.readTask) {
      try {
        await this.readTask;
      } catch {
        // 流被取消时常见 AbortError —— 静默
      }
      this.readTask = null;
    }
    if (this.port) {
      try {
        await (this.port as { close: () => Promise<void> }).close();
      } catch {
        // 端口可能已物理拔出 —— 忽略
      }
      this.port = null;
    }
    this.setState({ connected: false, source: null, portLabel: null });
  }

  /**
   * 内部：连续从 readable 拉数据，逐行解析后 emit。
   *
   * 实现细节：
   *  - 用 TextDecoderStream 把 Uint8Array → string；
   *  - 自己做行缓冲（不依赖 LineBreakStream，因为不是所有浏览器版本都暴露
   *    TransformStream 的 line-break 内置实现，自己写更稳）。
   */
  private async pumpReader(stream: ReadableStream<Uint8Array>): Promise<void> {
    // TextDecoderStream 在不同 TS lib 版本对 ReadableWritablePair 的泛型推断不一致
    // (BufferSource vs Uint8Array<ArrayBufferLike>)，通过 unknown 桥接避免在 strict 下挂掉。
    const decoder = new TextDecoderStream();
    const textStream = (stream as unknown as ReadableStream<BufferSource>).pipeThrough(decoder);
    const reader = textStream.getReader();
    this.reader = reader;
    let buffer = '';
    try {
      while (!this.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        buffer += value;
        let idx = buffer.indexOf('\n');
        while (idx >= 0) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          const sample = parseSerialLine(line);
          if (sample) this.emitSample(sample);
          idx = buffer.indexOf('\n');
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState({ lastError: msg });
    }
  }

  /**
   * Mock 数据源：复用 simulateCurrentLoop 跑一次 60ms 仿真，循环 replay。
   *
   * - 把仿真结果（id/iq + 模拟一个旋转角度）逐帧 emit；
   * - 用 setInterval 8ms 一帧（≈125 Hz）模拟真板上传速度；
   * - 由仿真 id/iq 反算 ia/ib/ic（反 Park 反 Clarke），保证字段齐全。
   *
   * 不引入新依赖、不动 math 层。
   */
  private startMockStream(): void {
    // 用一组教学合理的 PI 增益跑出一段电流响应作为重复 frame。
    const samples = simulateCurrentLoop(0, 4, { kp: 0.8, ki: 50, kd: 0 }, 0.12);
    if (samples.length === 0) return;
    let idx = 0;
    let t0 = 0;
    const frameMs = 8;
    this.mockTimer = setInterval(() => {
      if (this.aborted) return;
      const s = samples[idx];
      idx = (idx + 1) % samples.length;
      if (idx === 0) t0 += samples[samples.length - 1].t; // 跨回卷加偏
      // 假设转速恒定 → 由帧序号反推一个电角度（仅用作 UI 演示）。
      const theta = ((t0 + s.t) * 0.025) % (2 * Math.PI);
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      // 反 Park：dq → αβ
      const ialpha = s.id * cosT - s.iq * sinT;
      const ibeta = s.id * sinT + s.iq * cosT;
      // 反 Clarke：αβ → abc（amplitude-invariant）
      const ia = ialpha;
      const ib = -0.5 * ialpha + (Math.sqrt(3) / 2) * ibeta;
      const ic = -0.5 * ialpha - (Math.sqrt(3) / 2) * ibeta;
      this.emitSample({
        t_ms: t0 + s.t,
        ia,
        ib,
        ic,
        iq: s.iq,
        id: s.id,
        theta_e: theta,
      });
    }, frameMs);
  }
}

// 单例实例 + 工厂访问 —— 让单测可以通过 `__resetSerialBridge` 重建一份干净的。
let instance: SerialBridge | null = null;

export function getSerialBridge(): SerialBridge {
  if (!instance) instance = new SerialBridge();
  return instance;
}

/** 仅供测试用：销毁单例 + 清监听。生产代码不要调。 */
export function __resetSerialBridgeForTests(): void {
  if (instance) {
    void instance.disconnect();
  }
  instance = null;
}

export type { SerialBridge };
