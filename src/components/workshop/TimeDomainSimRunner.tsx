import { useEffect, useMemo, useState } from 'react';
import { Play, AlertTriangle, CheckCircle2, AlertCircle, Activity } from 'lucide-react';
import type { CompressorSpec, InverterPlatform } from '../../content/compressorLibrary';
import type {
  ControlStrategy,
  LiquidSeparator,
  LoadCondition,
  PfcPlatform,
} from '../../content/assemblyLibraries';
import { simulateSpeedLoop } from '../../simulation/math/motorModel';
import { simulateCycle } from '../../simulation/math/vaporCycle';

/**
 * Phase B · 简化时域仿真。
 *
 * 点击按钮后，从 t=0 跑 3 秒，按选中的压缩机+变频器+控制策略+工况组合：
 *  - 速度环：复用 simulateSpeedLoop（外环速度 PI + 内层 PMSM dq 简化）
 *  - 稳态制冷：复用 simulateCycle（理想 4 状态点 + 多变压缩）
 *  - Iq：把 speed loop 的 iqRef 直接当作快环跟随后的 Iq
 *  - Vdc：从 PFC 标称 vdcOutput 出发，按 rpm/Iq 比例下垂模拟启动冲击的母线压降
 *  - T_d：用 simulateCycle 在当前 rpm 下重算每个 chunk 的排气温度
 *
 * 输出 4 条 sparkline + 一条 verdict bar（pass / pass-warn / fail + 2-3 行原因）。
 * 结果存内存（useState），不 persist，避免污染 history。
 */

interface Props {
  compressor: CompressorSpec;
  inverter: InverterPlatform;
  strategy: ControlStrategy;
  load: LoadCondition;
  pfc: PfcPlatform;
  separator: LiquidSeparator;
}

type Verdict = 'pass' | 'pass-warn' | 'fail';

interface SimSample {
  t: number;       // s
  rpm: number;
  iqA: number;
  vdcV: number;
  tdC: number;     // 排气温度 (°C)
}

interface SimResult {
  samples: SimSample[];
  verdict: Verdict;
  reasons: string[];
  // 稳态读数
  steadyRpm: number;
  steadyIq: number;
  steadyVdc: number;
  steadyTd: number;
  cop: number;
}

const SIM_DURATION_S = 3;
const SAMPLE_HZ = 100;            // 0.01s 采样，3s = 300 点，sparkline 够细且不卡

export function TimeDomainSimRunner({ compressor, inverter, strategy, load, pfc, separator }: Props) {
  const [result, setResult] = useState<SimResult | null>(null);
  const [busy, setBusy] = useState(false);
  // 切槽位时把结果置空（旧结果不再对应新组合）
  const fingerprint = useMemo(
    () => `${compressor.partNo}|${inverter.ipmPartNo}|${strategy.id}|${load.id}|${pfc.id}|${separator.id}`,
    [compressor.partNo, inverter.ipmPartNo, strategy.id, load.id, pfc.id, separator.id],
  );
  // 仅在 fingerprint 变时把旧结果丢掉
  useEffect(() => { setResult(null); }, [fingerprint]);

  const run = () => {
    setBusy(true);
    // 同步计算就够了（300 点 simulateSpeedLoop ≈ <10ms）；用 setTimeout 0 让按钮态可见
    setTimeout(() => {
      setResult(runSimulation({ compressor, inverter, strategy, load, pfc, separator }));
      setBusy(false);
    }, 16);
  };

  return (
    <div className="rounded-xl border border-line-subtle bg-bg-base p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Activity className="h-3.5 w-3.5 text-accent-primary" />
          <p className="text-caption uppercase tracking-[0.18em] text-ink-muted">3 秒简化时域仿真 · 速度环 × 制冷循环</p>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-md border border-accent-primary/60 bg-accent-primary/15 px-2.5 py-1.5 text-body text-accent-primary transition-colors hover:bg-accent-primary/25 disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          {busy ? '计算中…' : result ? '重新仿真' : '运行时域仿真'}
        </button>
      </div>

      {!result ? (
        <p className="rounded-md border border-line-subtle bg-bg-surface px-3 py-4 text-center text-caption text-ink-muted">
          点上方按钮跑 3 秒启动+稳态过程，输出 rpm / Iq / Vdc / 排气温度 4 条 sparkline 和 verdict。
        </p>
      ) : (
        <>
          <VerdictBar result={result} />
          <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Sparkline
              label="转速 rpm"
              unit="rpm"
              color="rgb(67 247 181)"
              samples={result.samples.map((s) => ({ t: s.t, v: s.rpm }))}
              steady={result.steadyRpm}
              target={load.targetRpm}
            />
            <Sparkline
              label="Iq"
              unit="A"
              color="rgb(52 214 255)"
              samples={result.samples.map((s) => ({ t: s.t, v: s.iqA }))}
              steady={result.steadyIq}
              warnAt={compressor.ratedCurrentA}
              faultAt={compressor.ratedCurrentA * 1.5}
            />
            <Sparkline
              label="母线 Vdc"
              unit="V"
              color="rgb(255 184 77)"
              samples={result.samples.map((s) => ({ t: s.t, v: s.vdcV }))}
              steady={result.steadyVdc}
              floor={pfc.vdcOutput * 0.85}
            />
            <Sparkline
              label="排气温度"
              unit="°C"
              color="rgb(255 92 122)"
              samples={result.samples.map((s) => ({ t: s.t, v: s.tdC }))}
              steady={result.steadyTd}
              warnAt={TD_WARN[load.refrigerant]}
              faultAt={TD_LIMIT[load.refrigerant]}
            />
          </div>
          <p className="mt-2 text-caption text-ink-muted">
            稳态 COP ≈ <span className="font-mono text-ink-primary">{result.cop.toFixed(2)}</span> ·
            采样 {SAMPLE_HZ} Hz · {SIM_DURATION_S}s 共 {result.samples.length} 点（结果仅在内存中，不写入 history）。
          </p>
        </>
      )}
    </div>
  );
}

// ———————————————————— 仿真核心 ————————————————————

const TD_LIMIT: Record<string, number> = { R32: 105, R410A: 110, R134a: 95 };
const TD_WARN: Record<string, number> = { R32: 90, R410A: 95, R134a: 80 };

function runSimulation({ compressor, inverter, strategy, load, pfc, separator }: Props): SimResult {
  // —— 1) 用 simulateSpeedLoop 跑 3s 速度环（外环 PI + dq 简化）—— 这是 math/motorModel.ts 的纯函数
  //    它的 dt=1ms，每 4 步 push 一个点（即 4ms 一个样本），3s = 750 个样本，足够。
  //    targetRpm 用工况；负载扭矩用 simulateCycle 的 torqueLoad 近似（先稳态算一次以确定）。
  const steadyCycle = simulateCycle({
    refrigerant: load.refrigerant,
    Te: load.Te,
    Tc: load.Tc,
    superheatK: load.superheatK,
    subcoolK: load.subcoolK,
    displacementCc: compressor.displacementCc,
    clearanceRatio: 0.05,
    rpm: load.targetRpm,
    isentropicEff: 0.72,
    eevOpening: 0.55,
  });
  const loadTorque = steadyCycle.torqueLoad;
  const gains = { kp: 0.02, ki: 0.6, kd: 0 };
  const rawSpeedPoints = simulateSpeedLoop(load.targetRpm, gains, loadTorque, SIM_DURATION_S);

  // —— 2) 重采样到 100Hz 网格 ——
  //    rawSpeedPoints 是 {t, speedRpm, iqRef, torque}，t in seconds，4ms 步距。
  //    用线性插值映射到 0.01s 网格，便于和 simulateCycle 同步刷新 Tdischarge。
  const stepS = 1 / SAMPLE_HZ;
  const totalSamples = Math.floor(SIM_DURATION_S / stepS) + 1;
  const samples: SimSample[] = [];
  // 每 30 个样本（0.3s）重算一次 simulateCycle 的 Tdischarge / cop（避免每点都算重）
  let lastCycleRpm = -1;
  let cachedTd = steadyCycle.Tdischarge;
  let cachedCop = steadyCycle.cop;
  // PFC 母线下垂模型：Iq 拉电流 → Vdc 下垂；线性近似 Vdc = V0 - k·Iq²
  // k 选取使 Iq=ratedCurrent 时下垂 ~6%（家用 Boost 实测量级）
  const droopK = (pfc.vdcOutput * 0.06) / Math.max(1, compressor.ratedCurrentA * compressor.ratedCurrentA);

  for (let i = 0; i < totalSamples; i++) {
    const t = i * stepS;
    // 在 rawSpeedPoints 找最近样本（rawSpeedPoints 是单调递增 t 序列）
    const idx = Math.min(rawSpeedPoints.length - 1, Math.floor(t / 0.004));
    const a = rawSpeedPoints[idx];
    const b = rawSpeedPoints[Math.min(rawSpeedPoints.length - 1, idx + 1)];
    const f = a && b && b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    const rpm = a ? a.speedRpm + (b.speedRpm - a.speedRpm) * f : 0;
    // iqRef 是速度 PI 的输出（A 量级），加一个最小值地板避免负值
    const iqA = Math.max(0, a ? a.iqRef + (b.iqRef - a.iqRef) * f : 0);

    // —— 母线 Vdc：从 PFC 标称下垂，启动冲击会临时下凹 ——
    const vdcV = Math.max(pfc.vdcOutput * 0.75, pfc.vdcOutput - droopK * iqA * iqA);

    // —— 排气温度：每 0.3s 用当前 rpm 重算一次 simulateCycle（rpm 变了循环点也跟着变） ——
    if (Math.abs(rpm - lastCycleRpm) > 200 || (i % 30 === 0)) {
      const cyc = simulateCycle({
        refrigerant: load.refrigerant,
        Te: load.Te,
        Tc: load.Tc,
        superheatK: load.superheatK,
        subcoolK: load.subcoolK,
        displacementCc: compressor.displacementCc,
        clearanceRatio: 0.05,
        rpm: Math.max(60, rpm),  // 防 rpm=0 时质量流量爆零
        isentropicEff: 0.72,
        eevOpening: 0.55,
      });
      cachedTd = cyc.Tdischarge;
      cachedCop = cyc.cop;
      lastCycleRpm = rpm;
    }
    samples.push({ t, rpm, iqA, vdcV, tdC: cachedTd });
  }

  // —— 3) 稳态读数（最后 0.5s 的均值）——
  const tailStart = Math.max(0, samples.length - Math.floor(0.5 * SAMPLE_HZ));
  const tail = samples.slice(tailStart);
  const avg = (k: keyof SimSample) => tail.reduce((s, x) => s + (x[k] as number), 0) / Math.max(1, tail.length);
  const steadyRpm = avg('rpm');
  const steadyIq = avg('iqA');
  const steadyVdc = avg('vdcV');
  const steadyTd = avg('tdC');

  // —— 4) Verdict ——
  const reasons: string[] = [];
  let verdict: Verdict = 'pass';
  const reachedTarget = steadyRpm >= load.targetRpm * 0.95;
  const tdLimit = TD_LIMIT[load.refrigerant] ?? 100;
  const tdWarn = TD_WARN[load.refrigerant] ?? 85;
  const ratedI = compressor.ratedCurrentA;
  const refrigerantMismatch = compressor.refrigerant !== load.refrigerant;
  const rampNeeded = load.rampRpmS;
  const rampOk = rampNeeded <= separator.maxRampRpmS;
  const inverterOverCurrent = steadyIq > inverter.ratedCurrentA * 0.95;

  if (refrigerantMismatch) {
    reasons.push(`冷媒不匹配（${compressor.refrigerant} vs ${load.refrigerant}）→ 复习 16 制冷台架`);
    verdict = 'fail';
  }
  if (steadyIq > ratedI) {
    reasons.push(`稳态 Iq ${steadyIq.toFixed(2)} A 超过压缩机额定 ${ratedI} A → 复习 11 弱磁 / 09 控制回路`);
    verdict = 'fail';
  } else if (steadyIq > ratedI * 0.85) {
    reasons.push(`稳态 Iq ${steadyIq.toFixed(2)} A 占额定 ${(steadyIq / ratedI * 100).toFixed(0)}% — 余量小`);
    if (verdict === 'pass') verdict = 'pass-warn';
  }
  if (steadyTd > tdLimit) {
    reasons.push(`排气温度 ${steadyTd.toFixed(1)}°C 超 ${load.refrigerant} 限值 ${tdLimit}°C → 复习 16 制冷台架 / 增加过冷度`);
    verdict = 'fail';
  } else if (steadyTd > tdWarn) {
    reasons.push(`排气温度 ${steadyTd.toFixed(1)}°C 接近限值 ${tdLimit}°C → 关注`);
    if (verdict === 'pass') verdict = 'pass-warn';
  }
  if (!reachedTarget) {
    reasons.push(`3 s 内未达目标转速 ${load.targetRpm} rpm（实际 ${steadyRpm.toFixed(0)}） → 复习 14 启动状态机 / 09 控制回路`);
    if (verdict === 'pass') verdict = 'pass-warn';
  }
  if (!rampOk) {
    reasons.push(`工况斜坡 ${rampNeeded} rpm/s > 分离器上限 ${separator.maxRampRpmS} → 复习 14 启动状态机 / 换大分离器`);
    verdict = 'fail';
  }
  if (inverterOverCurrent) {
    reasons.push(`稳态 Iq ${steadyIq.toFixed(2)} A 接近变频器 ${inverter.ratedCurrentA} A 额定 → 复习 08 三相逆变器`);
    if (verdict === 'pass') verdict = 'pass-warn';
  }
  if (reasons.length === 0) {
    reasons.push(`稳态全绿：${steadyRpm.toFixed(0)} rpm · Iq ${steadyIq.toFixed(2)} A · 排气 ${steadyTd.toFixed(1)}°C · COP ${cachedCop.toFixed(2)}`);
  }

  return {
    samples,
    verdict,
    reasons: reasons.slice(0, 3),
    steadyRpm,
    steadyIq,
    steadyVdc,
    steadyTd,
    cop: cachedCop,
  };
}

// ———————————————————— Sparkline ————————————————————

function Sparkline({
  label, unit, color, samples, steady, target, warnAt, faultAt, floor,
}: {
  label: string;
  unit: string;
  color: string;
  samples: Array<{ t: number; v: number }>;
  steady: number;
  target?: number;
  warnAt?: number;
  faultAt?: number;
  /** Vdc 类指标的"地板"——低于此就该警告 */
  floor?: number;
}) {
  const W = 200;
  const H = 60;
  const minV = Math.min(...samples.map((s) => s.v), target ?? Infinity, floor ?? Infinity);
  const maxV = Math.max(...samples.map((s) => s.v), target ?? -Infinity, warnAt ?? -Infinity, faultAt ?? -Infinity);
  const range = Math.max(1e-6, maxV - minV);
  const tMin = samples[0]?.t ?? 0;
  const tMax = samples[samples.length - 1]?.t ?? 1;
  const tRange = Math.max(1e-6, tMax - tMin);
  const x = (t: number) => ((t - tMin) / tRange) * (W - 4) + 2;
  const y = (v: number) => H - 4 - ((v - minV) / range) * (H - 8);
  const pathD = samples.length === 0 ? '' : `M ${x(samples[0].t)} ${y(samples[0].v)} ` + samples.slice(1).map((s) => `L ${x(s.t)} ${y(s.v)}`).join(' ');

  // 状态色：根据 steady vs warnAt / faultAt 决定数字颜色
  let toneCls = 'text-ink-primary';
  if (faultAt !== undefined && steady > faultAt) toneCls = 'text-accent-fault';
  else if (warnAt !== undefined && steady > warnAt) toneCls = 'text-accent-warn';
  else if (floor !== undefined && steady < floor) toneCls = 'text-accent-warn';

  return (
    <div className="rounded-md border border-line-subtle bg-bg-surface p-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-ink-muted">{label}</span>
        <span className={`font-mono text-body font-medium ${toneCls}`}>
          {steady.toFixed(steady < 10 ? 2 : steady < 1000 ? 1 : 0)} <span className="text-caption text-ink-muted">{unit}</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-12 w-full" role="img" aria-label={`${label} sparkline, 稳态 ${steady.toFixed(2)} ${unit}`}>
        {/* 目标 / warn / fault 参考线 */}
        {target !== undefined && (
          <line x1="0" x2={W} y1={y(target)} y2={y(target)} stroke="rgb(158 181 203)" strokeWidth="0.7" strokeDasharray="3 3" />
        )}
        {floor !== undefined && (
          <line x1="0" x2={W} y1={y(floor)} y2={y(floor)} stroke="rgb(255 184 77)" strokeWidth="0.7" strokeDasharray="3 3" />
        )}
        {warnAt !== undefined && warnAt < maxV && (
          <line x1="0" x2={W} y1={y(warnAt)} y2={y(warnAt)} stroke="rgb(255 184 77)" strokeWidth="0.7" strokeDasharray="3 3" />
        )}
        {faultAt !== undefined && faultAt < maxV && (
          <line x1="0" x2={W} y1={y(faultAt)} y2={y(faultAt)} stroke="rgb(255 92 122)" strokeWidth="0.7" strokeDasharray="3 3" />
        )}
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" />
      </svg>
    </div>
  );
}

// ———————————————————— VerdictBar ————————————————————

function VerdictBar({ result }: { result: SimResult }) {
  const tone = result.verdict === 'fail'
    ? { cls: 'border-accent-fault/60 bg-accent-fault/10 text-accent-fault', label: '不通过', Icon: AlertTriangle }
    : result.verdict === 'pass-warn'
      ? { cls: 'border-accent-warn/60 bg-accent-warn/10 text-accent-warn', label: '通过 · 有告警', Icon: AlertCircle }
      : { cls: 'border-accent-measure/60 bg-accent-measure/10 text-accent-measure', label: '通过', Icon: CheckCircle2 };
  const { Icon } = tone;
  return (
    <div className={`flex items-start gap-2 rounded-md border px-3 py-2 ${tone.cls}`} role="status" aria-live="polite">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-body font-medium">{tone.label}</p>
        <ul className="mt-0.5 space-y-0.5 text-caption opacity-90">
          {result.reasons.map((r, i) => (
            <li key={i}>· {r}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

