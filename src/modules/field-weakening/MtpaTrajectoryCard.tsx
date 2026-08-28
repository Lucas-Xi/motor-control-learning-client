import { useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { solveMtpa } from '../../simulation/math/mtpa';
import { useI18n } from '../../i18n/useI18n';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

/**
 * MTPA 曲线卡：消费 src/simulation/math/mtpa.ts 中的 solveMtpa（闭式 + Newton 迭代）。
 *
 * 教学要点：
 *   - SPM (Lq ≈ Ld)：MTPA 轨迹退化为 q 轴直线 (id*=0)
 *   - IPM (Lq > Ld)：MTPA 轨迹偏向 -id 方向，斜率由 ψf / (Lq-Ld) 决定
 *   - 同时在 id-iq 平面绘 SPM (mint) 与 IPM (cyan) 两条轨迹
 *
 * 公式（来自 mtpa.ts 文件头）：
 *   id* = [ψf − √(ψf² + 8·(Lq−Ld)²·iq²)] / [4·(Lq−Ld)]   (IPM)
 *   id* = 0                                                (SPM)
 */

const W = 460;
const H = 280;
const PAD = { l: 50, r: 12, t: 18, b: 36 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

// id-iq 平面范围（A）
const ID_MIN = -30;
const ID_MAX = 5;
const IQ_MIN = 0;
const IQ_MAX = 30;

const xOf = (id: number) => PAD.l + ((id - ID_MIN) / (ID_MAX - ID_MIN)) * PW;
const yOf = (iq: number) => PAD.t + (1 - (iq - IQ_MIN) / (IQ_MAX - IQ_MIN)) * PH;

export function MtpaTrajectoryCard() {
  const { t } = useI18n();
  // 从 store 读电机参数（与 MtpaCurveCard 同源）
  const ldMh = useSimulationStore((s) => s.motorBasics.ldMh);
  const lqMh = useSimulationStore((s) => s.motorBasics.lqMh);
  const flux = useSimulationStore((s) => s.motorBasics.flux);
  const polePairs = useSimulationStore((s) => s.motorBasics.polePairs);
  const id = useSimulationStore((s) => s.weakField.id);
  const iq = useSimulationStore((s) => s.weakField.iq);

  // 同 ldMh 取 SPM 等效 (假装 Lq = Ld) 与 IPM (原参数) 两条曲线
  const { ipmPath, spmPath, currentWorkPoint } = useMemo(() => {
    const ldH = ldMh / 1000;
    const lqH = lqMh / 1000;
    // 转矩扫描：T_ref 从 0 → 一个能让 |I| 接近 30 A 的上限
    const Tmax = 1.5 * polePairs * flux * IQ_MAX * 1.2;
    const N = 40;
    const ipmPts: Array<{ id: number; iq: number }> = [];
    const spmPts: Array<{ id: number; iq: number }> = [];
    for (let i = 0; i <= N; i += 1) {
      const T = (i / N) * Tmax;
      const ipm = solveMtpa({ T_ref: T, Ld: ldH, Lq: lqH, psi_f: flux, pole_pairs: polePairs });
      const spm = solveMtpa({ T_ref: T, Ld: ldH, Lq: ldH, psi_f: flux, pole_pairs: polePairs });
      ipmPts.push({ id: ipm.id_ref, iq: ipm.iq_ref });
      spmPts.push({ id: spm.id_ref, iq: spm.iq_ref });
    }

    // 当前工作点对应的 MTPA 解
    const torqueNow = 1.5 * polePairs * (flux * iq + (ldH - lqH) * id * iq);
    const ipmAtNow = solveMtpa({
      T_ref: Math.max(0, torqueNow),
      Ld: ldH,
      Lq: lqH,
      psi_f: flux,
      pole_pairs: polePairs,
    });

    const toPath = (pts: Array<{ id: number; iq: number }>) =>
      pts
        .filter((p) => p.id >= ID_MIN && p.id <= ID_MAX && p.iq >= IQ_MIN && p.iq <= IQ_MAX)
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.id).toFixed(1)} ${yOf(p.iq).toFixed(1)}`)
        .join(' ');

    return {
      ipmPath: toPath(ipmPts),
      spmPath: toPath(spmPts),
      currentWorkPoint: ipmAtNow,
    };
  }, [ldMh, lqMh, flux, polePairs, id, iq]);

  const isIpm = Math.abs(lqMh - ldMh) > 0.01;
  const distanceToMtpa = Math.hypot(id - currentWorkPoint.id_ref, iq - currentWorkPoint.iq_ref);

  return (
    <Card title={t('weakField.mtpaTrajectoryTitle')} eyebrow="max torque per ampere" density="compact">
      <p className="mb-2 text-caption leading-relaxed text-ink-muted">
        {t('weakField.mtpaTrajectoryFormulaLabel')} <code className="formula text-ink-secondary">id* = [ψf − √(ψf² + 8·(Lq−Ld)²·iq²)] / [4·(Lq−Ld)]</code>
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${t('weakField.mtpaTrajectoryAriaPrefix')} id=${formatNumber(id, 1)}A iq=${formatNumber(iq, 1)}A${t('weakField.mtpaTrajectoryAriaDist')} ${formatNumber(distanceToMtpa, 1)}A`}
      >
        <rect x="0" y="0" width={W} height={H} rx="8" fill="rgb(var(--bg-base))" />

        {/* 坐标轴 */}
        <line x1={PAD.l} y1={yOf(0)} x2={W - PAD.r} y2={yOf(0)} stroke="rgba(231,243,255,0.16)" strokeWidth="1" />
        <line x1={xOf(0)} y1={PAD.t} x2={xOf(0)} y2={H - PAD.b} stroke="rgba(231,243,255,0.16)" strokeWidth="1" />

        {/* 网格线 (每 5 A) */}
        {[-25, -20, -15, -10, -5].map((v) => (
          <line key={v} x1={xOf(v)} y1={PAD.t} x2={xOf(v)} y2={H - PAD.b} stroke="rgba(231,243,255,0.05)" strokeWidth="1" />
        ))}
        {[5, 10, 15, 20, 25].map((v) => (
          <line key={v} x1={PAD.l} y1={yOf(v)} x2={W - PAD.r} y2={yOf(v)} stroke="rgba(231,243,255,0.05)" strokeWidth="1" />
        ))}

        {/* SPM 轨迹（mint，沿 +iq 直线） */}
        <path d={spmPath} stroke="rgb(var(--accent-measure))" strokeWidth="1.8" strokeDasharray="6 4" fill="none" />
        {/* IPM 轨迹（cyan，弧向 -id） */}
        <path d={ipmPath} stroke="rgb(var(--accent-primary))" strokeWidth="2" fill="none" />

        {/* 当前工作点 */}
        <circle cx={xOf(id)} cy={yOf(iq)} r="6" fill="rgb(var(--accent-warn))" stroke="rgb(var(--ink-primary))" strokeWidth="1.5" />
        {/* 同等转矩的 MTPA 点 */}
        <circle cx={xOf(currentWorkPoint.id_ref)} cy={yOf(currentWorkPoint.iq_ref)} r="4" fill="rgb(var(--accent-primary))" />
        {/* 偏离箭头 */}
        {distanceToMtpa > 0.5 && (
          <line
            x1={xOf(id)}
            y1={yOf(iq)}
            x2={xOf(currentWorkPoint.id_ref)}
            y2={yOf(currentWorkPoint.iq_ref)}
            stroke="rgb(var(--accent-warn))"
            strokeWidth="1.3"
            strokeDasharray="3 3"
            opacity="0.7"
          />
        )}

        {/* 轴标签 */}
        <text x={W - PAD.r - 4} y={yOf(0) - 4} fill="rgb(var(--ink-muted))" fontSize="11" textAnchor="end">
          Id (A) →
        </text>
        <text x={xOf(0) + 6} y={PAD.t + 10} fill="rgb(var(--ink-muted))" fontSize="11">
          ↑ Iq (A)
        </text>
        <text x={xOf(-25)} y={H - 14} fill="rgb(var(--ink-muted))" fontSize="10" textAnchor="middle">−25</text>
        <text x={xOf(-15)} y={H - 14} fill="rgb(var(--ink-muted))" fontSize="10" textAnchor="middle">−15</text>
        <text x={xOf(-5)} y={H - 14} fill="rgb(var(--ink-muted))" fontSize="10" textAnchor="middle">−5</text>
        <text x={PAD.l - 6} y={yOf(20) + 3} fill="rgb(var(--ink-muted))" fontSize="10" textAnchor="end">20</text>
        <text x={PAD.l - 6} y={yOf(10) + 3} fill="rgb(var(--ink-muted))" fontSize="10" textAnchor="end">10</text>

        {/* 图例 */}
        <g fontSize="10" fontFamily="Cascadia Code, Consolas, monospace">
          <line x1={W - 130} y1={PAD.t + 8} x2={W - 110} y2={PAD.t + 8} stroke="rgb(var(--accent-primary))" strokeWidth="2" />
          <text x={W - 106} y={PAD.t + 11} fill="rgb(var(--ink-muted))">IPM MTPA</text>
          <line x1={W - 130} y1={PAD.t + 22} x2={W - 110} y2={PAD.t + 22} stroke="rgb(var(--accent-measure))" strokeWidth="2" strokeDasharray="6 4" />
          <text x={W - 106} y={PAD.t + 25} fill="rgb(var(--ink-muted))">SPM MTPA</text>
          <circle cx={W - 122} cy={PAD.t + 36} r="4" fill="rgb(var(--accent-warn))" />
          <text x={W - 106} y={PAD.t + 39} fill="rgb(var(--ink-muted))">{t('weakField.mtpaTrajectoryLegendCurrent')}</text>
        </g>
      </svg>

      <div className="mt-3 grid grid-cols-3 gap-2 text-caption">
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('weakField.mtpaTrajectoryMetricMotorType')}</p>
          <p className="formula text-ink-primary">{isIpm ? `IPM Lq/Ld=${formatNumber(lqMh / ldMh, 2)}` : 'SPM (Lq≈Ld)'}</p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">MTPA Id*</p>
          <p className="formula text-accent-primary">{formatNumber(currentWorkPoint.id_ref, 2)} A</p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('weakField.mtpaTrajectoryMetricDeviation')}</p>
          <p className={`formula ${distanceToMtpa > 2 ? 'text-accent-warn' : 'text-accent-measure'}`}>
            {formatNumber(distanceToMtpa, 2)} A
          </p>
        </div>
      </div>
    </Card>
  );
}
