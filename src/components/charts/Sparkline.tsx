interface Props {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  /** 高亮当前点 */
  showCurrentDot?: boolean;
  /** 显示 0 基线 */
  showBaseline?: boolean;
  /** y 轴范围；不传则按 data 自动 */
  yMin?: number;
  yMax?: number;
  /** 线型：实线 / 虚线 / 点线——用于状态形状区分（a11y 色盲友好） */
  strokeDasharray?: string;
}

/**
 * 迷你趋势线：嵌入 metric 行内显示最近 N 个采样值的走势。
 * 设计极简——单 path，没有坐标轴或刻度，只为「看趋势」服务。
 */
export function Sparkline({
  data,
  width = 64,
  height = 18,
  color = '#34d6ff',
  showCurrentDot = true,
  showBaseline = false,
  yMin,
  yMax,
  strokeDasharray,
}: Props) {
  if (data.length < 2) {
    return (
      <svg width={width} height={height} role="img" aria-label="sparkline" style={{ display: 'inline-block', verticalAlign: 'middle' }}>
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke={color} strokeWidth="1" opacity="0.3" />
      </svg>
    );
  }

  const min = yMin ?? Math.min(...data);
  const max = yMax ?? Math.max(...data);
  const range = max - min || 1;
  const padY = 2;
  const usable = height - padY * 2;
  const xStep = width / (data.length - 1);

  const points = data.map((v, i) => ({
    x: i * xStep,
    y: padY + usable - ((v - min) / range) * usable,
  }));

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      role="img"
      aria-label="sparkline"
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {showBaseline && (
        <line x1="0" y1={height - padY} x2={width} y2={height - padY} stroke={color} strokeWidth="0.5" opacity="0.2" />
      )}
      <path d={pathD} stroke={color} strokeWidth="1.2" fill="none" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={strokeDasharray} />
      {showCurrentDot && <circle cx={last.x} cy={last.y} r="1.6" fill={color} />}
    </svg>
  );
}
