import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ShieldAlert, Siren, Zap } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import {
  SerialCompareCardShell,
  selectWindowedSamples,
  timebaseToWindowMs,
  useFrozenRows,
  type SerialTimebase,
} from '../../components/lab/SerialCompareCardShell';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import { useSerialStore } from '../../store/serialStore';
import { useSimulationStore } from '../../store/simulationStore';
import { faultCases } from '../../content/faultCases';
import { mockFaultInjectionSample } from '../../utils/serialMockGenerators';
import { isStatusOnlyFault } from '../../simulation/math/faultWaveforms';
import { toCsv } from '../../utils/download';
import { formatNumber } from '../../utils/format';
import type { FaultType } from '../../simulation/engine/types';

/**
 * SerialFaultInjectionCard：故障注入 + 实测三相电流瞬态对照。
 *
 * 14 种故障下拉 + "故障注入"按钮：
 *   - Mock 模式：把"注入时刻 trigger_ms"在本地 state 上推进，
 *     mockFaultInjectionSample 会按 t_ms 是否 >= trigger 来切到故障波形 → tripped。
 *     底层叠加 src/simulation/math/faultWaveforms.createFaultWaveform 的特征波形。
 *   - 真板模式：写到 setBoardCommand state，让上层（17 号 SerialBenchPanel）
 *     在 IPC 通道里转发 1B 故障命令字 + 4B severity（IEEE 754）；
 *     这里只负责发出"命令请求"，命令传输由 SerialBridge 扩展实现（当前 stub）。
 *
 * KPI：
 *   - 保护响应时延（μs）：trigger 时刻 → 三相电流首次跌到 |I| < 0.3A 的间隔
 *   - OCP 触发：观察是否在保护窗口内出现"先冲高再归零"形态
 *   - 故障种类（中文标题）/ 严重度
 *
 * 板端协议字段需求：
 *   - 必需：t_us, ia, ib, ic
 *   - 推荐：fault_flag（1 字节位掩码）+ trip_lat_us（u32）
 *     —— 当前协议未含，UI 用本地时间差近似估算。
 *
 * 状态位故障（oil-low）不画波形，直接走告警 fallback 卡。
 */

const FAULT_TYPES: FaultType[] = [
  'over-current',
  'phase-loss',
  'current-offset',
  'phase-order',
  'encoder-angle',
  'speed-oscillation',
  'voltage-saturation',
  'startup-fail',
  'liquid-slugging',
  'locked-rotor',
  'dc-undervolt',
  'over-temp',
  'vibration',
  'oil-low',
];

interface Row {
  t_ms: number;
  ia: number;
  ib: number;
  ic: number;
  faulted: boolean;
  tripped: boolean;
}

export function SerialFaultInjectionCard() {
  const { t, locale } = useI18n();
  const showEn = locale === 'en-US';
  const buffer = useSerialStore((s) => s.buffer);
  const source = useSerialStore((s) => s.source);
  const fault = useSimulationStore((s) => s.fault);
  const updateFault = useSimulationStore((s) => s.updateFault);
  const [timebase, setTimebase] = useState<SerialTimebase>('100ms');
  const [paused, setPaused] = useState(false);
  // 注入触发的"虚拟 t_ms"：通过缓冲首帧时间 + 偏移得到
  // null 表示未注入
  const [triggerOffsetMs, setTriggerOffsetMs] = useState<number | null>(null);
  const [boardCommand, setBoardCommand] = useState<{ type: FaultType; severity: number; at: number } | null>(null);
  const windowMs = timebaseToWindowMs(timebase);

  const t0Ref = useRef<number | null>(null);
  // 缓冲首次出现时记录 t0，作为注入时刻基准
  useEffect(() => {
    if (buffer.length > 0 && t0Ref.current === null) t0Ref.current = buffer[0].t_ms;
    if (buffer.length === 0) t0Ref.current = null;
  }, [buffer]);

  const statusOnly = isStatusOnlyFault(fault.faultType);

  const rows = useMemo<Row[]>(() => {
    if (buffer.length === 0 || statusOnly) return [];
    const windowed = selectWindowedSamples(buffer, windowMs);
    if (windowed.length === 0) return [];
    // 把"注入时刻"对齐到窗口起点：triggerOffsetMs 是 windowed 时间轴下的偏移
    // 未注入时把 trigger 设到 windowMs * 2（即"永不触发"）
    const triggerMs = triggerOffsetMs ?? windowMs * 2;
    return windowed.map((sample) => {
      const m = mockFaultInjectionSample(sample.t_ms, {
        faultType: fault.faultType,
        severity: fault.severity,
        triggerMs,
        ocpDelayUs: 800,
      });
      return {
        t_ms: sample.t_ms,
        ia: m.ia,
        ib: m.ib,
        ic: m.ic,
        faulted: m.faulted,
        tripped: m.tripped,
      };
    });
  }, [buffer, windowMs, fault.faultType, fault.severity, triggerOffsetMs, statusOnly]);

  const displayRows = useFrozenRows(rows, paused);

  const kpi = useMemo(() => {
    if (displayRows.length === 0 || triggerOffsetMs == null) {
      return { tripLatencyUs: 0, ocpTriggered: false, peakI: 0 };
    }
    // 找触发后第一个"绝对最大电流"+ 首次降到 0.3 A 以下的间隔
    const triggerIdx = displayRows.findIndex((r) => r.t_ms >= triggerOffsetMs);
    if (triggerIdx < 0) return { tripLatencyUs: 0, ocpTriggered: false, peakI: 0 };
    let peakI = 0;
    let peakIdx = triggerIdx;
    for (let i = triggerIdx; i < displayRows.length; i += 1) {
      const v = Math.max(Math.abs(displayRows[i].ia), Math.abs(displayRows[i].ib), Math.abs(displayRows[i].ic));
      if (v > peakI) {
        peakI = v;
        peakIdx = i;
      }
    }
    // 找峰值后第一次三相 |I| 都 < 0.3 的位置 = OCP 截断点
    let tripIdx = -1;
    for (let i = peakIdx; i < displayRows.length; i += 1) {
      const r = displayRows[i];
      if (Math.abs(r.ia) < 0.3 && Math.abs(r.ib) < 0.3 && Math.abs(r.ic) < 0.3) {
        tripIdx = i;
        break;
      }
    }
    const ocpTriggered = tripIdx > 0;
    const tripLatencyUs = ocpTriggered ? (displayRows[tripIdx].t_ms - triggerOffsetMs) * 1000 : 0;
    return { tripLatencyUs, ocpTriggered, peakI };
  }, [displayRows, triggerOffsetMs]);

  const onInject = () => {
    // 重置 t0 基准 + 把触发偏移设到 "现在 + 5 ms"（让用户能看到清晰的"前正常 / 后故障"）
    if (buffer.length === 0) return;
    const latestMs = buffer[buffer.length - 1].t_ms;
    setTriggerOffsetMs(latestMs - (t0Ref.current ?? latestMs) + 5);
    // 真板模式：发命令请求（这里只是记录意图，真实 IPC 通道由 SerialBridge 拓展）
    if (source === 'web-serial') {
      setBoardCommand({ type: fault.faultType, severity: fault.severity, at: Date.now() });
    }
  };

  const onClear = () => {
    setTriggerOffsetMs(null);
    setBoardCommand(null);
  };

  const onExportCsv = () => {
    if (displayRows.length === 0) return null;
    const csv = toCsv(
      displayRows.map((r) => ({
        t_ms: r.t_ms.toFixed(3),
        ia: r.ia.toFixed(4),
        ib: r.ib.toFixed(4),
        ic: r.ic.toFixed(4),
        faulted: r.faulted ? 1 : 0,
        tripped: r.tripped ? 1 : 0,
      })),
      ['t_ms', 'ia', 'ib', 'ic', 'faulted', 'tripped'],
    );
    return { filename: `fault-injection-${fault.faultType}`, csv };
  };

  const selected = faultCases[fault.faultType];
  /** faultCases 双语字段：en-US 优先英文，缺失回退中文原文 */
  const selectedTitle = showEn ? (selected.titleEn ?? selected.title) : selected.title;

  const extraAction = (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={onInject}
        disabled={buffer.length === 0}
        aria-label={t('faultsDebugging.serialInjectAria').replace('{title}', selectedTitle)}
        className="flex items-center gap-1 rounded-md border border-accent-fault/60 bg-accent-fault/10 px-2 py-1 text-caption text-accent-fault transition hover:bg-accent-fault/20 disabled:opacity-50"
      >
        <Zap className="h-3.5 w-3.5" aria-hidden />
        {t('faultsDebugging.serialInjectBtn')}
      </button>
      {triggerOffsetMs != null && (
        <button
          type="button"
          onClick={onClear}
          aria-label={t('faultsDebugging.serialClearAria')}
          className="rounded-md border border-line-subtle bg-bg-base px-2 py-1 text-caption text-ink-secondary transition hover:border-line-strong"
        >
          {t('faultsDebugging.serialClearBtn')}
        </button>
      )}
    </div>
  );

  return (
    <SerialCompareCardShell
      title={t('faultsDebugging.serialTitle')}
      eyebrow="fault injection"
      timebase={timebase}
      onTimebaseChange={setTimebase}
      paused={paused}
      onPausedChange={setPaused}
      onExportCsv={onExportCsv}
      extraAction={extraAction}
    >
      {/* 故障类型下拉 + 严重度滑块 */}
      <div className="mb-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        <div>
          <label htmlFor="fault-type-select" className="text-caption text-ink-muted">
            {t('faultsDebugging.serialFaultTypeLabel')}
          </label>
          <select
            id="fault-type-select"
            value={fault.faultType}
            onChange={(e) => {
              updateFault({ faultType: e.target.value as FaultType });
              setTriggerOffsetMs(null);
            }}
            aria-label={t('faultsDebugging.serialFaultTypeAria')}
            className="mt-1 w-full rounded-md border border-line-subtle bg-bg-base px-2 py-1 text-body text-ink-primary focus:border-accent-primary focus:outline-none"
          >
            {FAULT_TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {t('faultsDebugging.serialFaultOption')
                  .replace('{title}', showEn ? (faultCases[ft].titleEn ?? faultCases[ft].title) : faultCases[ft].title)
                  .replace('{code}', ft)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1 flex items-baseline justify-between">
            <label htmlFor="fault-severity-range" className="text-caption text-ink-muted">
              {t('faultsDebugging.serialSeverityLabel')}
            </label>
            <span className="formula text-caption text-ink-primary">{formatNumber(fault.severity, 2)}</span>
          </div>
          <input
            id="fault-severity-range"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={fault.severity}
            onChange={(e) => updateFault({ severity: Number(e.target.value) })}
            aria-label={t('faultsDebugging.serialSeverityAria')}
            aria-valuemin={0}
            aria-valuemax={1}
            aria-valuenow={fault.severity}
            aria-valuetext={t('faultsDebugging.serialSeverityValuetext').replace('{v}', formatNumber(fault.severity * 100, 0))}
            className="simulation-slider w-full"
          />
        </div>
      </div>

      {statusOnly ? (
        <div className="flex h-44 flex-col items-center justify-center gap-2 rounded-lg border border-accent-warn/40 bg-accent-warn/[0.06] px-6 text-center">
          <ShieldAlert className="h-8 w-8 text-accent-warn" aria-hidden />
          <p className="text-body leading-relaxed text-accent-warn">
            <span className="font-medium">{selectedTitle}</span> {t('faultsDebugging.serialStatusOnlyIs')}
            <span className="font-medium">{t('faultsDebugging.titleSuffixStatus')}</span>
            {t('faultsDebugging.serialStatusOnlyTail')}
          </p>
          <p className="text-caption text-ink-muted">
            {t('faultsDebugging.serialStatusOnlyHint')}
          </p>
        </div>
      ) : (
        <CurrentChart rows={displayRows} triggerMs={triggerOffsetMs} />
      )}

      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile
          label={t('faultsDebugging.serialKpiSelected')}
          value={selectedTitle}
          tone="primary"
        />
        <KpiTile
          label={t('faultsDebugging.serialKpiPeakI')}
          value={`${formatNumber(kpi.peakI, 2)} A`}
          tone={kpi.peakI > 8 ? 'fault' : kpi.peakI > 5 ? 'warn' : 'measure'}
        />
        <KpiTile
          label={t('faultsDebugging.serialKpiLatency')}
          value={kpi.ocpTriggered ? `${formatNumber(kpi.tripLatencyUs, 0)} μs` : triggerOffsetMs != null ? t('faultsDebugging.serialNotTripped') : '--'}
          tone={kpi.ocpTriggered ? 'measure' : triggerOffsetMs != null ? 'warn' : 'measure'}
        />
        <KpiTile
          label={t('faultsDebugging.serialKpiOcp')}
          value={kpi.ocpTriggered ? t('common.yes') : triggerOffsetMs != null ? t('common.no') : t('faultsDebugging.serialPendingInject')}
          tone={kpi.ocpTriggered ? 'measure' : 'warn'}
        />
      </div>

      {boardCommand && (
        <p
          className="mt-2 flex items-center gap-1.5 rounded-md border border-accent-primary/30 bg-accent-primary/[0.06] px-2 py-1 text-caption text-accent-primary"
          role="status"
        >
          <Siren className="h-3.5 w-3.5" aria-hidden />
          {t('faultsDebugging.serialBoardCmd')
            .replace('{type}', boardCommand.type)
            .replace('{sev}', formatNumber(boardCommand.severity, 2))
            .replace('{time}', new Date(boardCommand.at).toLocaleTimeString())}
        </p>
      )}

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        {t('faultsDebugging.serialProtoLead')} <span className="text-accent-warn">fault_flag(u8), trip_lat_us(u32)</span>{' '}
        {t('faultsDebugging.serialProtoTail')}
      </p>
    </SerialCompareCardShell>
  );
}

function CurrentChart({ rows, triggerMs }: { rows: Row[]; triggerMs: number | null }) {
  const { t } = useI18n();
  return (
    <div className="space-y-1 rounded-lg border border-line-subtle bg-bg-base p-2">
      <header className="flex flex-wrap items-center justify-between gap-1 text-caption text-ink-muted">
        <span>{t('faultsDebugging.serialCurrentTitle')}</span>
        <span className="flex items-center gap-2">
          <Legend color="var(--accent-primary)" label="Ia" />
          <Legend color="var(--accent-measure)" label="Ib" />
          <Legend color="var(--accent-warn)" label="Ic" />
          {triggerMs != null && (
            <span className="flex items-center gap-1 text-accent-fault">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              trigger@{formatNumber(triggerMs, 1)}ms
            </span>
          )}
        </span>
      </header>
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -22 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 10 }} width={42} />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 6,
                color: '#e7f3ff',
                fontSize: 11,
              }}
            />
            <ReferenceLine y={0} stroke="#1e2a3d" strokeDasharray="2 4" />
            {triggerMs != null && (
              <ReferenceLine
                x={triggerMs}
                stroke="var(--accent-fault)"
                strokeDasharray="3 3"
                label={{ value: t('faultsDebugging.serialInjectBtn'), fill: '#ff5c7a', fontSize: 10, position: 'insideTopLeft' }}
              />
            )}
            <Line type="monotone" dataKey="ia" dot={false} stroke="var(--accent-primary)" strokeWidth={1.5} isAnimationActive={false} name="Ia" />
            <Line type="monotone" dataKey="ib" dot={false} stroke="var(--accent-measure)" strokeWidth={1.5} isAnimationActive={false} name="Ib" />
            <Line type="monotone" dataKey="ic" dot={false} stroke="var(--accent-warn)" strokeWidth={1.5} isAnimationActive={false} name="Ic" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
      {label}
    </span>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'measure' | 'primary' | 'warn' | 'fault';
}) {
  const color =
    tone === 'fault'
      ? 'var(--accent-fault)'
      : tone === 'warn'
        ? 'var(--accent-warn)'
        : tone === 'primary'
          ? 'var(--accent-primary)'
          : 'var(--accent-measure)';
  const shape = tone === 'fault' ? '▲' : tone === 'warn' ? '◆' : '●';
  const { t } = useI18n();
  const sr = tone === 'fault'
    ? t('faultsDebugging.serialSrSevere')
    : tone === 'warn'
      ? t('faultsDebugging.serialSrWarn')
      : tone === 'primary'
        ? t('faultsDebugging.serialSrInfo')
        : t('faultsDebugging.serialSrOk');
  return (
    <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="formula text-body font-medium" style={{ color }}>
        <span aria-hidden className="mr-1">
          {shape}
        </span>
        {value}
        <span className="sr-only"> · {sr}</span>
      </p>
    </div>
  );
}
