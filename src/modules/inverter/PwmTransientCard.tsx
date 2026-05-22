import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../../components/ui/Card';
import { FidelityBadge } from '../../components/ui/FidelityBadge';
import { SafeResponsiveContainer } from '../../components/charts/SafeResponsiveContainer';
import { useSimulationStore } from '../../store/simulationStore';
import { useI18n } from '../../i18n/useI18n';
import {
  deadtimeMeanError,
  generatePwmWaveform,
  meanPhaseVoltage,
  pwmSpectrum,
} from '../../simulation/math/pwmTransient';
import { formatNumber } from '../../utils/format';

/**
 * PWM 开关瞬态卡：让学员看见示波器上才能见到的实际开关波形 + 死区扁平区 + 频谱。
 */
export function PwmTransientCard() {
  const inverter = useSimulationStore((s) => s.inverter);
  const { locale } = useI18n();
  const isEn = locale === 'en-US';

  const [iaSign, setIaSign] = useState<1 | -1>(1);
  const [fswKHz, setFswKHz] = useState((inverter.pwmFrequency ?? 16000) / 1000);
  const [deadTimeUs, setDeadTimeUs] = useState((inverter.deadTimeUs ?? 1.5));
  const [showSpikes, setShowSpikes] = useState(true);

  const duty = {
    dutyA: Math.max(0.05, Math.min(0.95, inverter.dutyA ?? 0.6)),
    dutyB: Math.max(0.05, Math.min(0.95, inverter.dutyB ?? 0.5)),
    dutyC: Math.max(0.05, Math.min(0.95, inverter.dutyC ?? 0.4)),
  };

  // 测试电流：A 相 ±5A（方向 chip 切），B/C 各 -2.5A 保证 KCL
  const iAbc = { ia: 5 * iaSign, ib: -2.5 * iaSign, ic: -2.5 * iaSign };

  const params = {
    fsw: fswKHz * 1000,
    deadTimeSec: deadTimeUs * 1e-6,
    vdc: inverter.uDc ?? 310,
    trrSec: showSpikes ? 100e-9 : 0,
    qrrCoulomb: showSpikes ? 2e-6 : 0,
    samplesPerCycle: 256,
  };

  const waveform = useMemo(
    () => generatePwmWaveform({ duty, iAbc, cycles: 2, params }),
    [duty.dutyA, duty.dutyB, duty.dutyC, iAbc.ia, iAbc.ib, iAbc.ic, params.fsw, params.deadTimeSec, params.vdc, params.trrSec, params.qrrCoulomb],
  );

  const chartData = useMemo(
    () => waveform.map((p, idx) => ({
      t_us: Number((p.t * 1e6).toFixed(2)),
      va: Number(p.va.toFixed(1)),
      gateA: p.gateA * (params.vdc / 2),
      idx,
    })),
    [waveform, params.vdc],
  );

  const dtErr = useMemo(
    () => deadtimeMeanError(waveform, duty, params.vdc),
    [waveform, duty, params.vdc],
  );

  const meanVa = meanPhaseVoltage(waveform, 'va');
  const idealVa = (duty.dutyA - 0.5) * params.vdc;

  const spectrum = useMemo(
    () => pwmSpectrum(generatePwmWaveform({ duty, iAbc, cycles: 6, params: { ...params, samplesPerCycle: 256 } }), 'va', 80),
    [duty.dutyA, duty.dutyB, duty.dutyC, iAbc.ia, iAbc.ib, iAbc.ic, params.fsw, params.deadTimeSec, params.vdc],
  );

  const spectrumData = useMemo(() => {
    // 去 DC，取前 32 个有效 bin
    return spectrum.freq.slice(1, 40).map((f, i) => ({
      f_kHz: Number((f / 1000).toFixed(2)),
      mag: Number(spectrum.mag[i + 1].toFixed(2)),
    }));
  }, [spectrum]);

  const errPct = Math.abs((meanVa - idealVa) / Math.max(1, Math.abs(idealVa))) * 100;
  const errTone = errPct < 3 ? 'measure' : errPct < 10 ? 'warn' : 'fault';
  const toneClass = (t: 'measure' | 'warn' | 'fault') =>
    t === 'measure'
      ? 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
      : t === 'warn'
      ? 'border-accent-warn/40 bg-accent-warn/10 text-accent-warn'
      : 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault';

  return (
    <Card
      title={isEn ? 'PWM Switching Transient + Spectrum' : 'PWM 开关瞬态 + 频谱'}
      eyebrow={isEn ? 'what the oscilloscope sees' : '示波器看到的真实波形'}
      density="compact"
      action={
        <FidelityBadge
          level="physical"
          hint={
            isEn
              ? 'Discrete-switch waveform with dead-time conduction-mode logic + reverse-recovery spike model; replaces inverter average model for visualization.'
              : '离散开关波形 + 死区导通方向逻辑 + 反向恢复尖刺；可视化层替代逆变器平均模型。'
          }
        />
      }
    >
      <p className="mb-3 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? 'The average model hides switching ripple, dead-time flat zones, and reverse-recovery spikes. Toggle the current sign to see how dead-time flips voltage direction; drag fsw/t_dead to see the spectrum sidebands move.'
          : '平均模型藏起了开关纹波 / 死区扁平区 / 反向恢复尖刺。切相电流方向看死区如何让电压"贴下" or "贴上"；拖 fsw / 死区看频谱边带挪位。'}
      </p>

      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>fsw (kHz)</span>
            <span className="formula text-ink-primary">{formatNumber(fswKHz, 0)}</span>
          </span>
          <input type="range" value={fswKHz} min={4} max={50} step={1}
            onChange={(e) => setFswKHz(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="PWM frequency" aria-valuemin={4} aria-valuemax={50} aria-valuenow={fswKHz} aria-valuetext={`${fswKHz} kHz`}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-baseline justify-between text-caption text-ink-muted">
            <span>{isEn ? 'Dead-time' : '死区'} (μs)</span>
            <span className="formula text-ink-primary">{formatNumber(deadTimeUs, 2)}</span>
          </span>
          <input type="range" value={deadTimeUs} min={0} max={4} step={0.1}
            onChange={(e) => setDeadTimeUs(Number(e.target.value))}
            className="simulation-slider w-full"
            aria-label="dead time" aria-valuemin={0} aria-valuemax={4} aria-valuenow={deadTimeUs} aria-valuetext={`${deadTimeUs} us`}
          />
        </label>
        <div className="flex flex-col">
          <span className="mb-1 text-caption text-ink-muted">{isEn ? 'ia sign' : 'ia 方向'}</span>
          <div role="radiogroup" className="flex gap-1">
            {([1, -1] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={iaSign === s}
                onClick={() => setIaSign(s)}
                className={`flex-1 rounded border px-2 py-1 text-caption transition-colors ${
                  iaSign === s
                    ? 'border-accent-primary/60 bg-accent-primary/10 text-accent-primary'
                    : 'border-line-subtle bg-bg-base text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {s > 0 ? 'ia > 0' : 'ia < 0'}
              </button>
            ))}
          </div>
        </div>
        <label className="flex flex-col">
          <span className="mb-1 text-caption text-ink-muted">{isEn ? 'Rev. recovery' : '反向恢复'}</span>
          <button
            type="button"
            aria-pressed={showSpikes}
            onClick={() => setShowSpikes((v) => !v)}
            className={`rounded border px-2 py-1 text-caption transition-colors ${
              showSpikes
                ? 'border-accent-warn/60 bg-accent-warn/10 text-accent-warn'
                : 'border-line-subtle bg-bg-base text-ink-muted'
            }`}
          >
            {showSpikes ? (isEn ? 'spikes ON' : '尖刺 ON') : (isEn ? 'spikes OFF' : '尖刺 OFF')}
          </button>
        </label>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{isEn ? 'Ideal Va' : '理想 Va'}</p>
          <p className="formula text-body text-accent-primary">{formatNumber(idealVa, 1)} V</p>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-base p-2">
          <p className="text-caption text-ink-muted">{isEn ? 'Actual Va' : '实际 Va'}</p>
          <p className="formula text-body text-accent-measure">{formatNumber(meanVa, 1)} V</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass(errTone)}`}>
          <p className="text-caption opacity-80">{isEn ? 'Dead-time err' : '死区误差'}</p>
          <p className="formula text-body">{formatNumber(dtErr.aErr, 1)} V ({formatNumber(errPct, 1)}%)</p>
        </div>
      </div>

      <div className="mb-3 h-44">
        <SafeResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 6, right: 12, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="t_us" tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" μs" />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" V" domain={[-params.vdc * 0.6, params.vdc * 0.6]} />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Line type="stepAfter" dataKey="va" stroke="#34d6ff" strokeWidth={1.6} dot={false} isAnimationActive={false} name="Va" />
            <Line type="stepAfter" dataKey="gateA" stroke="#43f7b5" strokeWidth={0.8} strokeDasharray="2 2" dot={false} isAnimationActive={false} name="gate A" />
          </LineChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mb-1 text-caption text-ink-muted">
        {isEn ? 'Va spectrum (first 40 bins)' : 'Va 频谱（前 40 bin）'}
      </p>
      <div className="h-32">
        <SafeResponsiveContainer>
          <BarChart data={spectrumData} margin={{ top: 4, right: 12, bottom: 4, left: -6 }}>
            <CartesianGrid stroke="rgba(231,243,255,0.06)" strokeDasharray="3 6" />
            <XAxis dataKey="f_kHz" tick={{ fill: '#9eb5cb', fontSize: 10 }} unit=" kHz" interval={3} />
            <YAxis tick={{ fill: '#9eb5cb', fontSize: 11 }} unit=" V" />
            <Tooltip contentStyle={{ background: '#0d1929', border: '1px solid #1e2a3d', borderRadius: 8, color: '#e7f3ff' }} />
            <Bar dataKey="mag" isAnimationActive={false}>
              {spectrumData.map((d, i) => (
                <Cell
                  key={i}
                  fill={Math.abs(d.f_kHz - fswKHz) < 1.5 ? '#ffb84d' : Math.abs(d.f_kHz - 2 * fswKHz) < 1.5 ? '#ff5d8a' : '#34d6ff'}
                />
              ))}
            </Bar>
          </BarChart>
        </SafeResponsiveContainer>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        {isEn
          ? `Carrier peak at fsw=${formatNumber(fswKHz, 0)} kHz (amber), 2nd harmonic at ${formatNumber(2 * fswKHz, 0)} kHz (rose). Dead-time creates low-frequency 5/7-th sidebands invisible in the average model.`
          : `载波峰在 fsw=${formatNumber(fswKHz, 0)} kHz（琥珀）、2 次谐波在 ${formatNumber(2 * fswKHz, 0)} kHz（玫瑰）。死区会在低频段产生 5/7 次边带——平均模型彻底藏起了它们。`}
      </p>
    </Card>
  );
}
