import { useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Slider } from '../../components/ui/Slider';
import { DeadTimeWaveform } from '../../components/charts/DeadTimeWaveform';
import { useI18n } from '../../i18n/useI18n';
import {
  deadTimeVoltageError,
  simulateDeadTime,
  type DeadTimeSample,
} from '../../simulation/math/deadTimeDistortion';
import { formatNumber } from '../../utils/format';

const DEFAULTS = {
  deadTimeUs: 2,
  pwmFreqHz: 4000,
  uDc: 310,
  // 一组典型低速小电流时的占空比（接近 50% / 50% / 50%）
  dutyA: 0.55,
  dutyB: 0.5,
  dutyC: 0.45,
  windowMs: 0.6, // 半毫秒级，足以覆盖 2-3 个 PWM 周期 @ 4kHz
  points: 600,
};

type Sign = -1 | 0 | 1;

interface SignBtnProps {
  label: string;
  value: Sign;
  onChange: (v: Sign) => void;
}

/**
 * 三相电流方向选择小按钮组：+ / 0 / -
 */
function SignSelector({ label, value, onChange }: SignBtnProps) {
  const options: Array<{ v: Sign; text: string }> = [
    { v: 1, text: '+' },
    { v: 0, text: '0' },
    { v: -1, text: '−' },
  ];
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-caption text-ink-secondary">{label}</span>
      <div className="flex overflow-hidden rounded-md border border-line-subtle">
        {options.map((opt) => {
          const active = value === opt.v;
          return (
            <button
              key={opt.text}
              type="button"
              onClick={() => onChange(opt.v)}
              className={`px-2 py-0.5 text-caption font-mono transition ${
                active
                  ? 'bg-accent-primary/20 text-accent-primary'
                  : 'bg-bg-base text-ink-muted hover:bg-bg-surface'
              }`}
            >
              {opt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 死区扭曲对比演示卡片。
 *
 * 让学员直观看到：插入死区时间 td 之后，每个 PWM 周期的开关沿处会出现一段
 * 由相电流方向决定的「平台」电压，相电压平均值因此偏离理想 (duty - 0.5)·Udc。
 *
 * 默认参数：td=2μs / fpwm=4kHz / Udc=310V → 平均误差 ≈ 2.48 V (≈ 0.8% Udc)。
 * 学员可以加大 td 或降低 fpwm（实际硬件「更安全的死区」），观察误差线性增长。
 */
export function DeadTimeDemoCard() {
  const { t } = useI18n();
  const [deadTimeUs, setDeadTimeUs] = useState(DEFAULTS.deadTimeUs);
  const [pwmFreqHz, setPwmFreqHz] = useState(DEFAULTS.pwmFreqHz);
  const [iaSign, setIaSign] = useState<Sign>(1);
  const [ibSign, setIbSign] = useState<Sign>(-1);
  const [icSign, setIcSign] = useState<Sign>(0);

  const samples: DeadTimeSample[] = useMemo(
    () =>
      simulateDeadTime({
        pwmFreqHz,
        deadTimeUs,
        dutyA: DEFAULTS.dutyA,
        dutyB: DEFAULTS.dutyB,
        dutyC: DEFAULTS.dutyC,
        uDc: DEFAULTS.uDc,
        iaSign,
        ibSign,
        icSign,
        windowMs: DEFAULTS.windowMs,
        points: DEFAULTS.points,
      }),
    [deadTimeUs, pwmFreqHz, iaSign, ibSign, icSign],
  );

  // 取 A 相平均误差作为代表（其方向由 iaSign 决定）
  const avgErrorV = useMemo(
    () => deadTimeVoltageError(deadTimeUs, pwmFreqHz, DEFAULTS.uDc, iaSign),
    [deadTimeUs, pwmFreqHz, iaSign],
  );
  const errorPercent = (avgErrorV / DEFAULTS.uDc) * 100;

  const insight = useMemo(() => {
    const tdLabel = formatNumber(deadTimeUs, 1);
    const fLabel = pwmFreqHz >= 1000 ? `${formatNumber(pwmFreqHz / 1000, 1)}kHz` : `${pwmFreqHz}Hz`;
    return `${t('inverter.deadTimeInsightDead')} ${tdLabel}μs / PWM ${fLabel} / Udc ${DEFAULTS.uDc}V → ${t(
      'inverter.deadTimeInsightErr',
    )}${formatNumber(Math.abs(avgErrorV), 2)}V (≈${formatNumber(Math.abs(errorPercent), 2)}%)`;
  }, [deadTimeUs, pwmFreqHz, avgErrorV, errorPercent, t]);

  return (
    <Card title={t('inverter.deadTimeDemoTitle')} eyebrow="dead-time distortion" density="compact">
      {/* 参数滑块 */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Slider
          label={t('inverter.deadTimeTdLabel')}
          value={deadTimeUs}
          min={0}
          max={5}
          step={0.1}
          unit=" μs"
          onChange={setDeadTimeUs}
        />
        <Slider
          label={t('inverter.deadTimePwmFreqLabel')}
          value={pwmFreqHz}
          min={2000}
          max={16000}
          step={500}
          unit=" Hz"
          onChange={setPwmFreqHz}
        />
      </div>

      {/* 三相电流方向 */}
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-md border border-line-subtle bg-bg-base px-2 py-1.5">
        <SignSelector label={t('inverter.deadTimeIaDir')} value={iaSign} onChange={setIaSign} />
        <SignSelector label={t('inverter.deadTimeIbDir')} value={ibSign} onChange={setIbSign} />
        <SignSelector label={t('inverter.deadTimeIcDir')} value={icSign} onChange={setIcSign} />
      </div>

      {/* 波形对比 */}
      <DeadTimeWaveform samples={samples} avgErrorV={avgErrorV} errorPercent={errorPercent} />

      {/* 一句话洞察 */}
      <p className="mt-2 text-caption leading-relaxed text-ink-muted">{insight}</p>
      <p className="mt-1.5 text-caption leading-relaxed text-ink-muted">
        {t('inverter.deadTimeDemoExplain')}
      </p>
    </Card>
  );
}
