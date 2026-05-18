import { useCallback, useRef } from 'react';
import type { SVPWMResult } from '../../simulation/math/svpwm';
import { formatNumber, formatPercent } from '../../utils/format';
import type { MouseEvent, PointerEvent } from 'react';
import { useRafThrottle } from '../../utils/useRafThrottle';

interface Props {
  uAlpha: number;
  uBeta: number;
  uDc: number;
  result: SVPWMResult;
  onVectorChange?: (uAlpha: number, uBeta: number) => void;
}

// 六个非零矢量对应的上桥臂状态（A B C），A 在最高位
// V1 = 100, V2 = 110, V3 = 010, V4 = 011, V5 = 001, V6 = 101
const SWITCH_STATES = ['100', '110', '010', '011', '001', '101'] as const;

export function SpaceVectorHexagon({ uAlpha, uBeta, uDc, result, onVectorChange }: Props) {
  const size = 360;
  const cx = size / 2;
  const cy = size / 2;
  const radius = 132;
  const limit = Math.max(1, uDc / Math.sqrt(3));
  const scale = radius / limit;
  const vertices = Array.from({ length: 6 }, (_, i) => {
    const angle = (i * Math.PI) / 3;
    return { x: cx + radius * Math.cos(angle), y: cy - radius * Math.sin(angle), angle };
  });
  const vectorX = cx + uAlpha * scale;
  const vectorY = cy - uBeta * scale;
  const draggingRef = useRef(false);
  const commit = useRafThrottle((alpha: number, beta: number) => {
    onVectorChange?.(alpha, beta);
  });
  const updateFromPointer = useCallback((event: PointerEvent<SVGSVGElement> | MouseEvent<SVGSVGElement>) => {
    if (!onVectorChange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * size;
    const y = ((event.clientY - rect.top) / rect.height) * size;
    const rawAlpha = (x - cx) / scale;
    const rawBeta = (cy - y) / scale;
    const magnitude = Math.hypot(rawAlpha, rawBeta);
    const maxMagnitude = limit * 1.15;
    const gain = magnitude > maxMagnitude ? maxMagnitude / magnitude : 1;
    commit(rawAlpha * gain, rawBeta * gain);
  }, [commit, cx, cy, scale, limit, onVectorChange]);

  // 当前活动扇区的两个边界矢量（V_k 和 V_{k+1}）
  const sectorIndex = result.sector - 1;
  const sectorStart = vertices[sectorIndex];
  const sectorEnd = vertices[(sectorIndex + 1) % 6];

  // 当前矢量在两个边界矢量上的分解端点（T1·Vk 和 T2·V_{k+1} 缩放后位置）
  const ts = result.t1 + result.t2 + result.t0;
  const t1Frac = ts > 0 ? result.t1 / ts : 0;
  const t2Frac = ts > 0 ? result.t2 / ts : 0;
  // T1 段：从原点沿 sectorStart 方向走 t1Frac × |目标矢量|
  const targetMag = Math.hypot(uAlpha, uBeta);
  const t1Len = t1Frac * targetMag * scale;
  const t2Len = t2Frac * targetMag * scale;
  const t1End = {
    x: cx + Math.cos(sectorStart.angle) * t1Len,
    y: cy - Math.sin(sectorStart.angle) * t1Len,
  };
  const t2EndFromT1 = {
    x: t1End.x + Math.cos(sectorEnd.angle) * t2Len,
    y: t1End.y - Math.sin(sectorEnd.angle) * t2Len,
  };

  return (
    <div className="rounded-2xl border border-line-subtle bg-bg-base p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-caption uppercase tracking-[0.18em] text-ink-muted">space vector plane</p>
          <h3 className="font-display text-title text-ink-primary">SVPWM 六边形空间矢量</h3>
        </div>
        <div className={`rounded-lg border px-3 py-1.5 text-body font-medium ${
          result.saturated
            ? 'border-accent-fault/40 bg-accent-fault/10 text-accent-fault'
            : 'border-accent-measure/40 bg-accent-measure/10 text-accent-measure'
        }`}>
          扇区 {result.sector} · m={formatNumber(result.modulationIndex, 3)}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className={`mx-auto h-[360px] max-w-full ${onVectorChange ? 'cursor-crosshair touch-none' : ''}`}
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
          <marker id="svpwmArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#34d6ff" />
          </marker>
          <marker id="t1Arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#43f7b5" />
          </marker>
          <marker id="t2Arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ffb84d" />
          </marker>
        </defs>

        {/* 当前扇区高亮三角 */}
        <polygon points={`${cx},${cy} ${sectorStart.x},${sectorStart.y} ${sectorEnd.x},${sectorEnd.y}`}
          fill="rgba(67,247,181,0.10)" stroke="rgba(67,247,181,0.45)" strokeWidth="1" />

        {/* 六边形外框 */}
        <polygon points={vertices.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none" stroke="#2c3d57" strokeWidth="1.5" />

        {/* 中心 αβ 坐标轴 */}
        <line x1={24} y1={cy} x2={size - 24} y2={cy} stroke="#1e2a3d" strokeWidth="1" strokeDasharray="2 4" />
        <line x1={cx} y1={size - 24} x2={cx} y2={24} stroke="#1e2a3d" strokeWidth="1" strokeDasharray="2 4" />
        <text x={size - 30} y={cy - 6} fill="#5d7793" fontSize="11">Uα</text>
        <text x={cx + 6} y={28} fill="#5d7793" fontSize="11">Uβ</text>

        {/* 6 个非零矢量端点 + 顶点编号 + 上桥臂三相状态码 */}
        {vertices.map((point, index) => {
          const labelR = radius + 32;
          const lx = cx + labelR * Math.cos(point.angle);
          const ly = cy - labelR * Math.sin(point.angle);
          const codeR = radius + 50;
          const codeX = cx + codeR * Math.cos(point.angle);
          const codeY = cy - codeR * Math.sin(point.angle) + 4;
          const isActiveBoundary = index === sectorIndex || index === (sectorIndex + 1) % 6;
          return (
            <g key={index}>
              <line x1={cx} y1={cy} x2={point.x} y2={point.y}
                stroke={isActiveBoundary ? '#43f7b5' : '#1e2a3d'} strokeWidth={isActiveBoundary ? 1.5 : 1}
                strokeDasharray={isActiveBoundary ? '6 4' : '4 5'} opacity={isActiveBoundary ? 0.65 : 0.35} />
              <circle cx={point.x} cy={point.y} r="6"
                fill={isActiveBoundary ? '#43f7b5' : '#5d7793'}
                stroke="#0d1929" strokeWidth="2" />
              <text x={lx} y={ly + 4} textAnchor="middle"
                fill={isActiveBoundary ? '#43f7b5' : '#9eb5cb'} fontSize="13" fontWeight="700">
                V{index + 1}
              </text>
              <text x={codeX} y={codeY} textAnchor="middle"
                fill="#5d7793" fontSize="10" fontFamily="Cascadia Code, Consolas, monospace">
                ({SWITCH_STATES[index]})
              </text>
            </g>
          );
        })}

        {/* 零矢量 V0/V7 标记在中心 */}
        <circle cx={cx} cy={cy} r="10" fill="rgba(255,184,77,0.18)" stroke="rgba(255,184,77,0.5)" strokeWidth="1" />
        <text x={cx} y={cy - 16} textAnchor="middle" fill="#ffb84d" fontSize="10" fontFamily="Cascadia Code, Consolas, monospace">
          V0(000) / V7(111)
        </text>

        {/* T1·V_k 段（沿当前扇区第一条边） */}
        {t1Len > 1 && (
          <line x1={cx} y1={cy} x2={t1End.x} y2={t1End.y}
            stroke="#43f7b5" strokeWidth="3" markerEnd="url(#t1Arrow)" />
        )}
        {/* T2·V_{k+1} 段（接在 t1End 之后，沿第二条边） */}
        {t2Len > 1 && (
          <line x1={t1End.x} y1={t1End.y} x2={t2EndFromT1.x} y2={t2EndFromT1.y}
            stroke="#ffb84d" strokeWidth="3" markerEnd="url(#t2Arrow)" />
        )}

        {/* 目标合成矢量（蓝色实线，最显眼） */}
        <line x1={cx} y1={cy} x2={vectorX} y2={vectorY} stroke="#34d6ff" strokeWidth="3.5" markerEnd="url(#svpwmArrow)" />
        <circle cx={vectorX} cy={vectorY} r={onVectorChange ? 10 : 6}
          fill="#e7f3ff" stroke={onVectorChange ? '#43f7b5' : '#34d6ff'} strokeWidth="2" />
        {/* 触控热区扩大：透明 r=24 命中圆，手指点附近也算抓到端点。 */}
        {onVectorChange && (
          <circle cx={vectorX} cy={vectorY} r="24" fill="transparent" style={{ pointerEvents: 'all' }} />
        )}

        {/* 图例（左下） */}
        <g fontSize="10" fontFamily="Cascadia Code, Consolas, monospace">
          <line x1="14" y1={size - 50} x2="34" y2={size - 50} stroke="#34d6ff" strokeWidth="2.5" />
          <text x="40" y={size - 47} fill="#9eb5cb">目标 Uαβ</text>
          <line x1="14" y1={size - 34} x2="34" y2={size - 34} stroke="#43f7b5" strokeWidth="2.5" />
          <text x="40" y={size - 31} fill="#9eb5cb">T1·V{result.sector}</text>
          <line x1="14" y1={size - 18} x2="34" y2={size - 18} stroke="#ffb84d" strokeWidth="2.5" />
          <text x="40" y={size - 15} fill="#9eb5cb">T2·V{((result.sector) % 6) + 1}</text>
        </g>
      </svg>
      <div className="mt-3 grid gap-2 text-caption md:grid-cols-3">
        <div className="rounded-lg border border-line-subtle bg-bg-surface p-2">
          <span className="text-ink-muted">Uα / Uβ </span>
          <span className="text-ink-primary">{formatNumber(uAlpha, 2)} / {formatNumber(uBeta, 2)} V</span>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-surface p-2">
          <span className="text-ink-muted">线性区上限 </span>
          <span className="text-ink-primary">{formatNumber(limit, 2)} V</span>
        </div>
        <div className="rounded-lg border border-line-subtle bg-bg-surface p-2">
          <span className="text-ink-muted">母线利用率 </span>
          <span className="text-ink-primary">{formatPercent(result.busUtilization)}</span>
        </div>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        括号 (ABC) 是该顶点对应的上桥臂三相状态：1=高电平，0=低电平。SVPWM 用所在扇区的两条边
        V<sub>k</sub>、V<sub>k+1</sub>（绿/橙箭头按 T1、T2 时间分配），加零矢量 V0/V7 凑齐周期，合成出蓝色目标矢量。
      </p>
    </div>
  );
}
