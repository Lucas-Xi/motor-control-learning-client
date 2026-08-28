import { useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Slider } from '../../components/ui/Slider';
import { useI18n } from '../../i18n/useI18n';
import { makeAntiWindupPI } from '../../simulation/math/antiwindup';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

/**
 * 抗积分饱和对比卡：消费 src/simulation/math/antiwindup.ts (makeAntiWindupPI)。
 *
 * 同一参数（Kp/Ki/setpoint/disturbance）下并排跑两条曲线：
 *   1) Clamping (ka=0)：饱和时冻结积分，靠 P 项慢慢回退
 *   2) Back-calculation (ka>0)：饱和量乘 ka 反向倒灌到积分，更早脱饱和
 *
 * 公式（来自 antiwindup.ts 文件头）：
 *   u_unsat = Kp·e + Ki·∫e
 *   u_sat   = clamp(u_unsat, outMin, outMax)
 *   ∫e_next = ∫e + (e + ka/Ki·(u_sat − u_unsat))·dt
 *
 * 经验：Ka ≈ Ki/Kp（Åström），让 back-calc 时间常数 ≈ 主环时间常数。
 */

const DT = 0.001; // 1 ms 采样
const DURATION = 1.0; // 1 s 仿真
const N = Math.floor(DURATION / DT);

interface SimPoint {
  t: number;
  ref: number;
  yClamp: number;
  yBack: number;
  uClamp: number;
  uBack: number;
}

function simulate(kp: number, ki: number, ka: number, target: number, disturbance: number, limit: number): SimPoint[] {
  // 两条独立的控制器：clamping (ka=0) vs back-calc (ka>0)
  const piClamp = makeAntiWindupPI(kp, ki, 0, -limit, limit);
  const piBack = makeAntiWindupPI(kp, ki, ka, -limit, limit);
  // 简单一阶被控对象：τ·dy/dt + y = K·u - load
  // 取 K=8, τ=0.05 → 电流环量级
  const K = 8;
  const tau = 0.05;
  let yC = 0;
  let yB = 0;
  const out: SimPoint[] = [];
  // 0.5s 后注入负载阶跃，验证抗 windup 在干扰下的恢复
  for (let i = 0; i < N; i += 1) {
    const t = i * DT;
    const ref = t < 0.05 ? 0 : target; // 0.05s 起阶跃到 target
    const load = t < 0.5 ? 0 : disturbance;
    const uC = piClamp.step(ref - yC, DT);
    const uB = piBack.step(ref - yB, DT);
    // 离散一阶 plant 积分
    yC += ((-yC + K * uC - load) / tau) * DT;
    yB += ((-yB + K * uB - load) / tau) * DT;
    if (i % 2 === 0) {
      out.push({ t, ref, yClamp: yC, yBack: yB, uClamp: uC, uBack: uB });
    }
  }
  return out;
}

const W = 460;
const H = 220;
const PAD = { l: 36, r: 12, t: 14, b: 28 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

export function AntiWindupCompareCard() {
  const { t } = useI18n();
  // 借用 PID store 的 Kp/Ki，避免再加 store 字段
  const kp = useSimulationStore((s) => s.pid.kp);
  const ki = useSimulationStore((s) => s.pid.ki);
  const target = useSimulationStore((s) => s.pid.target);
  const limit = useSimulationStore((s) => s.pid.limit);
  const [ka, setKa] = useState(ki / Math.max(kp, 0.01));
  const [disturbance, setDisturbance] = useState(2);

  const data = useMemo(
    () => simulate(kp, ki, ka, target, disturbance, limit),
    [kp, ki, ka, target, disturbance, limit],
  );

  // 找两条曲线"脱饱和后第一次 ±2% 稳态"的时间
  const settlingMs = useMemo(() => {
    const band = Math.abs(target) * 0.02;
    let clampMs: number | null = null;
    let backMs: number | null = null;
    // 从 0.5s（扰动注入处）往后看
    for (const p of data) {
      if (p.t < 0.5) continue;
      if (clampMs === null && Math.abs(p.yClamp - p.ref) < band) clampMs = (p.t - 0.5) * 1000;
      if (backMs === null && Math.abs(p.yBack - p.ref) < band) backMs = (p.t - 0.5) * 1000;
      if (clampMs !== null && backMs !== null) break;
    }
    return { clampMs, backMs };
  }, [data, target]);

  const yMax = Math.max(target * 1.3, Math.abs(target) + Math.abs(disturbance) * 1.5, 1);
  const xOf = (t: number) => PAD.l + (t / DURATION) * PW;
  const yOf = (v: number) => PAD.t + (1 - (v + yMax * 0.2) / (yMax * 1.4)) * PH;

  const pathOf = (key: 'yClamp' | 'yBack' | 'ref') =>
    data.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.t).toFixed(1)} ${yOf(p[key]).toFixed(1)}`).join(' ');

  return (
    <Card title={t('pidControl.antiWindupTitle')} eyebrow="anti-windup back-calculation" density="compact">
      <p className="mb-2 text-caption leading-relaxed text-ink-muted">
        {t('pidControl.antiWindupFormulaLabel')}{' '}
        <code className="formula text-ink-secondary">∫e += (e + ka/ki·(u_sat − u_unsat))·dt</code>{' '}
        {t('pidControl.antiWindupKaRecommend')} {formatNumber(ki / Math.max(kp, 0.01), 1)}
      </p>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Slider
          label={t('pidControl.antiWindupKaLabel')}
          value={ka}
          min={0}
          max={Math.max(ki / Math.max(kp, 0.01) * 3, 30)}
          step={0.5}
          unit=""
          onChange={setKa}
          hint={t('pidControl.antiWindupKaHint')}
        />
        <Slider
          label={t('pidControl.antiWindupDisturbanceLabel')}
          value={disturbance}
          min={0}
          max={6}
          step={0.2}
          unit=""
          onChange={setDisturbance}
        />
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${t('pidControl.antiWindupAriaLead')} ${target}${t('pidControl.antiWindupAriaDisturbance')} ${disturbance}${t('pidControl.antiWindupAriaClampSettle')} ${settlingMs.clampMs ?? t('pidControl.ariaNotReached')} ms${t('pidControl.antiWindupAriaBackSettle')} ${settlingMs.backMs ?? t('pidControl.ariaNotReached')} ms`}
      >
        <rect x="0" y="0" width={W} height={H} rx="8" fill="rgb(var(--bg-base))" />
        <line x1={PAD.l} y1={yOf(0)} x2={W - PAD.r} y2={yOf(0)} stroke="rgba(231,243,255,0.12)" strokeWidth="1" />
        {/* 0.5s 扰动注入标线 */}
        <line x1={xOf(0.5)} y1={PAD.t} x2={xOf(0.5)} y2={H - PAD.b} stroke="rgba(255,184,77,0.4)" strokeWidth="1" strokeDasharray="3 3" />
        <text x={xOf(0.5) + 4} y={PAD.t + 12} fill="rgb(var(--accent-warn))" fontSize="9">{t('pidControl.antiWindupDisturbanceMark')}</text>

        {/* 参考线 */}
        <path d={pathOf('ref')} stroke="rgba(231,243,255,0.5)" strokeWidth="1.2" strokeDasharray="4 4" fill="none" />
        {/* clamping */}
        <path d={pathOf('yClamp')} stroke="rgb(var(--accent-fault))" strokeWidth="1.6" fill="none" />
        {/* back-calc */}
        <path d={pathOf('yBack')} stroke="rgb(var(--accent-measure))" strokeWidth="1.8" fill="none" />

        {/* 轴 */}
        <text x={PAD.l} y={H - 8} fill="rgb(var(--ink-muted))" fontSize="10">0 s</text>
        <text x={W - PAD.r - 24} y={H - 8} fill="rgb(var(--ink-muted))" fontSize="10">{DURATION}s</text>

        {/* 图例 */}
        <g fontSize="10" fontFamily="Cascadia Code, Consolas, monospace">
          <line x1={PAD.l + 4} y1={PAD.t + 8} x2={PAD.l + 24} y2={PAD.t + 8} stroke="rgba(231,243,255,0.5)" strokeDasharray="4 4" strokeWidth="1.2" />
          <text x={PAD.l + 28} y={PAD.t + 11} fill="rgb(var(--ink-muted))">{t('pidControl.antiWindupLegendTarget')}</text>
          <line x1={PAD.l + 60} y1={PAD.t + 8} x2={PAD.l + 80} y2={PAD.t + 8} stroke="rgb(var(--accent-fault))" strokeWidth="1.6" />
          <text x={PAD.l + 84} y={PAD.t + 11} fill="rgb(var(--ink-muted))">Clamping</text>
          <line x1={PAD.l + 138} y1={PAD.t + 8} x2={PAD.l + 158} y2={PAD.t + 8} stroke="rgb(var(--accent-measure))" strokeWidth="1.8" />
          <text x={PAD.l + 162} y={PAD.t + 11} fill="rgb(var(--ink-muted))">Back-calc</text>
        </g>
      </svg>

      <div className="mt-3 grid grid-cols-2 gap-2 text-caption">
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('pidControl.antiWindupClampRecovery')}</p>
          <p className="formula text-accent-fault">
            {settlingMs.clampMs === null ? t('pidControl.antiWindupNotSettled') : `${formatNumber(settlingMs.clampMs, 0)} ms`}
          </p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('pidControl.antiWindupBackRecovery')}</p>
          <p className="formula text-accent-measure">
            {settlingMs.backMs === null ? t('pidControl.antiWindupNotSettled') : `${formatNumber(settlingMs.backMs, 0)} ms`}
          </p>
        </div>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        {t('pidControl.antiWindupExplain')}
      </p>
    </Card>
  );
}
