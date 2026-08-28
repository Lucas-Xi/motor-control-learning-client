import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { simulateStartup } from '../../simulation/math/startup';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { useI18n } from '../../i18n/useI18n';

/**
 * HFI→BEMF 估计器过渡可视化。
 *
 * 当状态从 hfi 切换到 bemf 时，模拟角度误差的变化。
 * 在 HFI 区域，角度误差由高频注入信噪比决定（凸极比越高误差越小）；
 * 在 BEMF 区域，误差由反电动势幅值决定（转速越高误差越小）。
 * 过渡时刻会有一个瞬态扰动（角度跳变尔后收敛）。
 */
export function ObserverTransitionCard() {
  const { t } = useI18n();
  const startup = useSimulationStore((s) => s.startup);
  const { samples, transitionTime } = useMemo(() => {
    const base = simulateStartup(startup);
    // 在 samples 中标注 HFI→BEMF 切换时刻
    let hfiToBemfTime: number | null = null;
    for (let i = 1; i < base.length; i++) {
      if (base[i - 1].state === 'hfi' && base[i].state === 'bemf') {
        hfiToBemfTime = base[i].t;
        break;
      }
    }
    // 人工合成角度误差曲线（真实情况应该从 HFI/BEMF 观测器得到）
    const augmented = base.map((s) => {
      let angleErrorDeg = 0;
      if (s.state === 'hfi') {
        // HFI 区域：误差随凸极比和转速改善
        const rpmRatio = Math.min(1, s.rpm / 300);
        angleErrorDeg = 25 - 18 * rpmRatio + (Math.random() - 0.5) * 4;
      } else if (s.state === 'bemf') {
        // BEMF 区域：误差随转速升高而减小
        const rpmRatio = Math.min(1, s.rpm / 5000);
        angleErrorDeg = 12 - 10 * rpmRatio + (Math.random() - 0.5) * 3;
      } else if (s.state === 'fieldweak') {
        // 弱磁后稳定
        angleErrorDeg = 2 + (Math.random() - 0.5) * 2;
      } else {
        angleErrorDeg = 0;
      }
      // 过渡时刻增加一个瞬态尖峰
      if (hfiToBemfTime !== null && Math.abs(s.t - hfiToBemfTime) < 50) {
        angleErrorDeg += 15 * (1 - Math.abs(s.t - hfiToBemfTime) / 50);
      }
      return { ...s, angleErrorDeg: Math.max(0, angleErrorDeg) };
    });
    return { samples: augmented, transitionTime: hfiToBemfTime };
  }, [startup]);

  return (
    <Card title={t('charts.obTitle')} eyebrow={t('charts.obEyebrow')} density="compact">
      <div className="h-36">
        <SafeResponsiveContainer>
          <AreaChart data={samples} margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(148,210,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#8fb7c9', fontSize: 9 }} unit="ms" />
            <YAxis tick={{ fill: '#8fb7c9', fontSize: 9 }} unit="°" domain={[0, 40]} />
            <Tooltip
              contentStyle={{ background: '#07111f', border: '1px solid rgba(52,214,255,.35)', borderRadius: 10, fontSize: 11 }}
              formatter={((v: unknown) => [`${formatNumber(Number(v), 1)}°`, t('charts.obAngleError')]) as never}
            />
            {transitionTime !== null && (
              <ReferenceLine x={transitionTime} stroke="#ffb84d" strokeDasharray="3 4"
                label={{ value: 'HFI→BEMF', fill: '#ffb84d', fontSize: 8, position: 'top' }} />
            )}
            <defs>
              <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ff5c7a" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#ff5c7a" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="angleErrorDeg" stroke="#ff5c7a" strokeWidth={1.5}
              fill="url(#errGrad)" dot={false} isAnimationActive={false} name={t('charts.obSeriesName')} />
          </AreaChart>
        </SafeResponsiveContainer>
      </div>
      <p className="mt-1 text-caption leading-relaxed text-ink-secondary">
        {t('charts.obNote')}
      </p>
    </Card>
  );
}