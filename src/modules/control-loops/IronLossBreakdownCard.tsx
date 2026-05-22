import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import { defaultIronLossParams, ironLoss } from '../../simulation/math/ironLoss';
import { formatNumber } from '../../utils/format';

/**
 * 铁损分解卡片：转速扫描 Bertotti 三项（磁滞 + 经典涡流 + 异常）+ 铜损对比。
 * 教学目的：让学员看见"高速段铁损是涡流主导（频率平方）"，
 * 解释为什么 EV 主驱 12000 rpm 巡航效率会比 4000 rpm 低 4-6 个 percentage points。
 */
export function IronLossBreakdownCard() {
  const motor = useSimulationStore((s) => s.motorBasics);
  const { locale } = useI18n();
  const isEn = locale === 'en-US';

  const [iq, setIq] = useState(motor.ratedCurrent * 0.6);

  // 扫描转速 100..6000 rpm 共 24 个点
  const data = useMemo(() => {
    const N = 24;
    const rpmMin = 100;
    const rpmMax = 6000;
    const rs = (motor.rs ?? 0.5);
    return Array.from({ length: N + 1 }, (_, k) => {
      const rpm = rpmMin + ((rpmMax - rpmMin) * k) / N;
      const omegaMech = (rpm / 60) * 2 * Math.PI;
      const omegaElec = omegaMech * motor.polePairs;
      const loss = ironLoss(omegaElec, iq, defaultIronLossParams);
      // 铜损：3 相 × 1/2 × i² × R（dq 等效用 3/2 因子）
      const pCopper = 1.5 * iq * iq * rs;
      const pIn = loss.total + pCopper;
      const pOut = Math.max(0, motor.flux * 1.5 * motor.polePairs * iq * omegaMech);
      const eff = pOut > 1e-3 ? (pOut / (pOut + loss.total + pCopper)) * 100 : 0;
      return {
        rpm: Math.round(rpm),
        ph: Number(loss.ph.toFixed(2)),
        pe: Number(loss.pe.toFixed(2)),
        pa: Number(loss.pa.toFixed(2)),
        pcu: Number(pCopper.toFixed(2)),
        ptot: Number(pIn.toFixed(2)),
        eff: Number(eff.toFixed(1)),
      };
    });
  }, [iq, motor.rs, motor.polePairs, motor.flux]);

  // 当前工作点：取 4000 rpm 作为家用空调典型巡航
  const current = useMemo(() => {
    const cruiseRpm = 4000;
    const omegaMech = (cruiseRpm / 60) * 2 * Math.PI;
    const omegaElec = omegaMech * motor.polePairs;
    const loss = ironLoss(omegaElec, iq, defaultIronLossParams);
    const rs = (motor.rs ?? 0.5);
    const pCu = 1.5 * iq * iq * rs;
    return { ...loss, pCu };
  }, [iq, motor.rs, motor.polePairs]);

  const totalAtCruise = current.total + current.pCu;
  const ironPct = totalAtCruise > 0 ? (current.total / totalAtCruise) * 100 : 0;
  const ironTone = ironPct < 30 ? 'measure' : ironPct < 50 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={isEn ? 'Iron Loss Breakdown (Bertotti)' : '铁损分解（Bertotti 三项）'}
      eyebrow={isEn ? 'efficiency reality check' : '效率云图照妖镜'}
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={
            isEn
              ? 'Bertotti 1988: P_fe = P_h + P_e + P_a (hysteresis + classical eddy + anomalous). Reveals why high-speed efficiency drops.'
              : 'Bertotti 1988：P_fe = P_h + P_e + P_a（磁滞 + 经典涡流 + 异常）。揭示高速效率下降的真因。'
          }
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? 'Iron loss is often ignored in simplified models, but at 4000+ rpm it can match or exceed copper loss. The eddy-current term grows as f², so high-speed cruise efficiency drops sharply. Drag iq to see the tradeoff.'
          : '简化模型常忽略铁损，但 4000+ rpm 时它可达甚至超过铜损。涡流项随 f² 增长，所以高速巡航效率断崖式下降。拖动 iq 看权衡。'}
      </p>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{isEn ? 'Cu loss @ 4kRPM' : '铜损 @4krpm'}</p>
          <p className="formula text-body text-accent-primary">{formatNumber(current.pCu, 1)} W</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{isEn ? 'Fe loss @ 4kRPM' : '铁损 @4krpm'}</p>
          <p className="formula text-body text-accent-measure">{formatNumber(current.total, 1)} W</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(ironTone)}`}>
          <p className="text-caption opacity-80">{isEn ? 'Fe / Total' : '铁损占比'}</p>
          <p className="formula text-body">{formatNumber(ironPct, 0)} %</p>
        </div>
      </div>

      <label className="mb-3 block">
        <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
          <span>iq (A)</span>
          <span className="formula text-ink-primary">{formatNumber(iq, 2)}</span>
        </span>
        <input
          type="range"
          value={iq}
          min={0.5}
          max={motor.ratedCurrent * 1.2}
          step={0.1}
          onChange={(e) => setIq(Number(e.target.value))}
          className="simulation-slider w-full"
          aria-label="q 轴电流"
          aria-valuemin={0.5}
          aria-valuemax={motor.ratedCurrent * 1.2}
          aria-valuenow={iq}
          aria-valuetext={`${formatNumber(iq, 2)} A`}
        />
      </label>

      <div className="h-48">
        <SafeResponsiveContainer>
          <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 4, left: -6 }} stackOffset="none">
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="rpm" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" rpm" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" W" />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 8,
                color: '#e7f3ff',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Area type="monotone" stackId="loss" dataKey="ph" stroke="#34d6ff" fill="#34d6ff" fillOpacity={0.7} name="P_h 磁滞" isAnimationActive={false} />
            <Area type="monotone" stackId="loss" dataKey="pe" stroke="#43f7b5" fill="#43f7b5" fillOpacity={0.7} name="P_e 涡流" isAnimationActive={false} />
            <Area type="monotone" stackId="loss" dataKey="pa" stroke="#ffb84d" fill="#ffb84d" fillOpacity={0.6} name="P_a 异常" isAnimationActive={false} />
            <Area type="monotone" stackId="loss" dataKey="pcu" stroke="#ff5d8a" fill="#ff5d8a" fillOpacity={0.5} name="P_Cu 铜损" isAnimationActive={false} />
          </AreaChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {isEn ? (
          <>
            At low speed copper loss dominates (P_Cu = 1.5·iq²·Rs is speed-independent). At high speed
            the eddy term <span className="formula">P_e ∝ (f·B)²</span> takes over — this is why aggressive
            field weakening past base speed drops efficiency 4-6 pp.
          </>
        ) : (
          <>
            低速段铜损主导（P_Cu = 1.5·iq²·Rs 与转速无关）。高速段涡流项{' '}
            <span className="formula">P_e ∝ (f·B)²</span> 接管 —— 这就是为什么过深弱磁
            会让效率断崖式下降 4-6 个 percentage points。
          </>
        )}
      </p>
    </Card>
  );
}
