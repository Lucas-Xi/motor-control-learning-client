import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity } from 'lucide-react';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { simulateCycle } from '../../simulation/math/vaporCycle';
import { useSimulationStore } from '../../store/simulationStore';

interface Sample {
  t: number;
  Pd: number;
  Td: number;
  cop: number;
  Iq: number;
  mDot: number;
}

const WINDOW_SEC = 30;     // 历史时窗 30 秒
const SAMPLE_HZ = 8;       // 采样率
const MAX_SAMPLES = WINDOW_SEC * SAMPLE_HZ;

/**
 * 制冷台架的"示波器"：实时记录排气压力、排气温度、COP、所需 Iq 的滚动历史。
 * 把"调工况—看曲线变化"做成 30 秒时窗内的可视化反馈，模拟真实测试台架的趋势记录。
 */
export function BenchScope() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const motor = useSimulationStore((s) => s.motorBasics);
  const time = useSimulationStore((s) => s.time);
  const running = useSimulationStore((s) => s.running);

  const result = useMemo(() => simulateCycle({
    refrigerant: refrig.refrigerant,
    Te: refrig.Te, Tc: refrig.Tc,
    superheatK: refrig.superheatK, subcoolK: refrig.subcoolK,
    displacementCc: refrig.displacementCc, clearanceRatio: refrig.clearanceRatio,
    rpm: motor.rpm > 100 ? motor.rpm : 3000,
    isentropicEff: refrig.isentropicEff, eevOpening: refrig.eevOpening,
  }), [refrig, motor.rpm]);

  // Iq 反算：τ / (1.5·Pp·ψf)
  const requiredIq = motor.flux > 1e-6
    ? result.torqueLoad / (1.5 * motor.polePairs * motor.flux)
    : 0;

  const [samples, setSamples] = useState<Sample[]>([]);
  const lastSampleTime = useRef(-1);

  useEffect(() => {
    if (!running) return;
    if (time - lastSampleTime.current < 1 / SAMPLE_HZ) return;
    lastSampleTime.current = time;
    setSamples((prev) => {
      const next = [
        ...prev,
        {
          t: time,
          Pd: result.states[1].P,
          Td: result.Tdischarge,
          cop: result.cop,
          Iq: requiredIq,
          mDot: result.massFlow * 1000,
        },
      ];
      const cutoff = time - WINDOW_SEC;
      return next.filter((s) => s.t >= cutoff).slice(-MAX_SAMPLES);
    });
  }, [time, running, result, requiredIq]);

  // 重置（reset）触发清空历史
  const refrigerant = refrig.refrigerant;
  const prevRef = useRef(refrigerant);
  useEffect(() => {
    if (prevRef.current !== refrigerant) {
      prevRef.current = refrigerant;
      setSamples([]);
      lastSampleTime.current = -1;
    }
  }, [refrigerant]);

  // X 轴范围：[time-WINDOW_SEC, time]
  const xMin = Math.max(0, time - WINDOW_SEC);
  const xMax = time + 0.1;

  return (
    <div className="h-56">
      <div className="mb-1 flex items-center justify-between text-caption">
        <span className="flex items-center gap-1.5 text-ink-muted">
          <Activity className="h-3.5 w-3.5 text-accent-primary" />
          台架记录器（{WINDOW_SEC}s 滚动窗口 · {SAMPLE_HZ}Hz 采样）
        </span>
        <span className="text-ink-muted">
          当前：P_d <span className="text-accent-warn font-mono">{result.states[1].P.toFixed(2)}</span> MPa ·
          T_d <span className="text-accent-fault font-mono ml-2">{result.Tdischarge.toFixed(1)}</span> °C ·
          COP <span className="text-accent-measure font-mono ml-2">{result.cop.toFixed(2)}</span> ·
          Iq <span className="text-accent-primary font-mono ml-2">{requiredIq.toFixed(1)}</span> A
        </span>
      </div>
      <SafeResponsiveContainer>
        <LineChart data={samples} margin={{ top: 6, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
          <XAxis
            dataKey="t"
            type="number"
            domain={[xMin, xMax]}
            tick={{ fill: '#9eb5cb', fontSize: 10 }}
            tickFormatter={(v) => `${(v - time).toFixed(0)}s`}
            allowDataOverflow
          />
          <YAxis yAxisId="P" tick={{ fill: '#9eb5cb', fontSize: 10 }} domain={[0, 5]} />
          <YAxis yAxisId="T" orientation="right" tick={{ fill: '#9eb5cb', fontSize: 10 }} domain={[0, 130]} />
          <Tooltip
            contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff', fontSize: 11 }}
            labelFormatter={(v) => `t = ${Number(v).toFixed(1)}s（相对当前 ${(Number(v) - time).toFixed(1)}s）`}
          />
          <Legend wrapperStyle={{ fontSize: 10, color: '#9eb5cb' }} />
          <Line yAxisId="P" type="monotone" dataKey="Pd" stroke="#ffb84d" strokeWidth={1.6} dot={false} isAnimationActive={false} name="P_d (MPa)" />
          <Line yAxisId="T" type="monotone" dataKey="Td" stroke="#ff5c7a" strokeWidth={1.6} dot={false} isAnimationActive={false} name="T_d (°C)" />
          <Line yAxisId="P" type="monotone" dataKey="cop" stroke="#43f7b5" strokeWidth={1.6} dot={false} isAnimationActive={false} name="COP" />
          <Line yAxisId="P" type="monotone" dataKey="Iq" stroke="#34d6ff" strokeWidth={1.4} dot={false} isAnimationActive={false} name="Iq (A)" strokeDasharray="3 3" />
        </LineChart>
      </SafeResponsiveContainer>
    </div>
  );
}
