import { useEffect, useRef } from 'react';
import { formatNumber } from '../../utils/format';

interface Props {
  ia: number;
  ib: number;
  ic: number;
  amplitude: number;   // 用于做归一化的参考
  alpha: number;       // 合成磁场 α 分量（Ia + ...）
  beta: number;        // 合成磁场 β 分量
  size?: number;       // 默认 360
}

/**
 * 三相定子截面图：
 *   - 外圆 = 定子；3 组绕组贴在 A(顶)/B(右下)/C(左下) 120° 等分位置
 *   - 每组绕组用一段圆弧 + 截面圆点表示，⊕ = 电流流出纸面，⊗ = 电流流入纸面
 *   - 圆点大小、颜色亮度随 |I| 变化；电流方向（正/负）决定 ⊕ 还是 ⊗
 *   - 中心一个粗箭头从原点指向 (α, β)，是合成旋转磁场矢量
 *   - 之前若干采样的箭头位置以淡淡轨迹拖影呈现，让"旋转"直观可见
 */
export function StatorField2D({ ia, ib, ic, amplitude, alpha, beta, size = 360 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const statorR = size * 0.42;
  const coilR = statorR + size * 0.04;
  const fieldScale = (statorR * 0.86) / Math.max(amplitude * 1.5, 1);

  // 记录最近 N 帧的合成磁场方向，做拖影
  const trail = useRef<Array<{ x: number; y: number }>>([]);
  useEffect(() => {
    const fx = cx + alpha * fieldScale;
    const fy = cy - beta * fieldScale;
    trail.current.push({ x: fx, y: fy });
    if (trail.current.length > 28) trail.current.shift();
  }, [alpha, beta, cx, cy, fieldScale]);

  // 三相绕组定位：A 顶部 (90°)，B 右下 (-30° = 330°)，C 左下 (210°)
  const phases = [
    { name: 'A', angleDeg: 90, current: ia, color: '#34d6ff' },
    { name: 'B', angleDeg: -30, current: ib, color: '#43f7b5' },
    { name: 'C', angleDeg: 210, current: ic, color: '#ffb84d' },
  ];

  const fieldX = cx + alpha * fieldScale;
  const fieldY = cy - beta * fieldScale;

  return (
    <div className="rounded-2xl border border-line-subtle bg-bg-base p-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-[360px] max-w-full">
        <defs>
          <radialGradient id="statorBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(52,214,255,0.07)" />
            <stop offset="70%" stopColor="rgba(52,214,255,0)" />
          </radialGradient>
          <marker id="fieldArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#43f7b5" />
          </marker>
        </defs>

        <rect width={size} height={size} rx="20" fill="url(#statorBg)" />

        {/* 定子外圆 */}
        <circle cx={cx} cy={cy} r={statorR} fill="none" stroke="#1e2a3d" strokeWidth="2" />
        <circle cx={cx} cy={cy} r={statorR + 6} fill="none" stroke="#1e2a3d" strokeWidth="1" strokeDasharray="3 4" />

        {/* 拖影（合成磁场轨迹） */}
        {trail.current.map((p, i) => {
          const opacity = ((i + 1) / trail.current.length) * 0.5;
          return (
            <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#43f7b5" opacity={opacity} />
          );
        })}

        {/* 3 组绕组：弧段 + 截面圆 */}
        {phases.map((phase) => {
          const rad = (phase.angleDeg * Math.PI) / 180;
          const x = cx + coilR * Math.cos(rad);
          const y = cy - coilR * Math.sin(rad);
          const normalized = Math.min(1.4, Math.abs(phase.current) / Math.max(amplitude, 0.1));
          const dotR = 14 + normalized * 6;
          const flowOut = phase.current >= 0;  // 正电流约定为流出纸面 ⊙
          // 绕组弧段：在该相 ±25° 范围画一条粗线
          const arcStart = rad - (25 * Math.PI) / 180;
          const arcEnd = rad + (25 * Math.PI) / 180;
          const ax1 = cx + statorR * Math.cos(arcStart);
          const ay1 = cy - statorR * Math.sin(arcStart);
          const ax2 = cx + statorR * Math.cos(arcEnd);
          const ay2 = cy - statorR * Math.sin(arcEnd);
          const labelR = coilR + 26;
          const lx = cx + labelR * Math.cos(rad);
          const ly = cy - labelR * Math.sin(rad);

          return (
            <g key={phase.name}>
              {/* 绕组在定子内壁的覆盖区 */}
              <path
                d={`M ${ax1} ${ay1} A ${statorR} ${statorR} 0 0 0 ${ax2} ${ay2}`}
                fill="none"
                stroke={phase.color}
                strokeWidth={4 + normalized * 4}
                strokeLinecap="round"
                opacity={0.4 + normalized * 0.5}
              />
              {/* 截面圆点（绕组横断面） */}
              <circle cx={x} cy={y} r={dotR} fill={phase.color} fillOpacity={0.18 + normalized * 0.3}
                stroke={phase.color} strokeWidth="2" />
              {/* ⊕（流出，⊙圆心点） / ⊗（流入，X） */}
              {flowOut ? (
                <circle cx={x} cy={y} r={3} fill={phase.color} />
              ) : (
                <g stroke={phase.color} strokeWidth="2.5">
                  <line x1={x - dotR * 0.55} y1={y - dotR * 0.55} x2={x + dotR * 0.55} y2={y + dotR * 0.55} />
                  <line x1={x - dotR * 0.55} y1={y + dotR * 0.55} x2={x + dotR * 0.55} y2={y - dotR * 0.55} />
                </g>
              )}
              {/* 相名 + 电流值标签 */}
              <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" fill={phase.color}
                fontSize="13" fontWeight="700">{phase.name}</text>
              <text x={lx} y={ly + 14} textAnchor="middle" dominantBaseline="middle" fill="#9eb5cb"
                fontSize="11" fontFamily="Cascadia Code, Consolas, monospace">
                {formatNumber(phase.current, 1)} A
              </text>
            </g>
          );
        })}

        {/* 中心原点 + 合成磁场箭头 */}
        <line x1={cx - statorR * 0.85} y1={cy} x2={cx + statorR * 0.85} y2={cy} stroke="#1e2a3d" strokeDasharray="2 4" />
        <line x1={cx} y1={cy - statorR * 0.85} x2={cx} y2={cy + statorR * 0.85} stroke="#1e2a3d" strokeDasharray="2 4" />
        <line x1={cx} y1={cy} x2={fieldX} y2={fieldY} stroke="#43f7b5" strokeWidth="4" markerEnd="url(#fieldArrow)" />
        <circle cx={cx} cy={cy} r="4" fill="#e7f3ff" />

        {/* 图例 */}
        <text x={size - 12} y={size - 14} textAnchor="end" fill="#5d7793" fontSize="11">
          ⊙ 电流流出 / ⊗ 流入 · 箭头 = 合成磁场
        </text>
      </svg>
    </div>
  );
}
