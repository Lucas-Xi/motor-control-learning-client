import type { CycleState } from '../../simulation/math/vaporCycle';
import { formatNumber } from '../../utils/format';

interface Props {
  states: readonly [CycleState, CycleState, CycleState, CycleState];
  rpm: number;
  T_e: number;
  T_c: number;
  T_outdoor: number;
  T_indoor: number;
  eevOpening: number;
  flowPhase: number;     // 0..4，沿循环移动的"流体粒子"相位
}

/**
 * 制冷循环管路示意（清洁几何对齐版本）：
 *
 *   y=100  ┌─────────[2]─────────┐
 *          │                     │
 *   y=150  压缩机          冷凝器 → 室外
 *          │ y=150-250    │
 *          │ x=100        │ x=520
 *          │ [1]          │ [3]
 *          │              ↓
 *   y=215  │              EEV
 *          │              ↓
 *   y=245  │              │
 *          │              │ x=520
 *   y=320  │              ↓ ←── [4]──┐
 *          │                         │
 *   y=250  蒸发器 ← 室内              │
 *          x=100                     x=260
 *
 *   所有水平管道在 y=100 / y=320，所有垂直管道在 x=100 / x=520
 *   → 4 段路径全部为纯水平或纯垂直 + 干净 L 转角，无任何斜线
 */

const W = 640;
const H = 380;

// 设备盒
const COMP = { x: 60, y: 60, w: 160, h: 90 };
const COND = { x: 380, y: 40, w: 200, h: 110 };
const EVAP = { x: 60, y: 250, w: 200, h: 110 };
const EEV = { cx: 520, cy: 230, halfH: 15 };

// 连接点（所有 x/y 严格对齐两个公共主轴 x=100/520, y=100/320）
const COMP_OUT = { x: COMP.x + COMP.w, y: 100 };       // 220, 100 — 压缩机右侧出气
const COMP_IN  = { x: 100, y: COMP.y + COMP.h };       // 100, 150 — 压缩机底部吸气
const COND_IN  = { x: COND.x, y: 100 };                // 380, 100 — 冷凝器左侧进气
const COND_OUT = { x: 520, y: COND.y + COND.h };       // 520, 150 — 冷凝器底部出液
const EVAP_OUT = { x: 100, y: EVAP.y };                // 100, 250 — 蒸发器顶部出气（→压缩机吸气）
const EVAP_IN  = { x: EVAP.x + EVAP.w, y: 320 };       // 260, 320 — 蒸发器右侧进液
const EEV_TOP  = { x: 520, y: EEV.cy - EEV.halfH };    // 520, 215
const EEV_BOT  = { x: 520, y: EEV.cy + EEV.halfH };    // 520, 245

// 流体粒子参数化路径（每段 t∈[0,1]）
function pointAlong(seg: number, t: number) {
  if (seg === 0) {
    // 段 0：压缩机出气 → 冷凝器进气（纯水平 y=100）
    return { x: COMP_OUT.x + (COND_IN.x - COMP_OUT.x) * t, y: 100 };
  }
  if (seg === 1) {
    // 段 1：冷凝器出液 → EEV 顶（纯垂直 x=520）
    return { x: 520, y: COND_OUT.y + (EEV_TOP.y - COND_OUT.y) * t };
  }
  if (seg === 2) {
    // 段 2：EEV 底 → 蒸发器进液（先垂直到 y=320 再水平到 x=260）
    if (t < 0.5) return { x: 520, y: EEV_BOT.y + (320 - EEV_BOT.y) * (t * 2) };
    return { x: 520 + (EVAP_IN.x - 520) * ((t - 0.5) * 2), y: 320 };
  }
  // 段 3：蒸发器出气 → 压缩机吸气（纯垂直 x=100）
  return { x: 100, y: EVAP_OUT.y + (COMP_IN.y - EVAP_OUT.y) * t };
}

export function SystemSchematic({ states, rpm, T_e, T_c, T_outdoor, T_indoor, eevOpening, flowPhase }: Props) {
  const [s1, s2, s3, s4] = states;
  const seg = Math.floor(flowPhase) % 4;
  const t = flowPhase - Math.floor(flowPhase);
  const particle = pointAlong(seg, t);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: '100%' }}
      role="img"
      aria-label="refrigeration schematic"
    >
      <defs>
        <marker id="schemArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#43f7b5" />
        </marker>
        <linearGradient id="condGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fb7185" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#fb7185" stopOpacity="0.02" />
        </linearGradient>
        <linearGradient id="evapGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#43f7b5" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#43f7b5" stopOpacity="0.18" />
        </linearGradient>
      </defs>

      {/* 室外 / 室内分隔背景 */}
      <rect x={COND.x - 16} y={COND.y - 16} width={COND.w + 32} height={COND.h + 28} rx="14" fill="rgba(251,113,133,0.04)" stroke="rgba(251,113,133,0.18)" strokeWidth="1" strokeDasharray="4 6" />
      <text x={COND.x + COND.w / 2} y={COND.y - 22} textAnchor="middle" fontSize="11" fill="#fb7185">室外环境 {formatNumber(T_outdoor, 0)}°C</text>
      <rect x={EVAP.x - 16} y={EVAP.y - 14} width={EVAP.w + 32} height={EVAP.h + 30} rx="14" fill="rgba(67,247,181,0.04)" stroke="rgba(67,247,181,0.18)" strokeWidth="1" strokeDasharray="4 6" />
      <text x={EVAP.x + EVAP.w / 2} y={EVAP.y + EVAP.h + 28} textAnchor="middle" fontSize="11" fill="#43f7b5">室内环境 {formatNumber(T_indoor, 0)}°C</text>

      {/* 压缩机 */}
      <rect x={COMP.x} y={COMP.y} width={COMP.w} height={COMP.h} rx="8" fill="#0d1929" stroke="#34d6ff" strokeWidth="1.6" />
      <text x={COMP.x + COMP.w / 2} y={COMP.y + 22} textAnchor="middle" fontSize="13" fontWeight="600" fill="#e7f3ff">压缩机</text>
      <text x={COMP.x + COMP.w / 2} y={COMP.y + 40} textAnchor="middle" fontSize="10" fill="#9eb5cb">FOC 驱动 IPM 电机</text>
      <circle cx={COMP.x + COMP.w / 2} cy={COMP.y + 64} r="14" fill="none" stroke="#34d6ff" strokeWidth="1.4" />
      <text x={COMP.x + COMP.w / 2} y={COMP.y + 68} textAnchor="middle" fontSize="11" fontWeight="600" fill="#34d6ff">{formatNumber(rpm, 0)}</text>
      <text x={COMP.x + COMP.w / 2} y={COMP.y + 82} textAnchor="middle" fontSize="9" fill="#9eb5cb">rpm</text>

      {/* 冷凝器 */}
      <rect x={COND.x} y={COND.y} width={COND.w} height={COND.h} rx="8" fill="url(#condGrad)" stroke="#fb7185" strokeWidth="1.6" />
      <text x={COND.x + COND.w / 2} y={COND.y + 24} textAnchor="middle" fontSize="13" fontWeight="600" fill="#e7f3ff">冷凝器</text>
      <text x={COND.x + COND.w / 2} y={COND.y + 42} textAnchor="middle" fontSize="10" fill="#9eb5cb">高压气 → 高压液 (放热)</text>
      <text x={COND.x + COND.w / 2} y={COND.y + 78} textAnchor="middle" fontSize="11" fill="#fb7185">T_c = {formatNumber(T_c, 1)}°C</text>
      <text x={COND.x + COND.w / 2} y={COND.y + 96} textAnchor="middle" fontSize="9" fill="#9eb5cb">→ 风扇排热到 {formatNumber(T_outdoor, 0)}°C 室外</text>

      {/* 蒸发器 */}
      <rect x={EVAP.x} y={EVAP.y} width={EVAP.w} height={EVAP.h} rx="8" fill="url(#evapGrad)" stroke="#43f7b5" strokeWidth="1.6" />
      <text x={EVAP.x + EVAP.w / 2} y={EVAP.y + 24} textAnchor="middle" fontSize="13" fontWeight="600" fill="#e7f3ff">蒸发器</text>
      <text x={EVAP.x + EVAP.w / 2} y={EVAP.y + 42} textAnchor="middle" fontSize="10" fill="#9eb5cb">低压两相 → 低压气 (吸热)</text>
      <text x={EVAP.x + EVAP.w / 2} y={EVAP.y + 78} textAnchor="middle" fontSize="11" fill="#43f7b5">T_e = {formatNumber(T_e, 1)}°C</text>
      <text x={EVAP.x + EVAP.w / 2} y={EVAP.y + 96} textAnchor="middle" fontSize="9" fill="#9eb5cb">← 从 {formatNumber(T_indoor, 0)}°C 室内吸热</text>

      {/* EEV：蝶形阀符号 */}
      <g transform={`translate(${EEV.cx}, ${EEV.cy})`}>
        <path d={`M -14 -${EEV.halfH} L -14 ${EEV.halfH} L 14 -${EEV.halfH} L 14 ${EEV.halfH} Z`} fill="#0d1929" stroke="#ffb84d" strokeWidth="1.6" />
        <text x="0" y={-EEV.halfH - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill="#e7f3ff">EEV</text>
        <text x="0" y={EEV.halfH + 14} textAnchor="middle" fontSize="10" fill="#ffb84d">{(eevOpening * 100).toFixed(0)}%</text>
      </g>

      {/* === 段 0：压缩机出气 → 冷凝器进气（纯水平 y=100） === */}
      <g opacity={seg === 0 ? 1 : 0.55}>
        {/* 短垂直引出（COMP 顶部边缘 100 起点是右侧中段）*/}
        <line x1={COMP_OUT.x} y1={COMP_OUT.y} x2={COND_IN.x} y2={COND_IN.y} stroke="#43f7b5" strokeWidth="2" markerEnd="url(#schemArrow)" />
        <text x={(COMP_OUT.x + COND_IN.x) / 2} y={COMP_OUT.y - 8} textAnchor="middle" fontSize="10" fill="#fb7185" fontWeight="600">
          [2] {formatNumber(s2.P, 2)} MPa · {formatNumber(s2.T, 0)}°C
        </text>
      </g>

      {/* === 段 1：冷凝器出液 → EEV 顶（纯垂直 x=520） === */}
      <g opacity={seg === 1 ? 1 : 0.55}>
        <line x1={COND_OUT.x} y1={COND_OUT.y} x2={EEV_TOP.x} y2={EEV_TOP.y} stroke="#43f7b5" strokeWidth="2" markerEnd="url(#schemArrow)" />
        <text x={COND_OUT.x + 8} y={(COND_OUT.y + EEV_TOP.y) / 2} fontSize="10" fill="#43f7b5" fontWeight="600">
          [3] {formatNumber(s3.P, 2)} MPa · {formatNumber(s3.T, 0)}°C
        </text>
      </g>

      {/* === 段 2：EEV 底 → 蒸发器进液（垂直 + 水平 干净 L） === */}
      <g opacity={seg === 2 ? 1 : 0.55}>
        <line x1={EEV_BOT.x} y1={EEV_BOT.y} x2={EEV_BOT.x} y2={320} stroke="#43f7b5" strokeWidth="2" />
        <line x1={EEV_BOT.x} y1={320} x2={EVAP_IN.x} y2={320} stroke="#43f7b5" strokeWidth="2" markerEnd="url(#schemArrow)" />
        <text x={(EEV_BOT.x + EVAP_IN.x) / 2} y={320 - 8} textAnchor="middle" fontSize="10" fill="#43f7b5" fontWeight="600">
          [4] {formatNumber(s4.P, 2)} MPa · {formatNumber(s4.T, 0)}°C
        </text>
      </g>

      {/* === 段 3：蒸发器出气 → 压缩机吸气（纯垂直 x=100） === */}
      <g opacity={seg === 3 ? 1 : 0.55}>
        <line x1={EVAP_OUT.x} y1={EVAP_OUT.y} x2={COMP_IN.x} y2={COMP_IN.y} stroke="#43f7b5" strokeWidth="2" markerEnd="url(#schemArrow)" />
        <text x={EVAP_OUT.x + 8} y={(EVAP_OUT.y + COMP_IN.y) / 2} fontSize="10" fill="#34d6ff" fontWeight="600">
          [1] {formatNumber(s1.P, 2)} MPa · {formatNumber(s1.T, 0)}°C
        </text>
      </g>

      {/* 流体粒子 */}
      <circle cx={particle.x} cy={particle.y} r="5" fill="#34d6ff">
        <animate attributeName="r" values="5;7;5" dur="0.8s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
