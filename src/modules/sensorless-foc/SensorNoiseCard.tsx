import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts';
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
  const { t } = useI18n();

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
      { case: t('sensorlessFoc.sensorNoiseKclHealthy'), residual: kclResidual(2, -1, -1) },
      { case: t('sensorlessFoc.sensorNoiseKclABias'), residual: kclResidual(2.5, -1, -1) },
      { case: t('sensorlessFoc.sensorNoiseKclBGain'), residual: kclResidual(2, -0.85, -1) },
      { case: t('sensorlessFoc.sensorNoiseKclCLoss'), residual: kclResidual(2, -1, 0) },
    ];
  }, [t]);

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
      title={t('sensorlessFoc.sensorNoiseTitle')}
      eyebrow={t('sensorlessFoc.sensorNoiseEyebrow')}
      density="compact"
      action={<FidelityBadge level="physical" hint={t('sensorlessFoc.sensorNoiseFidelityHint')} />}
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">{t('sensorlessFoc.sensorNoiseIntro')}</p>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(['encoder', 'hall', 'adc'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSensor(s)}
            aria-pressed={sensor === s}
            className={`rounded-full border px-3 py-1 text-caption transition-colors ${
              sensor === s
                ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
                : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink-secondary'
            }`}
          >
            {s === 'encoder' ? t('sensorlessFoc.sensorNoiseTabEncoder') : s === 'hall' ? 'Hall' : 'ADC'}
          </button>
        ))}
      </div>

      {sensor === 'encoder' && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
                <span>{t('sensorlessFoc.sensorNoiseEncoderBits')}</span>
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
                <span>{t('sensorlessFoc.sensorNoiseEccentricity')}</span>
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
                <Line type="monotone" dataKey="errDeg" stroke="#34d6ff" strokeWidth={1.6} dot={false} isAnimationActive={false} name={t('sensorlessFoc.sensorNoiseEncoderSeries')} />
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
                <span>{t('sensorlessFoc.sensorNoiseHallOffset')}</span>
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
                <Line type="monotone" dataKey="errDeg" stroke="#43f7b5" strokeWidth={1.6} dot={false} isAnimationActive={false} name={t('sensorlessFoc.sensorNoiseHallSeries')} />
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
                <Line type="monotone" dataKey="errA" stroke="#ffb84d" strokeWidth={1.6} dot={false} isAnimationActive={false} name={t('sensorlessFoc.sensorNoiseAdcSeries')} />
              </LineChart>
            </SafeResponsiveContainer>
          </div>
        </>
      )}

      <div className={`mt-3 rounded-lg border p-2 ${toneClass(tone)}`}>
        <p className="text-caption opacity-80">{t('sensorlessFoc.sensorNoiseKpiRms')}</p>
        <p className="formula text-body">{formatNumber(rmsErr.value, 2)} {rmsErr.unit}</p>
      </div>

      <div className="mt-3">
        <p className="mb-2 text-caption text-ink-muted">{t('sensorlessFoc.sensorNoiseKclTitle')}</p>
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
        <p className="mt-2 text-caption leading-relaxed text-ink-secondary">{t('sensorlessFoc.sensorNoiseKclNote')}</p>
      </div>
    </Card>
  );
}
