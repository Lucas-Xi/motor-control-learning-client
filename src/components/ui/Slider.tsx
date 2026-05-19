import { formatNumber } from '../../utils/format';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step = 1, unit = '', hint, onChange }: SliderProps) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-body text-ink-secondary">{label}</span>
        <span className="formula text-ink-primary">{formatNumber(value, step < 1 ? 2 : 1)}{unit}</span>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className="simulation-slider w-full"
        aria-label={`${label}${unit ? ` (${unit})` : ''}`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${formatNumber(value, step < 1 ? 2 : 1)}${unit}`}
      />
      {hint && <p className="mt-1.5 text-caption leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}
