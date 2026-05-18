import { Line, LineChart, CartesianGrid, ReferenceArea, ReferenceLine, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { AlertTriangle, RadioTower, RotateCw } from 'lucide-react';
import { useMemo } from 'react';
import { AssetHero } from '../../components/layout/AssetHero';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { simulateSMO } from '../../simulation/math/smo';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';

function useSamples() {
  const params = useSimulationStore((s) => s.sensorless);
  const motor = useSimulationStore((s) => s.motorBasics);
  return useMemo(() => {
    const samples = simulateSMO({
      speedRpm: params.speedRpm,
      polePairs: motor.polePairs,
      rs: params.rs,
      lsMh: params.lsMh,
      fluxLinkage: params.ke,
      smoGain: 80,                       // 滑模增益（教学典型）
      boundaryLayer: 0.5,                // 边界层 0.5A
      lpfCutoffHz: 120,                  // BEMF 低通截止
      pllKp: params.pllKp,
      pllKi: params.pllKi,
      noise: params.noise,
    });
    return { params, samples };
  }, [params, motor.polePairs]);
}

function Primary() {
  const { params, samples } = useSamples();
  const last = samples[samples.length - 1] ?? { errorDeg: 0, thetaTrue: 0, thetaEst: 0 };
  const errorMax = Math.max(...samples.map((s) => Math.abs(s.errorDeg)));
  const lowSpeed = params.speedRpm < 500;
  const healthy = errorMax < 5 && !lowSpeed;
  const failing = errorMax > 15 || lowSpeed;
  const tone = failing ? 'fault' : healthy ? 'measure' : 'warn';
  const toneClass = tone === 'fault' ? 'text-accent-fault' : tone === 'measure' ? 'text-accent-measure' : 'text-accent-warn';
  const toneBgClass = tone === 'fault' ? 'bg-accent-fault/10 border-accent-fault/40' : tone === 'measure' ? 'bg-accent-measure/10 border-accent-measure/40' : 'bg-accent-warn/10 border-accent-warn/40';
  const status = failing ? '失锁风险（建议切 HFI）' : healthy ? 'SMO 锁相中' : 'SMO 误差临界';
  return (
    <Card
      title="SMO 滑模观测器跟踪"
      eyebrow="sliding mode observer"
      density="compact"
      action={
        <div className="flex items-center gap-2">
          <FidelityBadge level="physical" hint="真实滑模观测器：开关函数 + 边界层 sat + 等效控制 LPF + atan2 + PLL 修正" />
          <span className={`rounded-md border px-2 py-0.5 text-caption font-medium ${toneBgClass} ${toneClass}`}>
            {status} · 峰值误差 {formatNumber(errorMax, 1)}°
          </span>
        </div>
      }
    >
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} domain={[-30, 360]} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
            <ReferenceArea y1={-30} y2={-10} fill="#ff5c7a" fillOpacity={0.06} />
            <ReferenceArea y1={10} y2={30} fill="#ff5c7a" fillOpacity={0.06} />
            <ReferenceLine y={10} stroke="#ff5c7a" strokeDasharray="3 4" strokeOpacity={0.5}
              label={{ value: '失锁阈值 ±10°', fill: '#ff8aa0', fontSize: 10, position: 'insideTopRight' }} />
            <ReferenceLine y={-10} stroke="#ff5c7a" strokeDasharray="3 4" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="thetaTrue" dot={false} stroke="#43f7b5" strokeWidth={2} name="真实 θe" isAnimationActive={false} />
            <Line type="monotone" dataKey="thetaEst" dot={false} stroke="#34d6ff" strokeWidth={2} name="SMO+PLL 估算" isAnimationActive={false} />
            <Line type="monotone" dataKey="errorDeg" dot={false} stroke="#ff5c7a" strokeWidth={1.4} name="误差 °" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        SMO 用电流估算误差作为开关面，开关函数（带边界层 sat）的等效输出经低通滤波即得到 BEMF 估算 z_α / z_β，再用 atan2(-z_α, z_β) + PLL 提取角度。
        当前转速 {formatNumber(params.speedRpm, 0)} rpm{lowSpeed ? '——< 500rpm 应切 HFI 模块（13）做低速无感' : '——BEMF 信号充足，SMO 锁相稳定'}。
      </p>
    </Card>
  );
}

function ObserverDiagnostic() {
  const { params, samples } = useSamples();
  const last = samples[samples.length - 1];
  const lowSpeedRisk = params.speedRpm < 500 || (last && Math.abs(last.errorDeg) > 8);
  return (
    <Card title="观测器诊断" eyebrow="observer readiness" density="compact">
      <div className="space-y-2 text-body text-ink-secondary">
        <div className="flex gap-2">
          <RadioTower className="mt-0.5 h-4 w-4 shrink-0 text-accent-primary" />
          <span>反电动势幅值 ≈ {formatNumber(params.ke * (params.speedRpm * 2 * Math.PI / 60) * 4, 2)} V</span>
        </div>
        <div className="flex gap-2">
          <RotateCw className="mt-0.5 h-4 w-4 shrink-0 text-accent-measure" />
          <span>SMO 边界层 0.5A · LPF 截止 120Hz · 角度误差 {last ? formatNumber(last.errorDeg, 2) : '0'}°</span>
        </div>
        {lowSpeedRisk && (
          <div className="flex gap-2 rounded-lg border border-accent-fault/30 bg-accent-fault/[0.08] p-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-fault" />
            <span className="text-accent-fault">低速 SMO 失效区——压缩机此时应切 HFI（模块 13）做低速无感。</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function SMOInternals() {
  const { samples } = useSamples();
  return (
    <Card title="SMO 内部信号" eyebrow="switch surface & equivalent control" density="compact">
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
            <Line type="monotone" dataKey="zAlphaLpf" dot={false} stroke="#34d6ff" strokeWidth={1.6} name="z_α (LPF) ≈ BEMF α" isAnimationActive={false} />
            <Line type="monotone" dataKey="switchSurfaceA" dot={false} stroke="#ffb84d" strokeWidth={1.4} name="开关面 |i_est-i_meas|" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        开关面 |i_est − i_meas| 应快速收敛到边界层内（接近 0），随后等效控制 z_α/z_β 经低通就是 BEMF 估算。SMO 增益过大 → 抖振 → 角度噪声；增益过小 → 收敛慢。
      </p>
    </Card>
  );
}

function Probe() {
  return (
    <>
      <ObserverDiagnostic />
      <SMOInternals />
    </>
  );
}

export function SensorlessFOCModule() {
  return (
    <ModuleLayout
      primary={
        <div className="space-y-3">
          <AssetHero moduleId="sensorless-foc" />
          <Primary />
        </div>
      }
      probe={<Probe />}
      concept={<ConceptNotes moduleId="sensorless-foc" />}
    />
  );
}
