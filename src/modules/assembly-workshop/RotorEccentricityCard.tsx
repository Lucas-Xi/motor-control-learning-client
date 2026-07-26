import { useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

/**
 * 转子偏心可视化 + 气隙磁密 NTF 分析。
 *
 * 静态偏心：转子旋转中心与定子中心不重合 → 气隙不均匀 → 单边磁拉力 → NTF（Noise, 噪声）
 * 动态偏心：转子绕定子中心旋转但转子自身质心偏移 → 随转旋转的气隙变化
 *
 * NTF = 径向电磁力密度在气隙中的空间分布，通过 Maxwell 应力张量计算
 *    σ_rad = (B_r^2 - B_t^2) / (2μ₀)
 *    B_r = 气隙径向磁密，B_t = 切向磁密（近似忽略）
 *
 * 本组件简化建模：偏心 → 气隙长度变化 → 磁导变化 → 磁密变化 → 径向力密度变化
 */
export function RotorEccentricityCard() {
  const motor = useSimulationStore((s) => s.motorBasics);
  const updateMotor = useSimulationStore((s) => s.updateMotorBasics);

  // 简化的偏心参数（0-100%）
  const eccentricityPct = motor.demagnetizationRatio ?? 0;
  const setEccentricity = (v: number) => updateMotor({ demagnetizationRatio: v });

  // 气隙磁密 NTF 分析
  const ntfData = useMemo(() => {
    const points: Array<{ theta: number; Bnormal: number; sigmaRad: number }> = [];
    const mu0 = 4 * Math.PI * 1e-7;
    const BrNominal = 0.85;    // 额定气隙磁密（T）
    const polePairs = motor.polePairs || 4;

    for (let i = 0; i < 360; i++) {
      const theta = (i * Math.PI) / 180;
      // 偏心导致气隙长度变化：g(θ) = g₀ · (1 - ε·cos(θ))
      const eps = eccentricityPct / 100;
      const gapRatio = 1 - eps * Math.cos(theta * polePairs);
      // 磁密与气隙成反比（忽略饱和）
      const Bnormal = BrNominal / Math.max(gapRatio, 0.1);
      // 径向电磁力密度 σ_rad = B²/(2μ₀)
      const sigmaRad = (Bnormal * Bnormal) / (2 * mu0) / 1e3; // kPa
      points.push({ theta: i, Bnormal, sigmaRad });
    }
    return points;
  }, [eccentricityPct, motor.polePairs]);

  const maxSigma = Math.max(...ntfData.map((d) => d.sigmaRad));
  const minSigma = Math.min(...ntfData.map((d) => d.sigmaRad));
  const sigmaRipple = maxSigma - minSigma;

  return (
    <Card title="转子偏心" eyebrow="气隙磁密 · NTF 噪声分析" density="compact"
      className="overflow-visible"
    >
      <div className="mb-2">
        <label htmlFor="assembly-rotor-eccentricity" className="mb-1 block text-caption text-ink-muted">偏心度</label>
        <input
          id="assembly-rotor-eccentricity"
          type="range" min="0" max="50" value={eccentricityPct * 100}
          onChange={(e) => setEccentricity(Number(e.target.value) / 100)}
          className="w-full accent-accent-primary"
        />
        <div className="flex justify-between text-caption text-ink-muted">
          <span>0%</span>
          <span>{formatNumber(eccentricityPct * 100, 0)}%</span>
          <span>50%</span>
        </div>
      </div>

      {/* 极坐标气隙磁密 */}
      <div className="relative mx-auto h-40 w-40">
        <svg viewBox="-1.1 -1.1 2.2 2.2" className="h-full w-full">
          {/* 定子内圆 */}
          <circle cx="0" cy="0" r="1" fill="none" stroke="rgba(148,210,255,0.15)" strokeWidth="0.02" />
          {/* 转子外圆（偏心显示） */}
          <circle
            cx={eccentricityPct * 0.5} cy="0" r="0.7"
            fill="rgba(52,214,255,0.08)" stroke="#34d6ff" strokeWidth="0.03"
          />
          {/* 气隙磁密径向条 */}
          {ntfData.filter((_, i) => i % 6 === 0).map((d) => {
            const rad = (d.theta * Math.PI) / 180;
            const r1 = 0.72;
            const r2 = 0.72 + (d.Bnormal / 1.2) * 0.28;
            const color = d.Bnormal > 0.9 ? '#ff5c7a' : '#34d6ff';
            return (
              <line
                key={d.theta}
                x1={r1 * Math.cos(rad)} y1={r1 * Math.sin(rad)}
                x2={r2 * Math.cos(rad)} y2={r2 * Math.sin(rad)}
                stroke={color} strokeWidth="0.03" strokeLinecap="round"
                opacity={0.7}
              />
            );
          })}
          {/* 中心标签 */}
          <text x="0" y="0.05" textAnchor="middle" fill="#8fb7c9" fontSize="0.12">
            {formatNumber(eccentricityPct * 100, 0)}%
          </text>
        </svg>
      </div>

      {/* 数值指标 */}
      <div className="mt-2 grid grid-cols-3 gap-1 text-caption">
        <div className="rounded border border-line-subtle bg-bg-base px-2 py-1 text-center">
          <div className="text-ink-muted">最大磁密</div>
          <div className="text-accent-primary">{formatNumber(Math.max(...ntfData.map((d) => d.Bnormal)), 3)} T</div>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base px-2 py-1 text-center">
          <div className="text-ink-muted">最小磁密</div>
          <div className="text-accent-primary">{formatNumber(Math.min(...ntfData.map((d) => d.Bnormal)), 3)} T</div>
        </div>
        <div className="rounded border border-line-subtle bg-bg-base px-2 py-1 text-center">
          <div className="text-ink-muted">NTF 脉动</div>
          <div className="text-accent-fault">{formatNumber(sigmaRipple, 1)} kPa</div>
        </div>
      </div>

      {eccentricityPct > 0.15 && (
        <p className="mt-2 rounded border border-accent-warn/20 bg-accent-warn/8 px-2 py-1 text-caption text-accent-warn">
          ⚠ 偏心 &gt; 15%：单边磁拉力显著增加，轴承寿命缩短，建议检查转子动平衡。
        </p>
      )}
    </Card>
  );
}