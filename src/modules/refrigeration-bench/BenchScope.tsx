import { useEffect, useMemo, useRef, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity } from 'lucide-react';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { simulateCycle } from '../../simulation/math/vaporCycle';
import { useSimulationStore } from '../../store/simulationStore';
import { useBenchHxStore } from '../../store/benchHxStore';
import { adcMeasurement, type AdcParams } from '../../simulation/math/sensorNoise';

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

// 每通道独立 12-bit ADC：按物理量实际工况量程选 fullScale，INL/σ/offset 按 STM32 G4 典型值。
// HD 实测开启后学员会看见 ~LSB 量级毛刺 + 慢 offset 贴在原本平滑的循环曲线上。
const ADC_BY_CHANNEL: Record<'Pd' | 'Td' | 'cop' | 'Iq', AdcParams> = {
  Pd: { bits: 12, fullScale: 5, inlLSB: 2, noiseSigmaLSB: 0.8, offsetLSB: 1.5 },
  Td: { bits: 12, fullScale: 150, inlLSB: 2, noiseSigmaLSB: 0.8, offsetLSB: 1.5 },
  cop: { bits: 12, fullScale: 10, inlLSB: 2, noiseSigmaLSB: 0.8, offsetLSB: 1.5 },
  Iq: { bits: 12, fullScale: 30, inlLSB: 2, noiseSigmaLSB: 0.8, offsetLSB: 1.5 },
};

/**
 * 制冷台架的"示波器"：实时记录排气压力、排气温度、COP、所需 Iq 的滚动历史。
 * 把"调工况—看曲线变化"做成 30 秒时窗内的可视化反馈，模拟真实测试台架的趋势记录。
 *
 * HD 实测（useBenchHxStore.sensorNoise）：4 个通道叠 12-bit ADC 量化 + INL + 高斯噪声 +
 * 零点偏置，让学员看见理想模型与硬件采样链读数的差距，呼应 sensorNoise.ts 教学内容。
 */
export function BenchScope() {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const motor = useSimulationStore((s) => s.motorBasics);
  const time = useSimulationStore((s) => s.time);
  const running = useSimulationStore((s) => s.running);
  const sensorNoise = useBenchHxStore((s) => s.sensorNoise);
  const setSensorNoise = useBenchHxStore((s) => s.setSensorNoise);

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
  // 确定性 LCG：让 HD 实测的毛刺序列在重渲染之间稳定，避免学员每次切 tab 都看到不同抖动
  const rngStateRef = useRef(0.5731);

  useEffect(() => {
    if (!running) return;
    if (time - lastSampleTime.current < 1 / SAMPLE_HZ) return;
    lastSampleTime.current = time;
    const seedFn = (): number => {
      rngStateRef.current = (rngStateRef.current * 9301 + 49297) % 233280;
      return rngStateRef.current / 233280;
    };
    setSamples((prev) => {
      const pdTrue = result.states[1].P;
      const tdTrue = result.Tdischarge;
      const copTrue = result.cop;
      const iqTrue = requiredIq;
      const next = [
        ...prev,
        {
          t: time,
          Pd: sensorNoise ? adcMeasurement(pdTrue, ADC_BY_CHANNEL.Pd, seedFn).measured : pdTrue,
          Td: sensorNoise ? adcMeasurement(tdTrue, ADC_BY_CHANNEL.Td, seedFn).measured : tdTrue,
          cop: sensorNoise ? adcMeasurement(copTrue, ADC_BY_CHANNEL.cop, seedFn).measured : copTrue,
          Iq: sensorNoise ? adcMeasurement(iqTrue, ADC_BY_CHANNEL.Iq, seedFn).measured : iqTrue,
          mDot: result.massFlow * 1000,
        },
      ];
      const cutoff = time - WINDOW_SEC;
      return next.filter((s) => s.t >= cutoff).slice(-MAX_SAMPLES);
    });
  }, [time, running, result, requiredIq, sensorNoise]);

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
          <button
            type="button"
            onClick={() => setSensorNoise(!sensorNoise)}
            className={`ml-2 rounded border px-1.5 py-[1px] text-[10px] transition-colors ${
              sensorNoise
                ? 'border-accent-warn/60 bg-accent-warn/15 text-accent-warn'
                : 'border-line bg-bg-elev text-ink-muted hover:text-ink'
            }`}
            title="开启后四通道叠 12-bit ADC 量化 + INL + 高斯噪声 + 零点偏置，模拟真实采样链毛刺"
          >
            HD 实测{sensorNoise ? ' · 开' : ''}
          </button>
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
