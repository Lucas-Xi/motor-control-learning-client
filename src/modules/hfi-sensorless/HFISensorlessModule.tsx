import { Line, LineChart, CartesianGrid, ReferenceLine, ReferenceArea, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useMemo } from 'react';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { simulateHFI, evaluateHFI } from '../../simulation/math/hfi';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';
import { SerialCompareHFICard } from './SerialCompareHFICard';
import { HfiSignalChainCard } from './HfiSignalChainCard';
import { ObserverBlendCard } from './ObserverBlendCard';

function useHfiSamples() {
  const params = useSimulationStore((s) => s.hfi);
  return useMemo(() => ({
    params,
    samples: simulateHFI(params),
    metrics: evaluateHFI(simulateHFI(params), params.saliencyRatio),
  }), [params]);
}

function Primary() {
  const { params, samples, metrics } = useHfiSamples();
  const tone = metrics.lockTimeMs && metrics.lockTimeMs < 30 ? 'measure' : metrics.lockTimeMs ? 'warn' : 'fault';
  const status = metrics.lockTimeMs ? `已锁相 · ${formatNumber(metrics.lockTimeMs, 1)}ms` : '未锁相';
  const toneClass = tone === 'measure' ? 'text-accent-measure border-accent-measure/40 bg-accent-measure/10'
    : tone === 'warn' ? 'text-accent-warn border-accent-warn/40 bg-accent-warn/10'
    : 'text-accent-fault border-accent-fault/40 bg-accent-fault/10';
  return (
    <Card
      title="HFI 解调与角度跟踪"
      eyebrow="high-frequency injection"
      density="compact"
      action={
        <div className="flex gap-2">
          <FidelityBadge level="physical" hint="高频注入 + 凸极响应解调 + PLL 锁相，simplifed 信号模型但流程真实" />
          <span className={`rounded-md border px-2 py-0.5 text-caption font-medium ${toneClass}`}>{status}</span>
        </div>
      }
    >
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} domain={[0, 360]} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
            <ReferenceLine y={0} stroke="#1e2a3d" />
            <Line type="monotone" dataKey="trueDeg" dot={false} stroke="#43f7b5" strokeWidth={2} name="真实 θe" isAnimationActive={false} />
            <Line type="monotone" dataKey="estDeg" dot={false} stroke="#34d6ff" strokeWidth={2} name="HFI 估算" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        在 d 轴注入 {formatNumber(params.injectVoltage, 0)}V / {formatNumber(params.injectFreqHz, 0)}Hz 高频电压；IPM 凸极比 Lq/Ld = {formatNumber(params.saliencyRatio, 2)}（信号增益约 {formatNumber(metrics.saliencyGainPct, 1)}%）。蓝色估算角追绿色真实角，PLL 锁定后两条线重合。
      </p>
    </Card>
  );
}

function ErrorChart() {
  const { samples } = useHfiSamples();
  return (
    <Card title="角度估算误差" eyebrow="estimation error" density="compact">
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} domain={[-180, 180]} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <ReferenceArea y1={-5} y2={5} fill="#43f7b5" fillOpacity={0.08} />
            <ReferenceLine y={5} stroke="#43f7b5" strokeDasharray="3 4" label={{ value: '锁定 ±5°', fill: '#43f7b5', fontSize: 10, position: 'insideTopRight' }} />
            <ReferenceLine y={-5} stroke="#43f7b5" strokeDasharray="3 4" />
            <Line type="monotone" dataKey="errorDeg" dot={false} stroke="#ff5c7a" strokeWidth={1.5} name="误差 °" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}

function InjectionChart() {
  const { samples } = useHfiSamples();
  return (
    <Card title="高频注入信号 + 解调" eyebrow="injection & demodulation" density="compact">
      <div className="h-44">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Line type="monotone" dataKey="injectV" dot={false} stroke="#34d6ff" strokeWidth={1.2} name="V_inject" isAnimationActive={false} />
            <Line type="monotone" dataKey="responseI" dot={false} stroke="#ffb84d" strokeWidth={1.5} name="解调误差信号" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
    </Card>
  );
}

function Probe() {
  const { params, metrics } = useHfiSamples();
  return (
    <>
      <ErrorChart />
      <InjectionChart />
      <HfiSignalChainCard />
      <Card title="HFI 关键指标" eyebrow="key metrics" density="compact">
        <div className="grid grid-cols-2 gap-2 text-caption">
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">锁相时间 </span>
            <span className="text-ink-primary">{metrics.lockTimeMs === null ? '未锁定' : `${formatNumber(metrics.lockTimeMs, 1)}ms`}</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">最终误差 </span>
            <span className="text-ink-primary">{formatNumber(metrics.finalErrorDeg, 2)}°</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">凸极信号增益 </span>
            <span className="text-ink-primary">{formatNumber(metrics.saliencyGainPct, 1)}%</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">注入频率 </span>
            <span className="text-ink-primary">{formatNumber(params.injectFreqHz, 0)} Hz</span>
          </div>
        </div>
      </Card>
      <Card title="HFI 适用范围" eyebrow="when to use" density="compact">
        <ul className="space-y-1.5 text-body text-ink-secondary">
          <li>· <span className="text-ink-primary">零速 / 极低速</span>（&lt; 100 rpm）：BEMF 太小，HFI 是唯一选择</li>
          <li>· <span className="text-ink-primary">压缩机零启动</span>：从静止直接闭环启动，避免 V/f 拖动的不可控阶段</li>
          <li>· <span className="text-ink-primary">必须 IPM 凸极</span>（Lq/Ld &gt; 1.5）；表贴式 PMSM 用不了 HFI</li>
          <li>· <span className="text-ink-primary">注入信号会带来可听噪声</span>，频率选 &gt; 1kHz 避开人耳敏感段</li>
          <li>· <span className="text-ink-primary">高速时切到 BEMF</span>：HFI 的高频注入会增加铁损和噪声</li>
        </ul>
      </Card>
      <ObserverBlendCard />
      <SerialCompareHFICard />
    </>
  );
}

export function HFISensorlessModule() {
  return <ModuleLayout primary={<Primary />} probe={<Probe />} concept={<ConceptNotes moduleId="hfi-sensorless" />} />;
}
