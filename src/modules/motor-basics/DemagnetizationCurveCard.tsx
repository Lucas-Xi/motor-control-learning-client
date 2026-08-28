import { useMemo } from 'react';
import { Line, LineChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

/**
 * 退磁曲线叠加卡。
 *
 * 显示永磁体在不同温度下的 B-H 退磁曲线，
 * 叠加工作点轨迹，警示不可逆退磁风险。
 */
export function DemagnetizationCurveCard() {
  const { t } = useI18n();
  const motor = useSimulationStore((s) => s.motorBasics);
  const updateMotor = useSimulationStore((s) => s.updateMotorBasics);

  const { curves, operatingPoint } = useMemo(() => {
    // 基准磁通密度 Br20 = 1.2 T（20°C），矫顽力 Hc = 900 kA/m
    const br20 = 1.2;
    const hc20 = 900;
    // 温度系数 -0.12%/°C（Br），+0.4%/°C（Hc）
    const temps = [20, 80, 120, 150];
    const curves = temps.map((t) => {
      const br = br20 * (1 - 0.0012 * (t - 20));
      const hc = hc20 * (1 + 0.004 * (t - 20));
      // 生成 B-H 曲线（线性近似）：B = Br + (Br/Hc) * H
      const points: Array<{ H: number; B: number; temp: number }> = [];
      for (let i = 0; i <= 40; i++) {
        const H = -hc + (i / 40) * hc * 1.2;
        const B = br + (br / hc) * H;
        points.push({ H: -H / 1000, B: Math.max(0, B), temp: t }); // H 取正方向，单位 kA/m
      }
      return { temp: t, points, br, hc };
    });

    // 工作点：基于当前磁链 flux 与额定磁链的比值估算退磁程度
    const fluxRatio = motor.demagnetizationRatio ?? 0;
    const opH = -200 * (1 + fluxRatio * 3); // kA/m
    const opB = Math.max(0, 1.2 * (1 - fluxRatio) * (1 - opH / 900));
    const operatingPoint = { H: -opH, B: opB };

    return { curves, operatingPoint };
  }, [motor]);

  const demagPct = (motor.demagnetizationRatio ?? 0) * 100;
  const toneClass = demagPct < 10 ? 'measure' : demagPct < 30 ? 'warn' : 'fault';

  return (
    <Card title={t('motorBasics.demagCurveTitle')} eyebrow={t('motorBasics.demagCurveEyebrow')} density="compact"
      action={
        <span className={`rounded-md border px-2 py-0.5 text-caption font-medium ${
          toneClass === 'measure' ? 'border-accent-measure/30 bg-accent-measure/10 text-accent-measure'
            : toneClass === 'warn' ? 'border-accent-warn/30 bg-accent-warn/10 text-accent-warn'
              : 'border-accent-fault/30 bg-accent-fault/10 text-accent-fault'
        }`}>
          {t('motorBasics.demagCurveBadgePrefix')}{formatNumber(demagPct, 0)}%
        </span>
      }
    >
      {/* 退磁程度滑块 */}
      <div className="mb-2 flex items-center gap-2">
        <input
          type="range" min="0" max="100" value={demagPct}
          onChange={(e) => updateMotor({ demagnetizationRatio: Number(e.target.value) / 100 })}
          className="flex-1 accent-accent-primary"
          aria-label={t('motorBasics.demagCurveSliderAria')}
          aria-valuetext={`${formatNumber(demagPct, 0)}%`}
        />
        <span className="w-10 text-right text-caption text-ink-muted">{formatNumber(demagPct, 0)}%</span>
      </div>
      {/* B-H 曲线 */}
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart margin={{ top: 8, right: 8, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(148,210,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="H" tick={{ fill: '#8fb7c9', fontSize: 9 }} unit="kA/m" domain={[-1100, 200]} />
            <YAxis tick={{ fill: '#8fb7c9', fontSize: 9 }} unit="T" domain={[0, 1.5]} />
            <Tooltip
              contentStyle={{ background: '#07111f', border: '1px solid rgba(52,214,255,.35)', borderRadius: 10, fontSize: 11 }}
              formatter={((v: unknown) => [formatNumber(Number(v), 3), '']) as never}
            />
            <ReferenceLine y={0} stroke="rgba(148,210,255,0.15)" />
            <ReferenceLine x={0} stroke="rgba(148,210,255,0.15)" />
            {curves.map((c) => (
              <Line key={c.temp} data={c.points} type="monotone" dataKey="B" stroke={
                c.temp === 20 ? '#34d6ff' : c.temp === 80 ? '#43f7b5' : c.temp === 120 ? '#ffb84d' : '#ff5c7a'
              } strokeWidth={1.5} dot={false} isAnimationActive={false}
                name={`${c.temp}°C`} />
            ))}
            {/* 工作点 */}
            <Line data={[operatingPoint]} type="monotone" dataKey="B"
              stroke="#fff" strokeWidth={0} dot={{ r: 6, fill: '#fff', stroke: '#ff5c7a', strokeWidth: 2 }}
              isAnimationActive={false} name={t('motorBasics.demagCurveOperatingPoint')} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap gap-2 text-caption text-ink-muted">
        <span><span style={{ color: '#34d6ff' }}>━</span> 20°C</span>
        <span><span style={{ color: '#43f7b5' }}>━</span> 80°C</span>
        <span><span style={{ color: '#ffb84d' }}>━</span> 120°C</span>
        <span><span style={{ color: '#ff5c7a' }}>━</span> 150°C</span>
        <span className="text-ink-primary">● {t('motorBasics.demagCurveOperatingPoint')}</span>
      </div>
      {demagPct > 20 && (
        <p className="mt-2 rounded border border-accent-fault/20 bg-accent-fault/8 px-2 py-1 text-caption text-accent-fault">
          {t('motorBasics.demagCurveWarning')}
        </p>
      )}
    </Card>
  );
}