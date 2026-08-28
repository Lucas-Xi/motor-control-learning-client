import { useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { applyLimits } from '../../simulation/math/limits';
import { useI18n } from '../../i18n/useI18n';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

/**
 * 电流圆 + 电压椭圆联合约束投影卡：消费 src/simulation/math/limits.ts 中的 applyLimits。
 *
 * 教学要点：
 *   - 电流圆 (黄色)：|I|² ≤ I_lim²，半径固定，发热硬约束
 *   - 电压椭圆 (紫色)：(Ld·id+ψf)² + (Lq·iq)² ≤ (V_lim/ωe)²
 *     椭圆中心在 (-ψf/Ld, 0)；ωe 升高 → 椭圆收缩
 *   - 工作点不可行 → 自动投影到可行域 (mint 圆点 → 红色箭头 → 投影点)
 *   - activeConstraint：none / current / voltage / both
 */

const W = 460;
const H = 320;
const PAD = { l: 50, r: 12, t: 18, b: 36 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

const ID_MIN = -40;
const ID_MAX = 10;
const IQ_MIN = -10;
const IQ_MAX = 40;

const xOf = (id: number) => PAD.l + ((id - ID_MIN) / (ID_MAX - ID_MIN)) * PW;
const yOf = (iq: number) => PAD.t + (1 - (iq - IQ_MIN) / (IQ_MAX - IQ_MIN)) * PH;
const scaleX = PW / (ID_MAX - ID_MIN);
const scaleY = PH / (IQ_MAX - IQ_MIN);

export function LimitProjectionCard() {
  const { t } = useI18n();
  // 读 store
  const id = useSimulationStore((s) => s.weakField.id);
  const iq = useSimulationStore((s) => s.weakField.iq);
  const uDc = useSimulationStore((s) => s.weakField.uDc);
  const targetRpm = useSimulationStore((s) => s.weakField.targetRpm);
  const currentLimit = useSimulationStore((s) => s.weakField.currentLimit);
  const voltageMargin = useSimulationStore((s) => s.weakField.voltageMargin);
  const ldMh = useSimulationStore((s) => s.motorBasics.ldMh);
  const lqMh = useSimulationStore((s) => s.motorBasics.lqMh);
  const flux = useSimulationStore((s) => s.motorBasics.flux);
  const polePairs = useSimulationStore((s) => s.motorBasics.polePairs);

  const { result, vLim, omegaE, ellipseRx, ellipseRy, centerX } = useMemo(() => {
    const ldH = ldMh / 1000;
    const lqH = lqMh / 1000;
    const ome = (targetRpm * 2 * Math.PI / 60) * polePairs;
    const vmax = (uDc / Math.sqrt(3)) * Math.max(0.5, Math.min(1, voltageMargin));
    const r = applyLimits({
      id,
      iq,
      Ilim: currentLimit,
      Vlim: vmax,
      omega_e: ome,
      Ld: ldH,
      Lq: lqH,
      psi_f: flux,
    });
    // 椭圆几何：半轴 a/Ld（id 方向）, a/Lq (iq 方向)，中心 -ψf/Ld
    const a = vmax / Math.max(Math.abs(ome), 1e-3);
    return {
      result: r,
      vLim: vmax,
      omegaE: ome,
      ellipseRx: a / ldH,
      ellipseRy: a / lqH,
      centerX: -flux / ldH,
    };
  }, [id, iq, uDc, targetRpm, currentLimit, voltageMargin, ldMh, lqMh, flux, polePairs]);

  const currentR = currentLimit;

  return (
    <Card title={t('weakField.limitProjectionTitle')} eyebrow="limit projection" density="compact">
      <p className="mb-2 text-caption leading-relaxed text-ink-muted">
        {t('weakField.limitProjectionFormulaLabel')} <code className="formula text-ink-secondary">id² + iq² ≤ Ilim² ∧ (Ld·id + ψf)² + (Lq·iq)² ≤ (Vlim/ωe)²</code>
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${t('weakField.limitProjectionAriaPrefix')} id=${formatNumber(id, 1)} iq=${formatNumber(iq, 1)}${t('weakField.limitProjectionAriaActive')} ${result.activeConstraint}${t('weakField.limitProjectionAriaMargin')} ${formatNumber(result.currentMargin, 1)}A`}
      >
        <rect x="0" y="0" width={W} height={H} rx="8" fill="rgb(var(--bg-base))" />

        {/* 坐标轴 */}
        <line x1={PAD.l} y1={yOf(0)} x2={W - PAD.r} y2={yOf(0)} stroke="rgba(231,243,255,0.18)" strokeWidth="1" />
        <line x1={xOf(0)} y1={PAD.t} x2={xOf(0)} y2={H - PAD.b} stroke="rgba(231,243,255,0.18)" strokeWidth="1" />

        {/* 电流极限圆 (warn 黄) */}
        <ellipse
          cx={xOf(0)}
          cy={yOf(0)}
          rx={currentR * scaleX}
          ry={currentR * scaleY}
          fill="rgba(255,184,77,0.04)"
          stroke="rgb(var(--accent-warn))"
          strokeWidth="1.8"
          strokeDasharray="5 4"
        />

        {/* 电压极限椭圆 (primary 紫) — clamp 太大椭圆以免画出框 */}
        {ellipseRx < 200 && ellipseRy < 200 && (
          <ellipse
            cx={xOf(centerX)}
            cy={yOf(0)}
            rx={Math.min(ellipseRx * scaleX, 600)}
            ry={Math.min(ellipseRy * scaleY, 600)}
            fill={result.activeConstraint === 'voltage' || result.activeConstraint === 'both' ? 'rgba(255,92,122,0.06)' : 'rgba(155,127,255,0.04)'}
            stroke={result.activeConstraint === 'voltage' || result.activeConstraint === 'both' ? 'rgb(var(--accent-fault))' : '#9b7fff'}
            strokeWidth="1.8"
          />
        )}

        {/* 投影路径 (不可行时) */}
        {!result.feasible && (
          <g>
            <line
              x1={xOf(id)}
              y1={yOf(iq)}
              x2={xOf(result.projectedId)}
              y2={yOf(result.projectedIq)}
              stroke="rgb(var(--accent-fault))"
              strokeWidth="1.5"
              markerEnd="url(#projArrow)"
            />
            <defs>
              <marker id="projArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--accent-fault))" />
              </marker>
            </defs>
            <circle cx={xOf(result.projectedId)} cy={yOf(result.projectedIq)} r="5" fill="rgb(var(--accent-measure))" stroke="rgb(var(--ink-primary))" strokeWidth="1" />
          </g>
        )}

        {/* 原始工作点 (mint or fault) */}
        <circle
          cx={xOf(id)}
          cy={yOf(iq)}
          r="6"
          fill={result.feasible ? 'rgb(var(--accent-measure))' : 'rgb(var(--accent-fault))'}
          stroke="rgb(var(--ink-primary))"
          strokeWidth="1.5"
        />

        {/* 椭圆中心标 */}
        <circle cx={xOf(centerX)} cy={yOf(0)} r="2" fill="#9b7fff" />
        <text x={xOf(centerX) - 4} y={yOf(0) + 14} fill="#9b7fff" fontSize="9" textAnchor="end">
          −ψf/Ld
        </text>

        {/* 轴标签 */}
        <text x={W - PAD.r - 4} y={yOf(0) - 4} fill="rgb(var(--ink-muted))" fontSize="11" textAnchor="end">
          Id (A) →
        </text>
        <text x={xOf(0) + 6} y={PAD.t + 10} fill="rgb(var(--ink-muted))" fontSize="11">
          ↑ Iq (A)
        </text>

        {/* 图例 */}
        <g fontSize="10" fontFamily="Cascadia Code, Consolas, monospace">
          <line x1={PAD.l + 4} y1={PAD.t + 8} x2={PAD.l + 24} y2={PAD.t + 8} stroke="rgb(var(--accent-warn))" strokeWidth="2" strokeDasharray="5 4" />
          <text x={PAD.l + 28} y={PAD.t + 11} fill="rgb(var(--ink-muted))">{t('weakField.limitProjectionLegendCurrentCircle')}</text>
          <line x1={PAD.l + 74} y1={PAD.t + 8} x2={PAD.l + 94} y2={PAD.t + 8} stroke="#9b7fff" strokeWidth="2" />
          <text x={PAD.l + 98} y={PAD.t + 11} fill="rgb(var(--ink-muted))">{t('weakField.limitProjectionLegendVoltageEllipse')}</text>
        </g>
      </svg>

      <div className="mt-3 grid grid-cols-4 gap-2 text-caption">
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('weakField.limitProjectionMetricActive')}</p>
          <p className={`formula ${result.activeConstraint === 'none' ? 'text-accent-measure' : 'text-accent-fault'}`}>
            {result.activeConstraint === 'none' ? t('weakField.limitProjectionFeasible') : result.activeConstraint}
          </p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('weakField.limitProjectionMetricCurrentMargin')}</p>
          <p className={`formula ${result.currentMargin < 0 ? 'text-accent-fault' : 'text-ink-primary'}`}>
            {formatNumber(result.currentMargin, 1)} A
          </p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('weakField.limitProjectionMetricVoltageMargin')}</p>
          <p className={`formula ${result.voltageMargin < 0 ? 'text-accent-fault' : 'text-ink-primary'}`}>
            {formatNumber(result.voltageMargin, 1)} V
          </p>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base p-2">
          <p className="text-ink-muted">{t('weakField.limitProjectionMetricProjectedId')}</p>
          <p className="formula text-ink-primary">
            {formatNumber(result.projectedId, 1)}
          </p>
        </div>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-muted">
        ωe = {formatNumber(omegaE, 0)} rad/s · Vlim = {formatNumber(vLim, 1)} V ·
        {' '}{t('weakField.limitProjectionShrinkHint')}
      </p>
    </Card>
  );
}
