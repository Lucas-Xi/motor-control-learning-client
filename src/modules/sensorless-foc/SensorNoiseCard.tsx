import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useI18n } from '../../i18n/useI18n';
import {
  adcMeasurement,
  defaultAdcParams,
  encoderMeasurement,
  hallSector,
  kclResidual,
} from '../../simulation/math/sensorNoise';
import { formatNumber } from '../../utils/format';

type SensorType = 'encoder' | 'hall' | 'adc';

/**
 * 传感器噪声卡：让学员看见编码器量化/偏心、Hall 分辨率/偏置、ADC 量化/INL/噪声
 * 把"理想信号"撕成"实际毛刺"的全过程。
 */
export function SensorNoiseCard() {
  const { locale } = useI18n();
  const isEn = locale === 'en-US';

  const [sensor, setSensor] = useState<SensorType>('encoder');
  const [bits, setBits] = useState(10);
  const [eccentricityDeg, setEccentricityDeg] = useState(0.7);
  const [hallOffsetDeg, setHallOffsetDeg] = useState(3.0);
  const [adcNoiseSigma, setAdcNoiseSigma] = useState(0.8);
  const [adcInl, setAdcInl] = useState(2);
  const [adcOffset, setAdcOffset] = useState(1.5);

  // 编码器扫描：360 个点
  const encoderSweep = useMemo(() => {
    const N = 180;
    return Array.from({ length: N + 1 }, (_, k) => {
      const theta = (k / N) * 2 * Math.PI;
      const r = encoderMeasurement(theta, {
        bits,
        eccentricityRad: (eccentricityDeg * Math.PI) / 180,
        eccentricityPhaseRad: 0,
        secondHarmonicRad: 0.003,
      });
      return {
        deg: Number(((theta * 180) / Math.PI).toFixed(1)),
        errDeg: Number(((r.errorRad * 180) / Math.PI).toFixed(3)),
      };
    });
  }, [bits, eccentricityDeg]);

  // Hall 扫描
  const hallSweep = useMemo(() => {
    const N = 120;
    const off = (hallOffsetDeg * Math.PI) / 180;
    return Array.from({ length: N + 1 }, (_, k) => {
      const theta = (k / N) * 2 * Math.PI;
      const r = hallSector(theta, {
        offsetsRad: [off, -off * 0.5, off * 0.3],
        hysteresisRad: 0,
      });
      return {
        deg: Number(((theta * 180) / Math.PI).toFixed(1)),
        errDeg: Number(((r.hallErrRad * 180) / Math.PI).toFixed(2)),
      };
    });
  }, [hallOffsetDeg]);

  // ADC 扫描（用固定种子让画面稳定）
  const adcSweep = useMemo(() => {
    const N = 100;
    const seed = (() => {
      let s = 0.123;
      return () => {
        s = (s * 9301 + 49297) % 233280;
        return s / 233280;
      };
    })();
    return Array.from({ length: N + 1 }, (_, k) => {
      const i = -9 + (k / N) * 18;
      const r = adcMeasurement(i, {
        ...defaultAdcParams,
        bits: 12,
        noiseSigmaLSB: adcNoiseSigma,
        inlLSB: adcInl,
        offsetLSB: adcOffset,
      }, seed);
      return {
        truA: Number(i.toFixed(2)),
        errA: Number((r.errorAbs * 1000).toFixed(3)),
      };
    });
  }, [adcNoiseSigma, adcInl, adcOffset]);

  // KCL 残差举例：三相电流叠 A 相偏置
  const kclDemo = useMemo(() => {
    return [
      { case: isEn ? 'Healthy' : '健康', residual: kclResidual(2, -1, -1) },
      { case: isEn ? 'A bias +0.5A' : 'A偏置+0.5', residual: kclResidual(2.5, -1, -1) },
      { case: isEn ? 'B gain 0.85' : 'B增益0.85', residual: kclResidual(2, -0.85, -1) },
      { case: isEn ? 'C loss' : 'C缺相', residual: kclResidual(2, -1, 0) },
    ];
  }, [isEn]);

  // 当前 sensor 类型对应的 RMS 误差
  const rmsErr = useMemo(() => {
    if (sensor === 'encoder') {
      const sq = encoderSweep.reduce((a, p) => a + p.errDeg * p.errDeg, 0);
      return { value: Math.sqrt(sq / encoderSweep.length), unit: '°' };
    } else if (sensor === 'hall') {
      const sq = hallSweep.reduce((a, p) => a + p.errDeg * p.errDeg, 0);
      return { value: Math.sqrt(sq / hallSweep.length), unit: '°' };
    } else {
      const sq = adcSweep.reduce((a, p) => a + p.errA * p.errA, 0);
      return { value: Math.sqrt(sq / adcSweep.length), unit: 'mA' };
    }
  }, [sensor, encoderSweep, hallSweep, adcSweep]);

  const tone = rmsErr.unit === '°'
    ? (rmsErr.value < 0.5 ? 'measure' : rmsErr.value < 2 ? 'warn' : 'fault')
    : (rmsErr.value < 20 ? 'measure' : rmsErr.value < 50 ? 'warn' : 'fault');
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={isEn ? 'Sensor Noise Sources (encoder · Hall · ADC)' : '传感器噪声三大源（编码器 · Hall · ADC）'}
      eyebrow={isEn ? 'why your control loop sees grass' : '为啥控制环看到的不是纯净信号'}
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={
            isEn
              ? 'Encoder quantization + eccentricity; Hall 60° sectoring + offsets; ADC 12-bit quantize + INL + Gaussian noise.'
              : '编码器量化 + 偏心；Hall 60° 6 段 + 偏置；ADC 12-bit 量化 + INL + 高斯噪声。'
          }
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? 'Real control software does not see clean sin/θ — it sees grass: quantized steps, eccentricity sine, sector flicker, ADC LSB shimmer. Switch the sensor type and drag parameters to see how each one contributes.'
          : '真实控制软件看到的不是干净的 sin/θ —— 是毛刺：量化阶梯、偏心正弦、扇区跳动、ADC LSB 抖。切传感器类型 + 拖参数看每一项贡献。'}
      </p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['encoder', 'hall', 'adc'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setSensor(t)}
            aria-pressed={sensor === t}
            className={`rounded-full border px-3 py-1 text-caption transition-colors ${
              sensor === t
                ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {t === 'encoder' ? (isEn ? 'Encoder' : '编码器') : t === 'hall' ? 'Hall' : 'ADC'}
          </button>
        ))}
      </div>

      {sensor === 'encoder' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
                <span>{isEn ? 'Encoder bits' : '编码器位数'}</span>
                <span className="formula text-ink-primary">{bits} bit ({Math.pow(2, bits)} PPR)</span>
              </span>
              <input type="range" value={bits} min={8} max={17} step={1}
                onChange={(e) => setBits(Number(e.target.value))}
                className="simulation-slider w-full"
                aria-label="encoder bits" aria-valuemin={8} aria-valuemax={17} aria-valuenow={bits} aria-valuetext={`${bits} bit`}
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
                <span>{isEn ? 'Eccentricity' : '偏心幅值'}</span>
                <span className="formula text-ink-primary">{formatNumber(eccentricityDeg, 2)}°</span>
              </span>
              <input type="range" value={eccentricityDeg} min={0} max={3} step={0.05}
                onChange={(e) => setEccentricityDeg(Number(e.target.value))}
                className="simulation-slider w-full"
                aria-label="eccentricity amplitude" aria-valuemin={0} aria-valuemax={3} aria-valuenow={eccentricityDeg}
                aria-valuetext={`${eccentricityDeg}°`}
              />
            </label>
          </div>
          <div className="h-40">
            <SafeResponsiveContainer>
              <LineChart data={encoderSweep} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
                <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
                <XAxis dataKey="deg" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="°" />
                <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="°" />
                <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
                <ReferenceLine y={0} stroke="#5d7793" strokeDasharray="2 3" />
                <Line type="monotone" dataKey="errDeg" stroke="#34d6ff" strokeWidth={1.6} dot={false} isAnimationActive={false} name={isEn ? 'error (°)' : '误差 (°)'} />
              </LineChart>
            </SafeResponsiveContainer>
          </div>
        </>
      )}

      {sensor === 'hall' && (
        <>
          <div className="mb-3">
            <label className="block">
              <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
                <span>{isEn ? 'Hall offset (°)' : 'Hall 偏置 (°)'}</span>
                <span className="formula text-ink-primary">±{formatNumber(hallOffsetDeg, 1)}°</span>
              </span>
              <input type="range" value={hallOffsetDeg} min={0} max={10} step={0.5}
                onChange={(e) => setHallOffsetDeg(Number(e.target.value))}
                className="simulation-slider w-full"
                aria-label="Hall offset" aria-valuemin={0} aria-valuemax={10} aria-valuenow={hallOffsetDeg} aria-valuetext={`${hallOffsetDeg}°`}
              />
            </label>
          </div>
          <div className="h-40">
            <SafeResponsiveContainer>
              <LineChart data={hallSweep} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
                <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
                <XAxis dataKey="deg" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="°" />
                <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit="°" domain={[-35, 35]} />
                <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
                <ReferenceLine y={0} stroke="#5d7793" strokeDasharray="2 3" />
                <Line type="monotone" dataKey="errDeg" stroke="#43f7b5" strokeWidth={1.6} dot={false} isAnimationActive={false} name={isEn ? 'Hall - true' : 'Hall - 真值'} />
              </LineChart>
            </SafeResponsiveContainer>
          </div>
        </>
      )}

      {sensor === 'adc' && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
                <span>σ (LSB)</span>
                <span className="formula text-ink-primary">{formatNumber(adcNoiseSigma, 2)}</span>
              </span>
              <input type="range" value={adcNoiseSigma} min={0} max={4} step={0.1}
                onChange={(e) => setAdcNoiseSigma(Number(e.target.value))}
                className="simulation-slider w-full"
                aria-label="ADC noise sigma" aria-valuemin={0} aria-valuemax={4} aria-valuenow={adcNoiseSigma} aria-valuetext={`${adcNoiseSigma} LSB`}
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
                <span>INL (LSB)</span>
                <span className="formula text-ink-primary">±{formatNumber(adcInl, 1)}</span>
              </span>
              <input type="range" value={adcInl} min={0} max={6} step={0.5}
                onChange={(e) => setAdcInl(Number(e.target.value))}
                className="simulation-slider w-full"
                aria-label="ADC INL" aria-valuemin={0} aria-valuemax={6} aria-valuenow={adcInl} aria-valuetext={`${adcInl} LSB`}
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
                <span>offset (LSB)</span>
                <span className="formula text-ink-primary">{formatNumber(adcOffset, 1)}</span>
              </span>
              <input type="range" value={adcOffset} min={0} max={10} step={0.5}
                onChange={(e) => setAdcOffset(Number(e.target.value))}
                className="simulation-slider w-full"
                aria-label="ADC offset" aria-valuemin={0} aria-valuemax={10} aria-valuenow={adcOffset} aria-valuetext={`${adcOffset} LSB`}
              />
            </label>
          </div>
          <div className="h-40">
            <SafeResponsiveContainer>
              <LineChart data={adcSweep} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
                <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
                <XAxis dataKey="truA" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" A" />
                <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" mA" />
                <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
                <ReferenceLine y={0} stroke="#5d7793" strokeDasharray="2 3" />
                <Line type="monotone" dataKey="errA" stroke="#ffb84d" strokeWidth={1.6} dot={false} isAnimationActive={false} name={isEn ? 'ADC error (mA)' : 'ADC 误差 (mA)'} />
              </LineChart>
            </SafeResponsiveContainer>
          </div>
        </>
      )}

      <div className={`mt-3 rounded-lg border p-2 ${toneClass(tone)}`}>
        <p className="text-caption opacity-80">{isEn ? 'RMS error over sweep' : '扫描全程 RMS 误差'}</p>
        <p className="formula text-body">{formatNumber(rmsErr.value, 2)} {rmsErr.unit}</p>
      </div>

      <div className="mt-3">
        <p className="mb-2 text-caption text-ink-muted">{isEn ? 'KCL residual (Ia+Ib+Ic) – signature of imbalance' : 'KCL 残差 (Ia+Ib+Ic) – 失衡指纹'}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {kclDemo.map((d) => (
            <div key={d.case} className="rounded border border-line-subtle bg-bg-base p-2">
              <p className="text-caption text-ink-muted">{d.case}</p>
              <p className={`formula text-body ${Math.abs(d.residual) < 0.01 ? 'text-accent-measure' : Math.abs(d.residual) < 0.6 ? 'text-accent-warn' : 'text-accent-fault'}`}>
                {formatNumber(d.residual, 2)} A
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
          {isEn
            ? 'Healthy three-phase ADC: |Ia+Ib+Ic| < 0.05 A. Anything above that screams sensor bias / gain mismatch / phase loss. This is the cheapest sanity check in your FOC ISR.'
            : '健康三相 ADC 采样满足 |Ia+Ib+Ic| < 50 mA。残差超阈值就是传感器偏置 / 增益失配 / 缺相的指纹。这是 FOC ISR 里最便宜的健康自检。'}
        </p>
      </div>
    </Card>
  );
}
