import { Activity, BarChart3, Crosshair, Download, Eye, EyeOff, Pause, Play, Zap } from 'lucide-react';
import { useMemo } from 'react';

/**
 * 示波器风格控件条：通道开关 + 时基选择 + 冻结按钮 + 实时测量。
 *
 * 设计目标：让滚动波形（ThreePhase / DQ / BenchScope）有真实示波器的"调旋钮"感，
 * 而不是只看默认窗口里的曲线。教学上 Vpp / RMS / 时基切换都是工程师必备直觉。
 */

export interface ScopeChannel {
  key: string;
  label: string;          // 短标签，例如 "Ia"
  unit?: string;          // "A" / "V" / "°C"
  color: string;          // hex 或 rgb()
  /** 序列原始数据；用于 Vpp / RMS 计算 */
  series: number[];
}

interface Props {
  /** 当前时基（窗口总宽度 ms） */
  windowMs: number;
  /** 可选时基（窗口宽度 ms）—— 通常给 5 档：30/60/100/200/500 */
  windowOptions?: number[];
  onWindowChange: (ms: number) => void;
  channels: ScopeChannel[];
  /** 可见通道 key 集合 */
  visibleKeys: Set<string>;
  onToggleChannel: (key: string) => void;
  frozen: boolean;
  onToggleFreeze: () => void;
  /** 是否显示测量行；通道少 (1-2) 时合并到一行更省空间 */
  compactMeasure?: boolean;
  /** 触发同步：把"上升沿过零点"锁到画面固定位置，让周期波看着不动 */
  triggerEnabled?: boolean;
  onToggleTrigger?: () => void;
  /** 游标：点图找到任意时刻的精确读数 */
  cursorEnabled?: boolean;
  onToggleCursor?: () => void;
  /** FFT 视图：切到频谱分析模式（看谐波） */
  fftEnabled?: boolean;
  onToggleFft?: () => void;
  /** 导出当前波形为 CSV（caller 自行组装数据） */
  onExportCsv?: () => void;
}

function computeStats(series: number[]) {
  if (series.length === 0) return { vpp: 0, rms: 0, mean: 0 };
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let sqSum = 0;
  for (const v of series) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
    sqSum += v * v;
  }
  return {
    vpp: max - min,
    rms: Math.sqrt(sqSum / series.length),
    mean: sum / series.length,
  };
}

const fmt = (v: number, digits = 2) => {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) >= 1000) return v.toFixed(0);
  return v.toFixed(digits);
};

export function ScopeToolbar({
  windowMs,
  windowOptions = [30, 60, 100, 200, 500],
  onWindowChange,
  channels,
  visibleKeys,
  onToggleChannel,
  frozen,
  onToggleFreeze,
  compactMeasure = false,
  triggerEnabled,
  onToggleTrigger,
  cursorEnabled,
  onToggleCursor,
  fftEnabled,
  onToggleFft,
  onExportCsv,
}: Props) {
  const stats = useMemo(() => {
    return channels.map((c) => ({ key: c.key, ...computeStats(c.series) }));
  }, [channels]);

  return (
    <div className="mb-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-2 text-caption">
        {/* 时基 */}
        <div role="group" aria-label="时基选择" className="flex items-center gap-1">
          <span className="text-ink-muted">时基</span>
          <div className="flex items-center overflow-hidden rounded-md border border-line-subtle">
            {windowOptions.map((opt) => {
              const active = opt === windowMs;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onWindowChange(opt)}
                  aria-pressed={active}
                  aria-label={`时间窗 ${opt} 毫秒${active ? '（当前）' : ''}`}
                  className={`px-2 py-0.5 text-caption transition-colors ${
                    active
                      ? 'bg-accent-primary/15 text-accent-primary'
                      : 'bg-bg-base text-ink-secondary hover:bg-bg-raised hover:text-ink-primary'
                  }`}
                  title={`显示 ${opt} ms 时间窗`}
                >
                  {opt}
                </button>
              );
            })}
            <span className="border-l border-line-subtle bg-bg-base px-1.5 py-0.5 text-ink-muted">ms</span>
          </div>
        </div>

        {/* 通道开关 */}
        <div role="group" aria-label="通道开关" className="flex items-center gap-1">
          <span className="text-ink-muted">通道</span>
          {channels.map((c) => {
            const visible = visibleKeys.has(c.key);
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => onToggleChannel(c.key)}
                aria-pressed={visible}
                title={`${visible ? '隐藏' : '显示'} ${c.label}`}
                className={`flex items-center gap-1 rounded-md border px-2 py-0.5 transition-colors ${
                  visible
                    ? 'border-line-subtle bg-bg-base'
                    : 'border-line-subtle bg-bg-surface opacity-50'
                }`}
                style={{ color: visible ? c.color : undefined }}
              >
                {visible ? <Eye className="h-3 w-3" aria-hidden="true" /> : <EyeOff className="h-3 w-3" aria-hidden="true" />}
                <span className={visible ? '' : 'text-ink-muted line-through'}>{c.label}</span>
              </button>
            );
          })}
        </div>

        {/* 右侧：FFT / 触发 / 游标 / 冻结 */}
        <div className="ml-auto flex items-center gap-1">
          {onToggleFft && (
            <button
              type="button"
              onClick={onToggleFft}
              aria-pressed={fftEnabled}
              title={fftEnabled ? '回到时域波形' : '切换到 FFT 频谱视图（看谐波分量）'}
              className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-caption transition-colors ${
                fftEnabled
                  ? 'border-accent-warn/50 bg-accent-warn/15 text-accent-warn'
                  : 'border-line-subtle bg-bg-base text-ink-secondary hover:bg-bg-raised hover:text-ink-primary'
              }`}
            >
              {fftEnabled ? <Activity className="h-3 w-3" aria-hidden="true" /> : <BarChart3 className="h-3 w-3" aria-hidden="true" />}
              {fftEnabled ? '时域' : 'FFT'}
            </button>
          )}
          {onToggleTrigger && (
            <button
              type="button"
              onClick={onToggleTrigger}
              aria-pressed={triggerEnabled}
              disabled={fftEnabled}
              title={
                fftEnabled
                  ? '触发只在时域有效（先切回时域）'
                  : triggerEnabled
                    ? '关闭触发同步（自由扫描）'
                    : '开启触发同步（锁定上升沿过零点，周期波看着不动）'
              }
              className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-caption transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                triggerEnabled
                  ? 'border-accent-measure/50 bg-accent-measure/15 text-accent-measure'
                  : 'border-line-subtle bg-bg-base text-ink-secondary hover:bg-bg-raised hover:text-ink-primary'
              }`}
            >
              <Zap className="h-3 w-3" aria-hidden="true" />
              触发
            </button>
          )}
          {onToggleCursor && (
            <button
              type="button"
              onClick={onToggleCursor}
              aria-pressed={cursorEnabled}
              disabled={fftEnabled}
              title={
                fftEnabled
                  ? '游标只在时域有效（先切回时域）'
                  : cursorEnabled
                    ? '关闭游标'
                    : '开启游标（点击波形读取该时刻数值）'
              }
              className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-caption transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                cursorEnabled
                  ? 'border-accent-primary/50 bg-accent-primary/15 text-accent-primary'
                  : 'border-line-subtle bg-bg-base text-ink-secondary hover:bg-bg-raised hover:text-ink-primary'
              }`}
            >
              <Crosshair className="h-3 w-3" aria-hidden="true" />
              游标
            </button>
          )}
          <button
            type="button"
            onClick={onToggleFreeze}
            aria-pressed={frozen}
            title={frozen ? '继续刷新' : '冻结当前画面'}
            className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-caption transition-colors ${
              frozen
                ? 'border-accent-warn/50 bg-accent-warn/15 text-accent-warn'
                : 'border-line-subtle bg-bg-base text-ink-secondary hover:bg-bg-raised hover:text-ink-primary'
            }`}
          >
            {frozen ? <Play className="h-3 w-3" aria-hidden="true" /> : <Pause className="h-3 w-3" aria-hidden="true" />}
            {frozen ? '继续' : '冻结'}
          </button>
          {onExportCsv && (
            <button
              type="button"
              onClick={onExportCsv}
              title="导出当前波形为 CSV（可在 Excel/MATLAB 打开）"
              className="flex items-center gap-1 rounded-md border border-line-subtle bg-bg-base px-2 py-0.5 text-caption text-ink-secondary transition-colors hover:bg-bg-raised hover:text-ink-primary"
            >
              <Download className="h-3 w-3" aria-hidden="true" />
              CSV
            </button>
          )}
        </div>
      </div>

      {/* 测量行：Vpp / RMS 实时显示。通道少时合并到一行，通道多时分两行不挤 */}
      {channels.length > 0 && (
        <div className={`flex flex-wrap gap-x-3 gap-y-1 text-caption ${compactMeasure ? '' : 'pl-1'}`}>
          {stats.map((s) => {
            const c = channels.find((ch) => ch.key === s.key)!;
            const visible = visibleKeys.has(c.key);
            const unit = c.unit ?? '';
            return (
              <span
                key={s.key}
                className={visible ? '' : 'opacity-40'}
                style={{ color: visible ? c.color : undefined }}
              >
                <span className="text-ink-muted">{c.label}:</span>{' '}
                Vpp <span className="font-mono">{fmt(s.vpp)}{unit}</span>{' · '}
                RMS <span className="font-mono">{fmt(s.rms)}{unit}</span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
