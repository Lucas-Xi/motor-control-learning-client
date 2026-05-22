import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import {
  bemfThd,
  coggingTorque,
  defaultBemfHarmonics,
  sampleCoggingParams,
} from '../../simulation/math/cogging';
import { formatNumber } from '../../utils/format';

/**
 * 齿槽转矩 + BEMF 空间谐波卡片：解释"低速咯咯响"与"电流环 6 倍频毛刺"两个教学难点。
 * 数据来源：cogging.ts 纯函数；电机参数从 motorBasics store 取 polePairs。
 */
export function CoggingTorqueCard() {
  const motor = useSimulationStore((s) => s.motorBasics);
  const { locale } = useI18n();
  const isEn = locale === 'en-US';

  // 齿槽参数：用海立 1.5HP 样本 + 学员当前 polePairs（slots 仍取 12）
  const cogParams = useMemo(
    () => ({
      ...sampleCoggingParams.hitachi15HP,
      polePairs: motor.polePairs,
    }),
    [motor.polePairs],
  );

  // 扫描机械角 0..2π 共 240 个点
  const waveform = useMemo(() => {
    const N = 240;
    return Array.from({ length: N + 1 }, (_, k) => {
      const theta = (k / N) * 2 * Math.PI;
      const r = coggingTorque(theta, cogParams);
      return {
        deg: Number(((theta * 180) / Math.PI).toFixed(1)),
        T_cog_mNm: r.torque * 1000,
      };
    });
  }, [cogParams]);

  const periodPerRev = useMemo(() => coggingTorque(0, cogParams).periodPerRev, [cogParams]);
  const peak = useMemo(() => {
    let max = 0;
    for (const p of waveform) if (Math.abs(p.T_cog_mNm) > max) max = Math.abs(p.T_cog_mNm);
    return max;
  }, [waveform]);

  // BEMF 谐波柱状图数据
  const harmonicsData = useMemo(
    () =>
      defaultBemfHarmonics.map((h) => ({
        order: `${h.order}`,
        coef_pct: h.coef * 100,
      })),
    [],
  );
  const thd = useMemo(() => bemfThd(defaultBemfHarmonics) * 100, []);
  const thdTone = thd < 5 ? 'measure' : thd < 10 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={isEn ? 'Cogging Torque + BEMF Harmonics' : '齿槽转矩 + BEMF 空间谐波'}
      eyebrow={isEn ? 'low-speed ripple sources' : '低速纹波根源'}
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={
            isEn
              ? 'LCM(slots, poles) harmonic series + 5/7/11/13 BEMF spatial harmonics; explains low-speed jitter and 6× current ripple.'
              : 'LCM(槽数, 极数) 谐波叠加 + BEMF 5/7/11/13 次空间谐波；解释低速抖动与电流环 6 倍频纹波。'
          }
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? 'Cogging torque comes from the periodic reluctance variation between stator slots and rotor magnets. Visible at low speed (jitter / "kakaka" noise), smoothed at high speed by inertia. BEMF is not pure sine — fractional-pitch winding + slotting bring 5/7/11/13-th harmonics.'
          : '齿槽转矩来自定子槽与转子永磁体之间的磁阻周期性变化。低速时听得见"咯咯咯"声，高速被惯性平滑掉。BEMF 也不是纯正弦——分布绕组 + 齿槽带来 5/7/11/13 次空间谐波，被 Park 投影后变成 dq 上的 6 倍频纹波。'}
      </p>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{isEn ? 'Periods/rev' : '每圈周期'}</p>
          <p className="formula text-body text-accent-primary">{periodPerRev}</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{isEn ? 'Peak T_cog' : '齿槽峰值'}</p>
          <p className="formula text-body text-accent-primary">{formatNumber(peak, 1)} mN·m</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(thdTone)}`}>
          <p className="text-caption opacity-80">BEMF THD</p>
          <p className="formula text-body">{formatNumber(thd, 1)} %</p>
        </div>
      </div>

      <div className="mb-3 h-40">
        <SafeResponsiveContainer>
          <LineChart data={waveform} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="deg" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="°" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" mN·m" />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 8,
                color: '#e7f3ff',
              }}
            />
            <Line type="monotone" dataKey="T_cog_mNm" stroke="#ffb84d" strokeWidth={1.6} dot={false} isAnimationActive={false} name="T_cog" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <div>
        <p className="mb-1 text-caption text-ink-muted">
          {isEn ? 'BEMF spatial harmonics (relative to fundamental)' : 'BEMF 空间谐波（相对基波）'}
        </p>
        <div className="h-32">
          <SafeResponsiveContainer>
            <BarChart data={harmonicsData} margin={{ top: 4, right: 12, bottom: 4, left: -6 }}>
              <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
              <XAxis dataKey="order" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{
                  background: '#0d1929',
                  border: '1px solid #1e2a3d',
                  borderRadius: 8,
                  color: '#e7f3ff',
                }}
              />
              <Bar dataKey="coef_pct" fill="#34d6ff" isAnimationActive={false} radius={[3, 3, 0, 0]} />
            </BarChart>
          </SafeResponsiveContainer>
        </div>
      </div>
    </Card>
  );
}
