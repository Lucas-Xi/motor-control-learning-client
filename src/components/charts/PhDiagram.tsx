import { useMemo, useRef } from 'react';
import { saturationCurve, type Refrigerant } from '../../simulation/math/refrigerantProps';
import type { CycleState } from '../../simulation/math/vaporCycle';
import { useRafThrottle } from '../../utils/useRafThrottle';
import { useI18n } from '../../i18n/useI18n';

/** 两级循环覆盖点：仅展示用，不含 CycleState 完整字段（无质量比焓导数等）。 */
export interface TwoStageOverlayPoint {
  index: number;
  P: number;
  h: number;
  label: string;
}

interface Props {
  refrigerant: Refrigerant;
  states: readonly [CycleState, CycleState, CycleState, CycleState];
  /** 拖动状态点 [1] 或 [3]：返回 (h, P) — 父组件根据点编号反推 (Te,SH) 或 (Tc,SC) */
  onPointDrag?: (pointIndex: 1 | 3, h: number, P: number) => void;
  /** 可选两级覆盖点（来自 simulateTwoStageCycle），用紫色三角叠到原 4 状态点上。 */
  twoStageStates?: readonly TwoStageOverlayPoint[];
}

const W = 640;
const H = 380;
const PADDING = { left: 56, right: 24, top: 24, bottom: 40 };
const PLOT_W = W - PADDING.left - PADDING.right;
const PLOT_H = H - PADDING.top - PADDING.bottom;

const H_MIN = 150;
const H_MAX = 580;
const P_MIN_LOG = Math.log10(0.1);
const P_MAX_LOG = Math.log10(5);

const xOf = (h: number) => PADDING.left + ((h - H_MIN) / (H_MAX - H_MIN)) * PLOT_W;
const yOf = (P: number) => PADDING.top + (1 - (Math.log10(P) - P_MIN_LOG) / (P_MAX_LOG - P_MIN_LOG)) * PLOT_H;
const clip = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// 反向映射：屏幕坐标 → (h, P)
function hOf(x: number): number {
  return H_MIN + ((x - PADDING.left) / PLOT_W) * (H_MAX - H_MIN);
}
function POf(y: number): number {
  const frac = 1 - (y - PADDING.top) / PLOT_H;
  return Math.pow(10, P_MIN_LOG + frac * (P_MAX_LOG - P_MIN_LOG));
}

export function PhDiagram({ refrigerant, states, onPointDrag, twoStageStates }: Props) {
  const { t } = useI18n();
  const draggingRef = useRef<1 | 3 | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const commit = useRafThrottle((idx: 1 | 3, h: number, P: number) => {
    onPointDrag?.(idx, h, P);
  });

  function pickFromEvent(event: React.PointerEvent<SVGElement>): { h: number; P: number } | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    // 把 client 坐标换算到 viewBox 坐标
    const x = ((event.clientX - rect.left) / rect.width) * W;
    const y = ((event.clientY - rect.top) / rect.height) * H;
    const h = Math.max(H_MIN + 5, Math.min(H_MAX - 5, hOf(x)));
    const P = Math.max(0.12, Math.min(4.5, POf(y)));
    return { h, P };
  }

  function handlePointerDown(idx: 1 | 3) {
    return (event: React.PointerEvent<SVGElement>) => {
      if (!onPointDrag) return;
      event.stopPropagation();
      draggingRef.current = idx;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const pt = pickFromEvent(event);
      if (pt) commit(idx, pt.h, pt.P);
    };
  }
  function handlePointerMove(event: React.PointerEvent<SVGElement>) {
    if (!draggingRef.current) return;
    const pt = pickFromEvent(event);
    if (pt) commit(draggingRef.current, pt.h, pt.P);
  }
  function handlePointerUp() {
    draggingRef.current = null;
  }

  const dome = useMemo(() => saturationCurve(refrigerant), [refrigerant]);

  const liqPath = useMemo(() => {
    const segs = dome.liquid.filter((p) => p.h >= H_MIN && p.h <= H_MAX && p.P >= 0.1 && p.P <= 5);
    return segs.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.h).toFixed(1)} ${yOf(p.P).toFixed(1)}`).join(' ');
  }, [dome]);

  const vapPath = useMemo(() => {
    const segs = dome.vapor.filter((p) => p.h >= H_MIN && p.h <= H_MAX && p.P >= 0.1 && p.P <= 5);
    return segs.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.h).toFixed(1)} ${yOf(p.P).toFixed(1)}`).join(' ');
  }, [dome]);

  // 两相区填充：液线 + 反向气线 闭合
  const domeFillPath = useMemo(() => {
    const liq = dome.liquid.filter((p) => p.h >= H_MIN && p.h <= H_MAX && p.P >= 0.1 && p.P <= 5);
    const vap = dome.vapor.filter((p) => p.h >= H_MIN && p.h <= H_MAX && p.P >= 0.1 && p.P <= 5).reverse();
    const all = [...liq, ...vap];
    if (all.length === 0) return '';
    return all.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.h).toFixed(1)} ${yOf(p.P).toFixed(1)}`).join(' ') + ' Z';
  }, [dome]);

  // 4 状态点
  const pts = states.map((s) => ({
    ...s,
    x: clip(xOf(s.h), PADDING.left + 4, W - PADDING.right - 4),
    y: clip(yOf(s.P), PADDING.top + 4, H - PADDING.bottom - 4),
  }));
  const [p1, p2, p3, p4] = pts;

  // 1→2 多变压缩用一条略向右弯曲的二次贝塞尔
  const compressionCurve = `M ${p1.x} ${p1.y} Q ${(p1.x + p2.x) / 2 + 22} ${(p1.y + p2.y) / 2 - 6} ${p2.x} ${p2.y}`;

  const hTicks = [150, 200, 250, 300, 350, 400, 450, 500, 550];
  const pTicks = [0.1, 0.2, 0.5, 1, 2, 5];

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: '100%' }}
      className={onPointDrag ? 'touch-none' : ''}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      role="img"
      aria-label="P-h diagram"
    >
      <defs>
        <marker id="phArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#43f7b5" />
        </marker>
        <radialGradient id="ptGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fb7185" stopOpacity="1" />
          <stop offset="60%" stopColor="#fb7185" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 网格 */}
      {hTicks.map((h) => (
        <line key={`hg-${h}`} x1={xOf(h)} y1={PADDING.top} x2={xOf(h)} y2={H - PADDING.bottom}
          stroke="rgba(231,243,255,0.05)" strokeDasharray="3 6" />
      ))}
      {pTicks.map((P) => (
        <line key={`pg-${P}`} x1={PADDING.left} y1={yOf(P)} x2={W - PADDING.right} y2={yOf(P)}
          stroke="rgba(231,243,255,0.05)" strokeDasharray="3 6" />
      ))}

      {/* 坐标轴 */}
      <line x1={PADDING.left} y1={H - PADDING.bottom} x2={W - PADDING.right} y2={H - PADDING.bottom} stroke="#1e2a3d" strokeWidth="1" />
      <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={H - PADDING.bottom} stroke="#1e2a3d" strokeWidth="1" />

      {/* 刻度文字 */}
      {hTicks.map((h) => (
        <text key={`ht-${h}`} x={xOf(h)} y={H - PADDING.bottom + 14} textAnchor="middle" fontSize="10" fill="#9eb5cb">{h}</text>
      ))}
      {pTicks.map((P) => (
        <text key={`pt-${P}`} x={PADDING.left - 8} y={yOf(P) + 3} textAnchor="end" fontSize="10" fill="#9eb5cb">{P}</text>
      ))}
      <text x={(PADDING.left + W - PADDING.right) / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="#9eb5cb">{t('charts.phXLabel')}</text>
      <text x={16} y={(PADDING.top + H - PADDING.bottom) / 2} fontSize="11" fill="#9eb5cb"
        transform={`rotate(-90 16 ${(PADDING.top + H - PADDING.bottom) / 2})`}>{t('charts.phYLabel')}</text>

      {/* 两相区填色（先于线条以便压在底层） */}
      {domeFillPath && <path d={domeFillPath} fill="rgba(125,211,252,0.05)" stroke="none" />}

      {/* 饱和包络线 */}
      <path d={liqPath} stroke="#34d6ff" strokeWidth="1.6" fill="none" />
      <path d={vapPath} stroke="#ffb84d" strokeWidth="1.6" fill="none" />

      {/* 三相区域文字注释 */}
      <text x={PADDING.left + 28} y={H - PADDING.bottom - 30} fontSize="9" fill="rgba(231,243,255,0.35)">{t('charts.phSubcooled')}</text>
      <text x={(p3.x + p4.x) / 2} y={(p3.y + p4.y) / 2 + 4} textAnchor="middle" fontSize="9" fill="rgba(231,243,255,0.35)">{t('charts.phTwoPhase')}</text>
      <text x={W - PADDING.right - 32} y={H - PADDING.bottom - 30} fontSize="9" fill="rgba(231,243,255,0.35)" textAnchor="end">{t('charts.phSuperheated')}</text>

      {/* 循环路径（先画线，再画箭头，最后画点 → 点压在最上层） */}
      <path d={compressionCurve} stroke="#43f7b5" strokeWidth="2.4" fill="none" markerEnd="url(#phArrow)" />
      <line x1={p2.x} y1={p2.y} x2={p3.x} y2={p3.y} stroke="#43f7b5" strokeWidth="2.4" markerEnd="url(#phArrow)" />
      <line x1={p3.x} y1={p3.y} x2={p4.x} y2={p4.y} stroke="#43f7b5" strokeWidth="2.4" markerEnd="url(#phArrow)" />
      <line x1={p4.x} y1={p4.y} x2={p1.x} y2={p1.y} stroke="#43f7b5" strokeWidth="2.4" markerEnd="url(#phArrow)" />

      {/* 段标签（小字） */}
      <text x={(p1.x + p2.x) / 2 + 30} y={(p1.y + p2.y) / 2 + 2} fontSize="10" fill="#43f7b5">{t('charts.phCompression')}</text>
      <text x={(p2.x + p3.x) / 2} y={p2.y - 8} textAnchor="middle" fontSize="10" fill="#43f7b5">{t('charts.phCondensation')}</text>
      <text x={p3.x - 8} y={(p3.y + p4.y) / 2} textAnchor="end" fontSize="10" fill="#43f7b5">{t('charts.phThrottle')}</text>
      <text x={(p4.x + p1.x) / 2} y={p4.y + 16} textAnchor="middle" fontSize="10" fill="#43f7b5">{t('charts.phEvaporation')}</text>

      {/* 两级压缩 + 闪发覆盖（紫色三角 + 闪发对角虚线）
          覆盖在单级循环线之上、状态点之下，让学员同时看见两组循环路径。 */}
      {twoStageStates && twoStageStates.length > 0 && (() => {
        const tsPts = twoStageStates
          .filter((s) => s.h >= H_MIN && s.h <= H_MAX && s.P >= 0.1 && s.P <= 5)
          .map((s) => ({
            ...s,
            x: clip(xOf(s.h), PADDING.left + 4, W - PADDING.right - 4),
            y: clip(yOf(s.P), PADDING.top + 4, H - PADDING.bottom - 4),
          }));
        const flashGas = tsPts.find((p) => p.index === 7);
        const flashLiq = tsPts.find((p) => p.index === 8);
        return (
          <g>
            {flashGas && flashLiq && (
              <line
                x1={flashGas.x}
                y1={flashGas.y}
                x2={flashLiq.x}
                y2={flashLiq.y}
                stroke="#c4b5fd"
                strokeWidth="1.5"
                strokeDasharray="4 4"
                opacity="0.75"
              />
            )}
            {tsPts.map((p) => (
              <g key={`ts-${p.index}`}>
                <polygon
                  points={`${p.x},${p.y - 6} ${p.x - 5.2},${p.y + 4} ${p.x + 5.2},${p.y + 4}`}
                  fill="#c4b5fd"
                  stroke="#0d1929"
                  strokeWidth="1.4"
                />
                <text
                  x={p.x + 7}
                  y={p.y + 3}
                  fontSize="9"
                  fontWeight="600"
                  fill="#c4b5fd"
                  paintOrder="stroke"
                  stroke="#0d1929"
                  strokeWidth="1"
                  style={{ pointerEvents: 'none' }}
                >
                  {p.index}
                </text>
              </g>
            ))}
          </g>
        );
      })()}

      {/* 4 状态点：发光环 + 实心点 + 编号文字（带描边以保证在任何背景上可读）
          点 [1] 和 [3] 可拖动以调整工况 */}
      {pts.map((p) => {
        const draggable = onPointDrag && (p.index === 1 || p.index === 3);
        return (
          <g key={p.index}>
            <circle cx={p.x} cy={p.y} r="11" fill="url(#ptGlow)" />
            {/* 可拖动点周围的虚线圈，提示用户可交互 */}
            {draggable && <circle cx={p.x} cy={p.y} r="14" fill="none" stroke="#7dd3fc" strokeWidth="1" strokeDasharray="2 2" opacity="0.55" />}
            <circle
              cx={p.x}
              cy={p.y}
              r="6.5"
              fill="#fb7185"
              stroke="#0d1929"
              strokeWidth="1.8"
              style={{ cursor: draggable ? 'grab' : 'default' }}
              onPointerDown={draggable ? handlePointerDown(p.index as 1 | 3) : undefined}
            />
            <text
              x={p.x}
              y={p.y + 3.5}
              textAnchor="middle"
              fontSize="10"
              fontWeight="800"
              fill="#0d1929"
              paintOrder="stroke"
              stroke="#fb7185"
              strokeWidth="0.4"
              style={{ pointerEvents: 'none' }}
            >
              {p.index}
            </text>
            {/* 触控热区扩大：透明 r=24，仅对可拖动点提供。
                放在最后保证压在视觉之上；pointerdown 同步触发，再由父 SVG 的 move/up 接管。 */}
            {draggable && (
              <circle
                cx={p.x}
                cy={p.y}
                r="24"
                fill="transparent"
                style={{ cursor: 'grab', pointerEvents: 'all' }}
                onPointerDown={handlePointerDown(p.index as 1 | 3)}
              />
            )}
          </g>
        );
      })}

      {/* 拖动提示 */}
      {onPointDrag && (
        <text x={W - PADDING.right - 6} y={PADDING.top + 28} textAnchor="end" fontSize="9" fill="#7dd3fc" opacity={0.7}>
          {t('charts.phDragHint')}
        </text>
      )}

      {/* 制冷剂角标：放在右下方避开点 [2] */}
      <g transform={`translate(${W - PADDING.right - 6}, ${H - PADDING.bottom - 6})`}>
        <rect x="-46" y="-18" width="46" height="18" rx="4" fill="rgba(125,211,252,0.12)" stroke="rgba(125,211,252,0.4)" strokeWidth="1" />
        <text x="-23" y="-5" textAnchor="middle" fontSize="11" fontWeight="600" fill="#7dd3fc">{refrigerant}</text>
      </g>

      {/* 图例（左上角） */}
      <g transform={`translate(${PADDING.left + 8}, ${PADDING.top - 6})`}>
        <line x1="0" y1="6" x2="14" y2="6" stroke="#34d6ff" strokeWidth="1.6" />
        <text x="18" y="9" fontSize="10" fill="#9eb5cb">{t('charts.phSatLiquid')}</text>
        <line x1="58" y1="6" x2="72" y2="6" stroke="#ffb84d" strokeWidth="1.6" />
        <text x="76" y="9" fontSize="10" fill="#9eb5cb">{t('charts.phSatVapor')}</text>
        <line x1="116" y1="6" x2="130" y2="6" stroke="#43f7b5" strokeWidth="2" />
        <text x="134" y="9" fontSize="10" fill="#9eb5cb">{t('charts.phCycle')}</text>
        {twoStageStates && twoStageStates.length > 0 && (
          <g transform="translate(164, 0)">
            <polygon points="7,1 1,11 13,11" fill="#c4b5fd" stroke="#0d1929" strokeWidth="1" />
            <text x="18" y="9" fontSize="10" fill="#9eb5cb">{t('charts.phTwoStage')}</text>
          </g>
        )}
      </g>
    </svg>
  );
}
