import { useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { useI18n } from '../../i18n/useI18n';
import { calculateSvpwm } from '../../simulation/math/svpwm';
import { calculateSvpwmMinMax } from '../../simulation/math/svpwmMinMax';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

/**
 * Min/Max vs 七段式 SVPWM 对比卡：消费 src/simulation/math/svpwmMinMax.ts (calculateSvpwmMinMax)。
 *
 * 教学要点：
 *   - 同一 (Valpha, Vbeta) 输入下，两个算法生成的三相占空比应**完全相同**（除 ε 数值误差）。
 *   - Min/Max 法无扇区分支、无 atan2，性能 ~3× 提升；
 *   - 共模分量 V_cm = -(max + min)/2 是一个 3ωe 三次谐波 (≈ ±Udc/6)，
 *     在线-线电压里相消，对电机透明，但相电压含这个 hump。
 *
 * 公式（来自 svpwmMinMax.ts 文件头）：
 *   Va = Valpha;  Vb = -0.5·Valpha + (√3/2)·Vbeta;  Vc = -0.5·Valpha - (√3/2)·Vbeta
 *   V_cm = -(max + min)/2;  duty_x = 0.5 + (Vx + V_cm) / Udc
 */

interface Sample {
  deg: number;
  va: number; // 七段式 dutyA
  vb: number;
  vc: number;
  ma: number; // Min/Max dutyA
  mb: number;
  mc: number;
  vCm: number; // 共模分量
}

function sweep(modulation: number, uDc: number): Sample[] {
  const N = 73; // 5° 步长
  const vMag = (modulation * uDc) / Math.sqrt(3); // |V_ref| = m·Udc/√3
  const samples: Sample[] = [];
  for (let i = 0; i < N; i += 1) {
    const deg = (i / (N - 1)) * 360;
    const theta = (deg * Math.PI) / 180;
    const valpha = vMag * Math.cos(theta);
    const vbeta = vMag * Math.sin(theta);
    const seven = calculateSvpwm({ uAlpha: valpha, uBeta: vbeta, uDc });
    const mm = calculateSvpwmMinMax({ Valpha: valpha, Vbeta: vbeta, Vdc: uDc });
    samples.push({
      deg,
      va: seven.dutyA,
      vb: seven.dutyB,
      vc: seven.dutyC,
      ma: mm.ta,
      mb: mm.tb,
      mc: mm.tc,
      vCm: mm.vCommon,
    });
  }
  return samples;
}

const W = 460;
const H = 220;
const PAD = { l: 36, r: 12, t: 14, b: 28 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

export function SvpwmMinMaxCard() {
  const { t } = useI18n();
  const uAlpha = useSimulationStore((s) => s.svpwm.uAlpha);
  const uBeta = useSimulationStore((s) => s.svpwm.uBeta);
  const uDc = useSimulationStore((s) => s.svpwm.uDc);

  // 用 store 当前的 modulation 作为扫频幅值
  const modulation = useMemo(
    () => Math.min(1, (Math.sqrt(3) * Math.hypot(uAlpha, uBeta)) / Math.max(uDc, 1e-6)),
    [uAlpha, uBeta, uDc],
  );

  const samples = useMemo(() => sweep(modulation, uDc), [modulation, uDc]);

  // 当前 θ 的两个结果
  const currentResult = useMemo(() => {
    const seven = calculateSvpwm({ uAlpha, uBeta, uDc });
    const mm = calculateSvpwmMinMax({ Valpha: uAlpha, Vbeta: uBeta, Vdc: uDc });
    const maxDiff = Math.max(
      Math.abs(seven.dutyA - mm.ta),
      Math.abs(seven.dutyB - mm.tb),
      Math.abs(seven.dutyC - mm.tc),
    );
    return { seven, mm, maxDiff };
  }, [uAlpha, uBeta, uDc]);

  const xOf = (deg: number) => PAD.l + (deg / 360) * PW;
  const yOf = (d: number) => PAD.t + (1 - d) * PH;

  const pathOf = (key: keyof Sample) =>
    samples.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(s.deg).toFixed(1)} ${yOf((s[key] as number)).toFixed(1)}`).join(' ');

  // 共模分量单独的小图
  const vCmMax = useMemo(() => Math.max(...samples.map((s) => Math.abs(s.vCm))), [samples]);
  const yCmOf = (v: number) => PAD.t + PH * 0.45 + PH * 0.4 * (1 - v / Math.max(vCmMax, 1));

  return (
    <Card title={t('svpwm.minMaxTitle')} eyebrow="common-mode injection" density="compact">
      <p className="mb-2 text-caption leading-relaxed text-ink-muted">
        {t('svpwm.minMaxFormulaLabel')}{' '}
        <code className="formula text-ink-secondary">V_cm = −(max + min)/2 ; duty_x = 0.5 + (V_x + V_cm)/Udc</code>
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${t('svpwm.minMaxAriaLead')} ${formatNumber(modulation, 2)}${t('svpwm.minMaxAriaDiff')} ${formatNumber(currentResult.maxDiff * 100, 3)}%`}
      >
        <rect x="0" y="0" width={W} height={H} rx="8" fill="rgb(var(--bg-base))" />
        <line x1={PAD.l} y1={yOf(0.5)} x2={W - PAD.r} y2={yOf(0.5)} stroke="rgba(231,243,255,0.12)" strokeWidth="1" />

        {/* 七段式三相 (低透明度实线) */}
        <path d={pathOf('va')} stroke="rgba(52,214,255,0.45)" strokeWidth="2.6" fill="none" />
        <path d={pathOf('vb')} stroke="rgba(67,247,181,0.45)" strokeWidth="2.6" fill="none" />
        <path d={pathOf('vc')} stroke="rgba(255,184,77,0.45)" strokeWidth="2.6" fill="none" />
        {/* Min/Max 三相 (细虚线) */}
        <path d={pathOf('ma')} stroke="rgb(var(--accent-primary))" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        <path d={pathOf('mb')} stroke="rgb(var(--accent-measure))" strokeWidth="1" strokeDasharray="3 3" fill="none" />
        <path d={pathOf('mc')} stroke="rgb(var(--accent-warn))" strokeWidth="1" strokeDasharray="3 3" fill="none" />

        {/* 共模分量 (mint 细线，画在 0.5 基线下方 1/3 区) */}
        <path
          d={samples
            .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(s.deg).toFixed(1)} ${yCmOf(s.vCm).toFixed(1)}`)
            .join(' ')}
          stroke="rgb(155,127,255)"
          strokeWidth="1.4"
          fill="none"
        />

        {/* 轴 */}
        <text x={PAD.l} y={H - 8} fill="rgb(var(--ink-muted))" fontSize="10">0°</text>
        <text x={(PAD.l + W - PAD.r) / 2 - 10} y={H - 8} fill="rgb(var(--ink-muted))" fontSize="10">180°</text>
        <text x={W - PAD.r - 24} y={H - 8} fill="rgb(var(--ink-muted))" fontSize="10">360°</text>
        <text x={4} y={yOf(1) + 3} fill="rgb(var(--ink-muted))" fontSize="10">1.0</text>
        <text x={4} y={yOf(0.5) + 3} fill="rgb(var(--ink-muted))" fontSize="10">0.5</text>
        <text x={4} y={yOf(0) + 3} fill="rgb(var(--ink-muted))" fontSize="10">0.0</text>

        {/* 图例 */}
        <g fontSize="10" fontFamily="Cascadia Code, Consolas, monospace">
          <line x1={PAD.l + 4} y1={PAD.t + 8} x2={PAD.l + 24} y2={PAD.t + 8} stroke="rgba(52,214,255,0.6)" strokeWidth="2.6" />
          <text x={PAD.l + 28} y={PAD.t + 11} fill="rgb(var(--ink-muted))">{t('svpwm.minMaxLegendSeven')}</text>
          <line x1={PAD.l + 70} y1={PAD.t + 8} x2={PAD.l + 90} y2={PAD.t + 8} stroke="rgb(var(--accent-primary))" strokeDasharray="3 3" />
          <text x={PAD.l + 94} y={PAD.t + 11} fill="rgb(var(--ink-muted))">Min/Max</text>
          <line x1={PAD.l + 150} y1={PAD.t + 8} x2={PAD.l + 170} y2={PAD.t + 8} stroke="rgb(155,127,255)" strokeWidth="1.4" />
          <text x={PAD.l + 174} y={PAD.t + 11} fill="rgb(var(--ink-muted))">V_cm (3ωe)</text>
        </g>
      </svg>

      <div className="mt-3 grid grid-cols-3 gap-2 text-caption">
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('svpwm.minMaxVcmPeak')}</p>
          <p className="formula text-ink-primary">{formatNumber(vCmMax, 1)} V</p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('svpwm.minMaxAlgoDiff')}</p>
          <p className={`formula ${currentResult.maxDiff > 0.001 ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(currentResult.maxDiff * 100, 3)}%
          </p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('svpwm.minMaxOverMod')}</p>
          <p className={`formula ${currentResult.mm.saturated ? 'text-accent-fault' : 'text-accent-measure'}`}>
            {currentResult.mm.saturated ? t('common.yes') : t('common.no')}
          </p>
        </div>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        {t('svpwm.minMaxExplain')}
      </p>
    </Card>
  );
}
