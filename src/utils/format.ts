export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '--';
  return value.toFixed(digits);
}

export function formatDeg(rad: number): string {
  return `${formatNumber((rad * 180) / Math.PI, 1)}°`;
}

export function formatPercent(value: number): string {
  return `${formatNumber(value * 100, 1)}%`;
}
