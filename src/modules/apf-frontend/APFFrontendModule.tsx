import { Line, LineChart, CartesianGrid, ReferenceLine, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { useMemo } from 'react';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { simulateAPF } from '../../simulation/math/apf';
import { useSimulationStore } from '../../store/simulationStore';
import { formatNumber } from '../../utils/format';

function useApf() {
  const params = useSimulationStore((s) => s.apf);
  return useMemo(() => ({ params, ...simulateAPF(params) }), [params]);
}

function Primary() {
  const { params, samples, metrics } = useApf();
  const pfTone = metrics.powerFactor > 0.95 ? 'measure' : metrics.powerFactor > 0.8 ? 'warn' : 'fault';
  const thdTone = metrics.thd < 10 ? 'measure' : metrics.thd < 25 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure' ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
    : t === 'warn' ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
    : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';
  return (
    <Card
      title="电网电压 vs 输入线电流"
      eyebrow="ac side"
      density="compact"
      action={
        <div className="flex gap-2">
          <FidelityBadge level="simplified" hint="Boost PFC 平均模型：占空比直接影响电感电流和母线电压；不仿真 PWM 开关动作" />
          <span className={`rounded-md border px-2 py-0.5 text-caption font-medium ${toneClass(pfTone)}`}>
            PF {formatNumber(metrics.powerFactor, 3)}
          </span>
          <span className={`rounded-md border px-2 py-0.5 text-caption font-medium ${toneClass(thdTone)}`}>
            THD {formatNumber(metrics.thd, 1)}%
          </span>
        </div>
      }
    >
      <div className="h-72">
        <SafeResponsiveContainer>
          <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -10 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
            <YAxis yAxisId="v" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <YAxis yAxisId="i" orientation="right" tick={{ fill: '#9eb5cb', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
            <ReferenceLine yAxisId="v" y={0} stroke="#1e2a3d" />
            <Line yAxisId="v" type="monotone" dataKey="vAcInst" dot={false} stroke="#34d6ff" strokeWidth={2} name="电网电压 V" isAnimationActive={false} />
            <Line yAxisId="i" type="monotone" dataKey="iLine" dot={false} stroke="#43f7b5" strokeWidth={2} name="输入电流 A" isAnimationActive={false} />
          </LineChart>
        </SafeResponsiveContainer>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {params.vAcRms}V 电网经整流桥 + Boost 升压到母线 {formatNumber(params.udcRef, 0)}V。PFC 让输入电流跟随电网电压同相位
        — PF 接近 1 = 电流和电压几乎重合；THD 越低输入谐波越小。
      </p>
    </Card>
  );
}

function ProbeStuff() {
  const { params, samples, metrics } = useApf();
  return (
    <>
      <Card title="电感电流跟踪" eyebrow="inner current loop" density="compact">
        <div className="h-44">
          <SafeResponsiveContainer>
            <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
              <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
              <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#9eb5cb' }} />
              <Line type="monotone" dataKey="iLref" dot={false} stroke="#9eb5cb" strokeDasharray="4 4" name="参考 |sin|" isAnimationActive={false} />
              <Line type="monotone" dataKey="iL" dot={false} stroke="#ffb84d" strokeWidth={1.6} name="实际 iL" isAnimationActive={false} />
            </LineChart>
          </SafeResponsiveContainer>
        </div>
        <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
          电流环目标是让电感电流跟着 |sin| 波形 — 这一步实现了"输入电流近似正弦" → 高功率因数 + 低谐波。
        </p>
      </Card>
      <Card title="母线电压稳定" eyebrow="dc bus regulation" density="compact">
        <div className="h-44">
          <SafeResponsiveContainer>
            <LineChart data={samples} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
              <XAxis dataKey="t" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="ms" />
              <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} domain={[params.udcRef - 50, params.udcRef + 50]} />
              <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
              <ReferenceLine y={params.udcRef} stroke="#9eb5cb" strokeDasharray="4 4" label={{ value: '目标', fill: '#9eb5cb', fontSize: 10, position: 'insideTopRight' }} />
              <Line type="monotone" dataKey="udc" dot={false} stroke="#43f7b5" strokeWidth={1.8} name="Udc V" isAnimationActive={false} />
            </LineChart>
          </SafeResponsiveContainer>
        </div>
      </Card>
      <Card title="关键指标" eyebrow="metrics" density="compact">
        <div className="grid grid-cols-2 gap-2 text-caption">
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">功率因数 </span>
            <span className="text-ink-primary">{formatNumber(metrics.powerFactor, 3)}</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">输入电流 THD </span>
            <span className="text-ink-primary">{formatNumber(metrics.thd, 1)}%</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">母线均值 </span>
            <span className="text-ink-primary">{formatNumber(metrics.udcAvg, 1)} V</span>
          </div>
          <div className="rounded border border-line-subtle bg-bg-base p-2">
            <span className="text-ink-muted">母线纹波 </span>
            <span className="text-ink-primary">{formatNumber(metrics.udcRipplePct, 2)}%</span>
          </div>
        </div>
      </Card>
      <Card title="为什么压缩机要 PFC" eyebrow="why pfc" density="compact">
        <ul className="space-y-1.5 text-body text-ink-secondary">
          <li>· <span className="text-ink-primary">国标限值</span>：家电谐波要符合 GB/T 17625.1，无 PFC 整流的 THD &gt; 100%，过不了认证</li>
          <li>· <span className="text-ink-primary">效率</span>：PF=1 时同等输出功率电网取电最少，节省线路损耗</li>
          <li>· <span className="text-ink-primary">高母线 380V</span>：升压后给后级 FOC 留出弱磁电压余量</li>
          <li>· <span className="text-ink-primary">恒定母线</span>：负载波动时母线稳，FOC 不受电网扰动</li>
        </ul>
      </Card>
    </>
  );
}

export function APFFrontendModule() {
  return <ModuleLayout primary={<Primary />} probe={<ProbeStuff />} concept={<ConceptNotes moduleId="apf-frontend" />} />;
}
