import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Download, Pause, Play, Plug, PlugZap, Radio } from 'lucide-react';
import { Card } from '../ui/Card';
import { useSerialStore } from '../../store/serialStore';
import { downloadText, timestamp } from '../../utils/download';
import { formatNumber } from '../../utils/format';

/**
 * SerialCompareCardShell：4 张模块内"理论 vs 实测"对照卡的共享外壳。
 *
 * 抽出的公共部分：
 *   1. 连接状态指示（连接按钮 + 数据源 chip + 采样率）
 *   2. 时基切换（10 ms / 100 ms / 1 s，三选一 radio group）
 *   3. 暂停 / 继续（影响 UI 渲染流，不影响后台 buffer 写入；通过 paused state 暴露给 child）
 *   4. CSV 导出（onExportCsv 由 child 决定文件内容）
 *   5. 无数据 fallback（buffer 空时画占位）
 *   6. Web Serial 不支持时的 banner
 *
 * 业务部分（每张卡自填）：通过 `children` 渲染图表区 + KPI 区。
 *
 * a11y：
 *   - 所有按钮 keyboard-focusable + aria-label / aria-pressed；
 *   - radiogroup 用 role="radiogroup"，每个选项 role="radio" + aria-checked；
 *   - 颜色 + 形状（•/▲/◆）双通道：交给具体 KPI 卡处理。
 */

export type SerialTimebase = '10ms' | '100ms' | '1s';
export const TIMEBASE_OPTIONS: ReadonlyArray<{ value: SerialTimebase; label: string; windowMs: number }> = [
  { value: '10ms', label: '10 ms / div', windowMs: 100 },
  { value: '100ms', label: '100 ms / div', windowMs: 1000 },
  { value: '1s', label: '1 s / div', windowMs: 10000 },
];

export interface SerialCompareCardShellProps {
  /** 卡片标题（短，例如 "Iq/Id 对照"） */
  title: string;
  /** Card eyebrow（小标签，可选） */
  eyebrow?: string;
  /** 当前时基（受控） */
  timebase: SerialTimebase;
  onTimebaseChange: (next: SerialTimebase) => void;
  /** UI 是否暂停（受控） */
  paused: boolean;
  onPausedChange: (next: boolean) => void;
  /** 导出 CSV：返回 (filename, csvText)。返回 null 表示当前没数据可导出。 */
  onExportCsv?: () => { filename: string; csv: string } | null;
  /** 自定义额外右上角按钮（例如"故障注入"按钮） */
  extraAction?: ReactNode;
  /** 业务主体 */
  children: ReactNode;
}

export function SerialCompareCardShell({
  title,
  eyebrow,
  timebase,
  onTimebaseChange,
  paused,
  onPausedChange,
  onExportCsv,
  extraAction,
  children,
}: SerialCompareCardShellProps) {
  const connected = useSerialStore((s) => s.connected);
  const source = useSerialStore((s) => s.source);
  const portLabel = useSerialStore((s) => s.portLabel);
  const sampleRateHz = useSerialStore((s) => s.sampleRateHz);
  const bufferLen = useSerialStore((s) => s.buffer.length);
  const lastError = useSerialStore((s) => s.lastError);
  const webSerialSupported = useSerialStore((s) => s.webSerialSupported);
  const connect = useSerialStore((s) => s.connect);
  const disconnect = useSerialStore((s) => s.disconnect);

  const [pending, setPending] = useState(false);

  // 离开页面 / 模块切换时不自动断开 —— 让 17 号模块的 SerialBenchPanel 主导生命周期。
  // 4 张卡只是"借用"已连接的数据流。仅在组件 unmount 时清理 pending flag。
  useEffect(() => {
    return () => setPending(false);
  }, []);

  const onToggleConnect = async () => {
    if (pending) return;
    setPending(true);
    try {
      if (connected) {
        await disconnect();
      } else {
        await connect({ baud: 921600, mock: !webSerialSupported });
      }
    } catch {
      // 错误已记入 store.lastError
    } finally {
      setPending(false);
    }
  };

  const onExport = () => {
    if (!onExportCsv) return;
    const result = onExportCsv();
    if (!result) return;
    downloadText(`${result.filename}-${timestamp()}.csv`, result.csv, 'text/csv;charset=utf-8');
  };

  const sourceLabel =
    source === 'web-serial'
      ? `Web Serial · ${portLabel ?? ''}`
      : source === 'mock'
        ? 'Mock 数据源（仿真合成）'
        : '未连接';
  const sourceTone =
    source === 'web-serial' ? 'text-accent-measure' : source === 'mock' ? 'text-accent-primary' : 'text-ink-secondary';

  return (
    <Card title={title} eyebrow={eyebrow ?? 'serial compare'} density="compact">
      {/* Banner：Web Serial 不支持 */}
      {!webSerialSupported && (
        <p className="mb-2 rounded-lg border border-accent-warn/40 bg-accent-warn/10 px-3 py-1.5 text-caption text-accent-warn">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" aria-hidden />
          当前浏览器不支持 Web Serial · 自动 fallback 到 Mock 数据源
        </p>
      )}
      {lastError && (
        <p
          className="mb-2 rounded-lg border border-accent-fault/40 bg-accent-fault/10 px-3 py-1.5 text-caption text-accent-fault"
          role="alert"
        >
          串口错误：{lastError}
        </p>
      )}

      {/* 顶部状态条 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onToggleConnect}
          disabled={pending}
          aria-label={connected ? '断开串口连接' : '连接串口设备'}
          aria-pressed={connected}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-caption font-medium transition-colors disabled:opacity-50 ${
            connected
              ? 'border-accent-measure/60 bg-accent-measure/15 text-accent-measure'
              : 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary hover:bg-accent-primary/20'
          }`}
        >
          {connected ? <PlugZap className="h-4 w-4" /> : <Plug className="h-4 w-4" />}
          <span>{connected ? '已连接' : webSerialSupported ? '连接' : '启动 Mock'}</span>
        </button>

        <span className={`flex items-center gap-1.5 truncate text-caption ${sourceTone}`} title={sourceLabel}>
          <Radio className="h-3.5 w-3.5" aria-hidden />
          {sourceLabel}
        </span>

        <span className="text-caption text-ink-muted">
          {formatNumber(sampleRateHz, 1)} Hz · {bufferLen} 帧
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          {/* 时基切换 radiogroup */}
          <div
            role="radiogroup"
            aria-label="时基切换"
            className="inline-flex overflow-hidden rounded-md border border-line-subtle"
          >
            {TIMEBASE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={timebase === opt.value}
                aria-label={`时基 ${opt.label}`}
                onClick={() => onTimebaseChange(opt.value)}
                className={`px-2 py-1 text-caption transition ${
                  timebase === opt.value
                    ? 'bg-accent-primary/20 text-accent-primary'
                    : 'bg-bg-base text-ink-muted hover:bg-bg-surface'
                }`}
              >
                {opt.value}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onPausedChange(!paused)}
            aria-label={paused ? '继续 UI 渲染' : '暂停 UI 渲染'}
            aria-pressed={paused}
            className={`flex items-center gap-1 rounded-md border px-2 py-1 text-caption transition ${
              paused
                ? 'border-accent-warn/50 bg-accent-warn/10 text-accent-warn'
                : 'border-line-subtle bg-bg-base text-ink-secondary hover:border-line-strong'
            }`}
          >
            {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {paused ? '继续' : '暂停'}
          </button>

          {onExportCsv && (
            <button
              type="button"
              onClick={onExport}
              disabled={bufferLen === 0}
              aria-label="导出当前数据为 CSV"
              className="flex items-center gap-1 rounded-md border border-accent-primary/60 bg-accent-primary/10 px-2 py-1 text-caption text-accent-primary hover:bg-accent-primary/20 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              CSV
            </button>
          )}

          {extraAction}
        </div>
      </div>

      {/* 业务主体 / 或 fallback */}
      {bufferLen === 0 ? (
        <div className="flex h-32 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-subtle bg-bg-base text-center text-caption text-ink-muted">
          <p>暂无实测数据</p>
          <p>点击左上"{webSerialSupported ? '连接' : '启动 Mock'}"开始采样</p>
        </div>
      ) : (
        children
      )}
    </Card>
  );
}

/**
 * 把 SerialStore.buffer 中 t_ms 升序的样本，按当前时基 windowMs 裁出尾部窗口。
 *
 * 输出第一帧的 t_ms 归零，方便图表 X 轴显示 0..windowMs。
 *
 * 这个工具函数被 4 张卡共享：保证视觉行为一致（"最近 windowMs 的滚动窗口"）。
 */
export function selectWindowedSamples<T extends { t_ms: number }>(
  samples: T[],
  windowMs: number,
): T[] {
  if (samples.length === 0) return [];
  const latest = samples[samples.length - 1].t_ms;
  const cutoff = latest - windowMs;
  // 从尾部往前找第一个 t < cutoff 的位置
  let startIdx = 0;
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    if (samples[i].t_ms < cutoff) {
      startIdx = i + 1;
      break;
    }
  }
  const tail = samples.slice(startIdx);
  if (tail.length === 0) return [];
  const t0 = tail[0].t_ms;
  return tail.map((s) => ({ ...s, t_ms: s.t_ms - t0 }));
}

/** 取窗口 windowMs（ms） —— 给 child 共享 */
export function timebaseToWindowMs(tb: SerialTimebase): number {
  return TIMEBASE_OPTIONS.find((o) => o.value === tb)?.windowMs ?? 1000;
}

/**
 * 把"live rows"按 paused 标志冻结：仅在 paused: false → true 切换的瞬间
 * 拍一次快照；paused=false 时透传 live。
 *
 * 用 ref + edge-trigger effect，避免 useMemo 内 setState 触发 ESLint 警告 / React 警告。
 *
 * 4 张卡共用，避免重复逻辑。
 */
export function useFrozenRows<T>(live: T[], paused: boolean): T[] {
  const frozenRef = useRef<T[] | null>(null);
  const prevPausedRef = useRef<boolean>(false);
  useEffect(() => {
    if (paused && !prevPausedRef.current) frozenRef.current = live;
    if (!paused) frozenRef.current = null;
    prevPausedRef.current = paused;
  }, [paused, live]);
  return paused && frozenRef.current ? frozenRef.current : live;
}
