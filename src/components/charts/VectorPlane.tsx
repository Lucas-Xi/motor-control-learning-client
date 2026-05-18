import { formatNumber } from '../../utils/format';
import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';
import { useRafThrottle } from '../../utils/useRafThrottle';

interface Props {
  alpha: number;
  beta: number;
  theta?: number;
  d?: number;
  q?: number;
  title?: string;
  max?: number;
  showDqAxes?: boolean;
  onVectorChange?: (alpha: number, beta: number) => void;
}

function polarLine(length: number, angle: number, scale: number, cx: number, cy: number) {
  return {
    x2: cx + length * Math.cos(angle) * scale,
    y2: cy - length * Math.sin(angle) * scale,
  };
}

export function VectorPlane({ alpha, beta, theta = 0, d, q, title = 'αβ 矢量平面', max, showDqAxes = false, onVectorChange }: Props) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const limit = max ?? Math.max(8, Math.abs(alpha), Math.abs(beta), Math.abs(d ?? 0), Math.abs(q ?? 0));
  const scale = (size * 0.36) / limit;
  const vx = cx + alpha * scale;
  const vy = cy - beta * scale;
  const dAxis = polarLine(limit * 0.95, theta, scale, cx, cy);
  const qAxis = polarLine(limit * 0.95, theta + Math.PI / 2, scale, cx, cy);
  const magnitude = Math.hypot(alpha, beta);

  // 矢量端点最近 N 帧的轨迹
  const trail = useRef<Array<{ x: number; y: number }>>([]);
  useEffect(() => {
    trail.current.push({ x: vx, y: vy });
    if (trail.current.length > 32) trail.current.shift();
  }, [vx, vy]);

  const draggingRef = useRef(false);
  const commit = useRafThrottle((nextAlpha: number, nextBeta: number) => {
    onVectorChange?.(nextAlpha, nextBeta);
  });
  const updateFromPointer = useCallback((event: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>) => {
    if (!onVectorChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * size;
    const y = ((event.clientY - rect.top) / rect.height) * size;
    const nextAlpha = Math.max(-limit, Math.min(limit, (x - cx) / scale));
    const nextBeta = Math.max(-limit, Math.min(limit, (cy - y) / scale));
    commit(nextAlpha, nextBeta);
  }, [commit, cx, cy, scale, limit, onVectorChange]);

  return (
    <div className="rounded-2xl border border-line-subtle bg-bg-base p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-body font-medium text-ink-primary">{title}</span>
        <span className="formula text-caption text-accent-primary">α {formatNumber(alpha)} / β {formatNumber(beta)}</span>
      </div>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className={`mx-auto h-[280px] w-full max-w-[320px] ${onVectorChange ? 'cursor-crosshair touch-none' : ''}`}
        onPointerDown={(event) => {
          if (!onVectorChange) return;
          draggingRef.current = true;
          event.currentTarget.setPointerCapture?.(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (draggingRef.current) updateFromPointer(event);
        }}
        onPointerUp={() => { draggingRef.current = false; }}
        onPointerCancel={() => { draggingRef.current = false; }}
        onPointerLeave={() => { draggingRef.current = false; }}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#34d6ff" />
          </marker>
          <marker id="arrowMint" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#43f7b5" />
          </marker>
        </defs>

        {/* 网格圆环（半径标注每个对应 limit 的若干分之一） */}
        {Array.from({ length: 4 }, (_, i) => (
          <circle key={i} cx={cx} cy={cy} r={(i + 1) * (size * 0.36 / 4)} fill="none" stroke="#1e2a3d" strokeWidth="1" />
        ))}
        {/* 当前幅值的轨迹圆（虚线，提示矢量端点理论上沿这个圆旋转） */}
        {magnitude > 0.05 && (
          <circle cx={cx} cy={cy} r={magnitude * scale} fill="none" stroke="#34d6ff"
            strokeWidth="1" strokeDasharray="2 4" opacity="0.45" />
        )}

        {/* 主坐标轴 */}
        <line x1="20" y1={cy} x2={size - 20} y2={cy} stroke="#2c3d57" strokeWidth="1" />
        <line x1={cx} y1="20" x2={cx} y2={size - 20} stroke="#2c3d57" strokeWidth="1" />
        <text x={size - 24} y={cy - 6} fill="#9eb5cb" fontSize="12">α</text>
        <text x={cx + 6} y="22" fill="#9eb5cb" fontSize="12">β</text>

        {/* α / β 投影虚线 */}
        <line x1={vx} y1={vy} x2={vx} y2={cy} stroke="#34d6ff" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />
        <line x1={vx} y1={vy} x2={cx} y2={vy} stroke="#34d6ff" strokeWidth="1" strokeDasharray="4 3" opacity="0.6" />

        {/* 拖影：最近 N 帧的端点位置 */}
        {trail.current.map((p, i) => {
          const opacity = ((i + 1) / trail.current.length) * 0.4;
          return <circle key={i} cx={p.x} cy={p.y} r="1.8" fill="#34d6ff" opacity={opacity} />;
        })}

        {/* d/q 旋转坐标（仅 Park 模块使用） */}
        {showDqAxes && (
          <>
            <line x1={cx} y1={cy} x2={dAxis.x2} y2={dAxis.y2} stroke="#43f7b5" strokeWidth="2" strokeDasharray="6 5" markerEnd="url(#arrowMint)" />
            <line x1={cx} y1={cy} x2={qAxis.x2} y2={qAxis.y2} stroke="#ff5c7a" strokeWidth="2" strokeDasharray="6 5" />
            <text x={dAxis.x2} y={dAxis.y2} fill="#43f7b5" fontSize="12">d</text>
            <text x={qAxis.x2} y={qAxis.y2} fill="#ff8aa0" fontSize="12">q</text>
          </>
        )}

        {/* 主矢量箭头 + 端点白点 */}
        <line x1={cx} y1={cy} x2={vx} y2={vy} stroke="#34d6ff" strokeWidth="3" markerEnd="url(#arrow)" />
        <circle cx={vx} cy={vy} r={onVectorChange ? 10 : 6} fill="#e7f3ff" stroke={onVectorChange ? '#43f7b5' : 'none'} strokeWidth="2" />
        {/* 触控热区扩大：透明 r=24 圆让手指有足够命中面积。放在最后压在视觉之上；
            pointer events 走外层 SVG，无需 stopPropagation。 */}
        {onVectorChange && (
          <circle cx={vx} cy={vy} r="24" fill="transparent" style={{ pointerEvents: 'all' }} />
        )}

        {typeof d === 'number' && typeof q === 'number' && (
          <text x="18" y={size - 18} fill="#e7f3ff" fontSize="12">Id {formatNumber(d)} · Iq {formatNumber(q)}</text>
        )}
      </svg>
      {onVectorChange && (
        <p className="mt-1 text-caption text-ink-muted">拖白点可直接改变矢量端点</p>
      )}
    </div>
  );
}
