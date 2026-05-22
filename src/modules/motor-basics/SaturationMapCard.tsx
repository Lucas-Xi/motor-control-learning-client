import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import { saturatedInductances, sampleSaturationParams } from '../../simulation/math/saturation';
import { formatNumber } from '../../utils/format';

/**
 * 饱和电感卡片：展示 Ld/Lq 随电流变化的曲线 + 当前工作点凸极比。
 * 教学目的：让学员看见"常量 L 是骗局"——重载下 Lq 比空载下降 20-30%，
 * 凸极比从设计值 1.75 退化到 1.4-1.5，MTPA 计算因此系统性偏差。
 */
export function SaturationMapCard() {
  const motor = useSimulationStore((s) => s.motorBasics);
  const { locale } = useI18n();
  const isEn = locale === 'en-US';

  // 工作点：用户可拖滑块改 id/iq
  const [id, setId] = useState(0);
  const [iq, setIq] = useState(motor.ratedCurrent * 0.6);

  // 用 store 的 ld/lq/iRated 作为空载基准，但饱和系数用 hitachi15HP 默认
  // （store 没有饱和系数字段，作为高保真模型的"插件参数"）
  const satParams = useMemo(
    () => ({
      ld0: (motor.ldMh ?? 1.2) * 1e-3,
      lq0: (motor.lqMh ?? 2.1) * 1e-3,
      iRated: motor.ratedCurrent,
      ad: sampleSaturationParams.hitachi15HP.ad,
      bd: sampleSaturationParams.hitachi15HP.bd,
      aq: sampleSaturationParams.hitachi15HP.aq,
      bq: sampleSaturationParams.hitachi15HP.bq,
      knee: sampleSaturationParams.hitachi15HP.knee,
    }),
    [motor.ldMh, motor.lqMh, motor.ratedCurrent],
  );

  // 当前工作点
  const current = useMemo(() => saturatedInductances(id, iq, satParams), [id, iq, satParams]);
  const noLoad = useMemo(() => saturatedInductances(0, 0, satParams), [satParams]);

  // 扫描 iq 从 0..1.4×iRated（固定 id=0），生成 Ld/Lq 曲线
  const sweepData = useMemo(() => {
    const N = 30;
    const iMax = motor.ratedCurrent * 1.4;
    return Array.from({ length: N + 1 }, (_, k) => {
      const iqs = (k / N) * iMax;
      const inds = saturatedInductances(0, iqs, satParams);
      return {
        iq: Number(iqs.toFixed(2)),
        Ld_mH: inds.ld * 1e3,
        Lq_mH: inds.lq * 1e3,
        saliency: inds.saliency,
      };
    });
  }, [satParams, motor.ratedCurrent]);

  const saliencyDrop = ((noLoad.saliency - current.saliency) / noLoad.saliency) * 100;
  const dropTone = saliencyDrop < 5 ? 'measure' : saliencyDrop < 15 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={isEn ? 'Inductance Saturation (Ld/Lq cross-coupling)' : '电感饱和（Ld/Lq 交叉饱和）'}
      eyebrow={isEn ? 'high-fidelity PMSM' : '高保真 PMSM 模型'}
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={
            isEn
              ? 'Vorobiev 2010 polynomial fit + sigmoid soft saturation; replaces constant Ld/Lq.'
              : 'Vorobiev 2010 多项式拟合 + sigmoid 软饱和；替代常量 Ld/Lq。'
          }
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? 'Real IPM motors saturate at high currents: Lq drops 20-40% under heavy iq, the saliency ratio degrades, and MTPA trajectory shifts. Drag id/iq to see how Ld, Lq, and saliency change.'
          : '真实 IPM 电机重载饱和：Lq 在高 iq 下退化 20-40%，凸极比下降，MTPA 轨迹偏移。拖动 id/iq 滑块看 Ld、Lq、凸极比的实时变化。'}
      </p>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>id (A)</span>
            <span className="formula text-ink-primary">{formatNumber(id, 2)}</span>
          </span>
          <input
            type="range"
            value={id}
            min={-motor.ratedCurrent}
            max={motor.ratedCurrent * 0.3}
            step={0.1}
            onChange={(e) => setId(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="d 轴电流"
            aria-valuemin={-motor.ratedCurrent}
            aria-valuemax={motor.ratedCurrent * 0.3}
            aria-valuenow={id}
            aria-valuetext={`${formatNumber(id, 2)} A`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>iq (A)</span>
            <span className="formula text-ink-primary">{formatNumber(iq, 2)}</span>
          </span>
          <input
            type="range"
            value={iq}
            min={0}
            max={motor.ratedCurrent * 1.4}
            step={0.1}
            onChange={(e) => setIq(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="q 轴电流"
            aria-valuemin={0}
            aria-valuemax={motor.ratedCurrent * 1.4}
            aria-valuenow={iq}
            aria-valuetext={`${formatNumber(iq, 2)} A`}
          />
        </label>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">Ld</p>
          <p className="formula text-body text-accent-primary">{formatNumber(current.ld * 1e3, 3)} mH</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">Lq</p>
          <p className="formula text-body text-accent-primary">{formatNumber(current.lq * 1e3, 3)} mH</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(dropTone)}`}>
          <p className="text-caption opacity-80">
            ξ = Lq/Ld · Δ{formatNumber(saliencyDrop, 1)}%
          </p>
          <p className="formula text-body">{formatNumber(current.saliency, 3)}</p>
        </div>
      </div>

      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={sweepData} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="iq" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" A" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" mH" />
            <Tooltip
              contentStyle={{
                background: '#0d1929',
                border: '1px solid #1e2a3d',
                borderRadius: 8,
                color: '#e7f3ff',
              }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <ReferenceLine
              x={iq}
              stroke="#43f7b5"
              strokeDasharray="2 4"
              label={{ value: 'op', fill: '#43f7b5', fontSize: 10, position: 'top' }}
            />
            <Line type="monotone" dataKey="Ld_mH" stroke="#34d6ff" strokeWidth={1.8} dot={false} isAnimationActive={false} name="Ld" />
            <Line type="monotone" dataKey="Lq_mH" stroke="#43f7b5" strokeWidth={1.8} dot={false} isAnimationActive={false} name="Lq" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {isEn ? (
          <>
            <span className="text-accent-primary">No-load:</span> Lq/Ld ={' '}
            <span className="formula">{formatNumber(noLoad.saliency, 2)}</span> ·{' '}
            <span className="text-accent-measure">Operating:</span>{' '}
            <span className="formula">{formatNumber(current.saliency, 2)}</span> · Saturation margin{' '}
            <span className="formula">{formatNumber(current.margin * 100, 0)}%</span>.
            Sample preset: Hitachi 1.5HP IPM (12-slot 8-pole).
          </>
        ) : (
          <>
            <span className="text-accent-primary">空载</span> Lq/Ld ={' '}
            <span className="formula">{formatNumber(noLoad.saliency, 2)}</span>，
            <span className="text-accent-measure">当前工作点</span>{' '}
            <span className="formula">{formatNumber(current.saliency, 2)}</span>，饱和裕度{' '}
            <span className="formula">{formatNumber(current.margin * 100, 0)}%</span>。
            饱和系数用海立 1.5HP 12 槽 8 极样本。
          </>
        )}
      </p>

      {/* 凸极比退化 bar：让"重载下凸极比少了多少"一眼可见 */}
      <div className="mt-3 h-16">
        <SafeResponsiveContainer>
          <BarChart
            data={[
              { label: isEn ? 'No-load' : '空载', saliency: noLoad.saliency },
              { label: isEn ? 'Operating' : '当前', saliency: current.saliency },
            ]}
            layout="vertical"
            margin={{ top: 4, right: 18, bottom: 4, left: 30 }}
          >
            <XAxis type="number" domain={[1, Math.max(2.5, noLoad.saliency + 0.3)]} hide />
            <YAxis dataKey="label" type="category" tick={{ fill: '#9eb5cb', fontSize: 11 }} width={40} />
            <Bar dataKey="saliency" fill="#34d6ff" isAnimationActive={false} radius={[0, 4, 4, 0]}>
              <Cell fill="#34d6ff" />
              <Cell fill={dropTone === 'fault' ? '#ff5d8a' : dropTone === 'warn' ? '#ffb84d' : '#43f7b5'} />
            </Bar>
          </BarChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}
