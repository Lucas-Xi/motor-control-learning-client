import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import { createPmsmState, defaultPmsmParameters, stepPmsmModel } from '../../simulation/math/motorModel';
import { stepPmsmModelHd, type MotorModelHdConfig } from '../../simulation/math/motorModelHd';
import { formatNumber } from '../../utils/format';

type EffectKey = 'saturation' | 'ironLoss' | 'cogging' | 'bemfHarmonics' | 'friction' | 'thermalComp';

/**
 * 简版 PMSM (motorModel.ts) vs 高保真 (motorModelHd.ts) A/B 对比卡片。
 * 学员点 chip 切物理效应开关，看 Iq 阶跃响应 + 转矩波形差异；
 * 三个数字读数（峰值偏差 / 稳态偏差 / 转矩 RMS 差）量化"简化付的代价"。
 */
export function ModelComparisonCard() {
  const motor = useSimulationStore((s) => s.motorBasics);
  const { locale } = useI18n();
  const isEn = locale === 'en-US';

  const [iqStep, setIqStep] = useState(4);
  const [windingTempC, setWindingTempC] = useState(25);
  const [effects, setEffects] = useState<Record<EffectKey, boolean>>({
    saturation: true,
    ironLoss: true,
    cogging: true,
    bemfHarmonics: true,
    friction: true,
    thermalComp: true,
  });

  // 跑两套并联仿真：同样的 vq 阶跃，看简版 vs 高保真
  const sim = useMemo(() => {
    const base = {
      ...defaultPmsmParameters,
      rs: motor.rs ?? defaultPmsmParameters.rs,
      ld: (motor.ldMh ?? 1.2) * 1e-3,
      lq: (motor.lqMh ?? 2.1) * 1e-3,
      flux: motor.flux ?? defaultPmsmParameters.flux,
      polePairs: motor.polePairs ?? 4,
    };
    const config: MotorModelHdConfig = { base, enable: effects };

    const dt = 1e-4;
    const totalSec = 0.06;
    const N = Math.round(totalSec / dt);
    const vqTarget = (base.rs * iqStep + 0.5);  // 粗略匹配让两套都能拉到目标 iq

    let simple = createPmsmState();
    let hd = createPmsmState();

    const points: Array<{ t_ms: number; iqSimple: number; iqHd: number; teSimple: number; teHd: number }> = [];
    for (let k = 0; k < N; k += 1) {
      const t = k * dt;
      simple = stepPmsmModel({ vd: 0, vq: vqTarget, loadTorque: 0.05, dt, params: base, state: simple });
      const hdRes = stepPmsmModelHd({
        vd: 0,
        vq: vqTarget,
        loadTorque: 0.05,
        dt,
        windingTempC,
        config,
        state: hd,
      });
      hd = hdRes.state;
      if (k % 3 === 0) {
        points.push({
          t_ms: Number((t * 1000).toFixed(2)),
          iqSimple: Number(simple.iq.toFixed(4)),
          iqHd: Number(hd.iq.toFixed(4)),
          teSimple: Number(simple.torque.toFixed(4)),
          teHd: Number(hd.torque.toFixed(4)),
        });
      }
    }

    // 统计偏差
    let teDevSq = 0;
    let iqPeakDev = 0;
    let iqEndDev = 0;
    for (const p of points) {
      const dTe = p.teHd - p.teSimple;
      teDevSq += dTe * dTe;
      const dIq = Math.abs(p.iqHd - p.iqSimple);
      if (dIq > iqPeakDev) iqPeakDev = dIq;
    }
    const tail = points.slice(-Math.floor(points.length * 0.3));
    if (tail.length > 0) {
      const avgSimple = tail.reduce((a, p) => a + p.iqSimple, 0) / tail.length;
      const avgHd = tail.reduce((a, p) => a + p.iqHd, 0) / tail.length;
      iqEndDev = Math.abs(avgHd - avgSimple);
    }
    const teRmsDev = Math.sqrt(teDevSq / Math.max(1, points.length));

    return { points, teRmsDev, iqPeakDev, iqEndDev };
  }, [motor, iqStep, windingTempC, effects]);

  const toggle = (k: EffectKey) => setEffects((prev) => ({ ...prev, [k]: !prev[k] }));

  const EFFECT_LABELS: Array<{ key: EffectKey; zh: string; en: string }> = [
    { key: 'saturation', zh: '饱和', en: 'Saturation' },
    { key: 'ironLoss', zh: '铁损', en: 'Iron loss' },
    { key: 'cogging', zh: '齿槽', en: 'Cogging' },
    { key: 'bemfHarmonics', zh: 'BEMF 谐波', en: 'BEMF harm' },
    { key: 'friction', zh: 'Stribeck', en: 'Stribeck' },
    { key: 'thermalComp', zh: '温度补偿', en: 'Thermal' },
  ];

  // 偏差着色
  const devPct = Math.abs(sim.iqEndDev / Math.max(0.1, iqStep)) * 100;
  const devTone = devPct < 3 ? 'measure' : devPct < 10 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={isEn ? 'Simple vs High-Fidelity Model A/B' : '简版 vs 高保真模型 A/B 对比'}
      eyebrow={isEn ? 'see what simplification costs' : '看见简化代价'}
      density="compact"
      action={
        <FidelityBadge
          level="exact"
          hint={
            isEn
              ? 'Same vq step input fed to both models; toggle physical effects to isolate each contribution.'
              : '同样 vq 阶跃同时喂给两个模型；点 chip 切物理效应，隔离每一项影响。'
          }
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? 'Drag iq step + winding temp + toggle effects to see how the simple textbook model deviates from the high-fidelity one. The deviation grows as you load up or heat up — and that\'s exactly the error your simulator was hiding.'
          : '拖 iq 阶跃 + 绕组温度 + 切物理效应，看课本简版与高保真之间的偏差。负载或温度升高时偏差放大 —— 这就是之前仿真器藏起来的误差。'}
      </p>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{isEn ? 'iq step (A)' : 'iq 阶跃 (A)'}</span>
            <span className="formula text-ink-primary">{formatNumber(iqStep, 1)}</span>
          </span>
          <input type="range" value={iqStep} min={1} max={motor.ratedCurrent}
            step={0.5} onChange={(e) => setIqStep(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label={isEn ? 'iq step amplitude' : 'iq 阶跃幅值'}
            aria-valuemin={1} aria-valuemax={motor.ratedCurrent} aria-valuenow={iqStep}
            aria-valuetext={`${formatNumber(iqStep, 1)} A`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{isEn ? 'Winding T (°C)' : '绕组温度 (°C)'}</span>
            <span className="formula text-ink-primary">{formatNumber(windingTempC, 0)}</span>
          </span>
          <input type="range" value={windingTempC} min={-20} max={130}
            step={5} onChange={(e) => setWindingTempC(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label={isEn ? 'winding temperature' : '绕组温度'}
            aria-valuemin={-20} aria-valuemax={130} aria-valuenow={windingTempC}
            aria-valuetext={`${formatNumber(windingTempC, 0)} °C`}
          />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {EFFECT_LABELS.map((e) => (
          <button
            key={e.key}
            type="button"
            onClick={() => toggle(e.key)}
            aria-pressed={effects[e.key]}
            className={`rounded-full border px-3 py-1 text-caption transition-colors ${
              effects[e.key]
                ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {isEn ? e.en : e.zh}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{isEn ? 'iq peak Δ' : 'iq 峰值偏差'}</p>
          <p className="formula text-body text-accent-primary">{formatNumber(sim.iqPeakDev, 3)} A</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(devTone)}`}>
          <p className="text-caption opacity-80">{isEn ? 'iq steady Δ%' : 'iq 稳态偏差%'}</p>
          <p className="formula text-body">{formatNumber(devPct, 1)} %</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{isEn ? 'Te RMS Δ' : 'Te RMS 差'}</p>
          <p className="formula text-body text-accent-measure">{formatNumber(sim.teRmsDev * 1000, 1)} mN·m</p>
        </div>
      </div>

      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={sim.points} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_ms" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" A" />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="iqSimple" stroke="#34d6ff" strokeWidth={1.6} dot={false} isAnimationActive={false} name={isEn ? 'iq simple' : 'iq 简版'} />
            <Line type="monotone" dataKey="iqHd" stroke="#43f7b5" strokeWidth={1.8} dot={false} isAnimationActive={false} name={isEn ? 'iq HD' : 'iq 高保真'} strokeDasharray="4 3" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {isEn ? (
          <>
            Heat the winding to 120°C and the simple model's "iq tracks command in 8 ms" turns into the HD model's
            "iq overshoots by 5% + steady-state drifts 3%" — because Rs grew +37%, ψf shrank 12%, and the saliency
            you assumed for MTPA decayed. That's the real motor.
          </>
        ) : (
          <>
            把绕组烧到 120°C，简版模型"iq 8 ms 追上命令"在高保真里变成"过冲 5% + 稳态漂 3%"——因为 Rs 涨了 37%、
            ψf 缩了 12%、你算 MTPA 用的凸极比退化。这才是真实电机。
          </>
        )}
      </p>
    </Card>
  );
}
