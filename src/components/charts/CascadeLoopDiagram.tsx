import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  positionTarget: number;
  positionActual: number;
  speedTarget: number;
  speedActual: number;
  currentTarget: number;
  currentActual: number;
  /** 三环带宽（Hz）—决定动画脉冲速度 */
  positionBw: number;
  speedBw: number;
  currentBw: number;
  /** PI 增益，仅用于显示 */
  positionKp?: number;
  positionKi?: number;
  speedKp?: number;
  speedKi?: number;
  currentKp?: number;
  currentKi?: number;
  /** 是否暂停动画 */
  paused?: boolean;
}

/**
 * 三闭环级联控制信号流框图：
 *
 *   位置环（最外，慢）—— 速度环（中间）—— 电流环（最内，快）
 *
 *   +─────────────────────────[ 位置环 ]──────────────────────────+
 *   |  Σ → PI(pos) →                                              |
 *   |      ↓ 速度参考                                             |
 *   |     +──────────────────[ 速度环 ]───────────────────+       |
 *   |     | Σ → PI(spd) →                                |       |
 *   |     |     ↓ 电流参考                               |       |
 *   |     |    +────────────[ 电流环 ]──────────+        |       |
 *   |     |    | Σ → PI(cur) → 逆变器/电机 →   |        |       |
 *   |     |    +───────────────────────────────+        |       |
 *   |     +────────────────────────────────────────────+       |
 *   +─────────────────────────────────────────────────────────────+
 *
 * 三个动画脉冲沿各自环路移动，速度按带宽比例：currentBw > speedBw > positionBw。
 */

// 视图常量
const VB_W = 720;
const VB_H = 360;

// 三层嵌套外框（圆角矩形）
const POS_BOX = { x: 24, y: 28, w: 672, h: 304, r: 18 };
const SPD_BOX = { x: 96, y: 80, w: 528, h: 220, r: 16 };
const CUR_BOX = { x: 176, y: 134, w: 368, h: 130, r: 14 };

// 三个环的求和节点 / PI 块布局
// 位置环：sum 在最左，PI 在 sum 右侧，输出向下进入速度环
const POS_SUM = { cx: 60, cy: 180, r: 14 };
const POS_PI = { x: 110, y: 50, w: 70, h: 36 };

// 速度环：sum 在 PI(pos) 之后内嵌
const SPD_SUM = { cx: 132, cy: 180, r: 12 };
const SPD_PI = { x: 184, y: 102, w: 70, h: 34 };

// 电流环
const CUR_SUM = { cx: 212, cy: 180, r: 11 };
const CUR_PI = { x: 260, y: 156, w: 70, h: 32 };

// 电机/被控对象
const PLANT = { x: 360, y: 156, w: 90, h: 32 };

// 反馈输出端点（最右）
const OUTPUT_X = 480;

// 颜色（沿用项目视觉令牌）
const C_POS = '#ffb84d';   // 位置环 = warn 色（外环慢）
const C_SPD = '#34d6ff';   // 速度环 = primary
const C_CUR = '#43f7b5';   // 电流环 = measure
const C_LINE = '#2c3d57';
const C_INK = '#e7f3ff';
const C_INK_SUB = '#9eb5cb';
const C_INK_MUTED = '#5d7793';

/** 把误差大小映射到 0..1 强度，用作色块 alpha */
function errorIntensity(target: number, actual: number, scale: number) {
  const e = Math.abs(target - actual) / Math.max(scale, 1e-6);
  return Math.min(1, Math.max(0, e));
}

/** 把带宽 Hz 转成动画周期秒，currentBw 越大周期越短 */
function periodFromBw(bw: number) {
  // 视觉 dur，限制在 [0.4s, 6s]，与真实带宽对数相关
  const safe = Math.max(0.5, bw);
  const dur = 6 / Math.log10(safe + 10); // bw=10→~5s, 50→~3.5s, 500→~2s
  return Math.min(6, Math.max(0.4, dur));
}

export function CascadeLoopDiagram({
  positionTarget,
  positionActual,
  speedTarget,
  speedActual,
  currentTarget,
  currentActual,
  positionBw,
  speedBw,
  currentBw,
  positionKp = 0,
  positionKi = 0,
  speedKp = 0,
  speedKi = 0,
  currentKp = 0,
  currentKi = 0,
  paused = false,
}: Props) {
  // 三个脉冲的相位（0..1），用 RAF 推进
  const [phase, setPhase] = useState({ pos: 0, spd: 0, cur: 0 });
  const lastTsRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const periods = useMemo(
    () => ({
      pos: periodFromBw(positionBw),
      spd: periodFromBw(speedBw),
      cur: periodFromBw(currentBw),
    }),
    [positionBw, speedBw, currentBw],
  );

  useEffect(() => {
    if (paused) {
      lastTsRef.current = null;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      const dt = (ts - last) / 1000;
      lastTsRef.current = ts;
      setPhase((p) => ({
        pos: (p.pos + dt / periods.pos) % 1,
        spd: (p.spd + dt / periods.spd) % 1,
        cur: (p.cur + dt / periods.cur) % 1,
      }));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
    };
  }, [paused, periods.pos, periods.spd, periods.cur]);

  // 误差强度 → 求和节点色块强度
  const posErr = errorIntensity(positionTarget, positionActual, Math.max(Math.abs(positionTarget), 30));
  const spdErr = errorIntensity(speedTarget, speedActual, Math.max(Math.abs(speedTarget), 200));
  const curErr = errorIntensity(currentTarget, currentActual, 2);

  // 三条环路 path：每条都是闭合矩形回路（sum → PI → 沿外框右下 → 反馈回 sum）
  // 用于 SVG path 的可视轨迹 + 脉冲点 getPointAtLength 取样
  const positionLoopPath = describeLoopPath(
    POS_SUM.cx, POS_SUM.cy,
    POS_PI.x + POS_PI.w / 2, POS_PI.y + POS_PI.h / 2,
    POS_BOX.x + POS_BOX.w - 28, POS_BOX.y + POS_BOX.h - 24,
  );
  const speedLoopPath = describeLoopPath(
    SPD_SUM.cx, SPD_SUM.cy,
    SPD_PI.x + SPD_PI.w / 2, SPD_PI.y + SPD_PI.h / 2,
    SPD_BOX.x + SPD_BOX.w - 24, SPD_BOX.y + SPD_BOX.h - 22,
  );
  const currentLoopPath = describeLoopPath(
    CUR_SUM.cx, CUR_SUM.cy,
    CUR_PI.x + CUR_PI.w / 2, CUR_PI.y + CUR_PI.h / 2,
    CUR_BOX.x + CUR_BOX.w - 20, CUR_BOX.y + CUR_BOX.h - 20,
  );

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className="w-full h-full"
      role="img"
      aria-label="三闭环级联控制信号流框图"
    >
      {/* 三层嵌套外框 */}
      <NestedFrame box={POS_BOX} color={C_POS} label="位置环" sub={`BW≈${positionBw.toFixed(0)}Hz`} />
      <NestedFrame box={SPD_BOX} color={C_SPD} label="速度环" sub={`BW≈${speedBw.toFixed(0)}Hz`} />
      <NestedFrame box={CUR_BOX} color={C_CUR} label="电流环" sub={`BW≈${currentBw.toFixed(0)}Hz`} />

      {/* 三条信号路径（虚线轨迹，用于动画 motion path） */}
      <path id="cascade-pos-path" d={positionLoopPath} fill="none" stroke={C_POS} strokeOpacity={0.35} strokeWidth={1.2} strokeDasharray="3 5" />
      <path id="cascade-spd-path" d={speedLoopPath} fill="none" stroke={C_SPD} strokeOpacity={0.35} strokeWidth={1.2} strokeDasharray="3 5" />
      <path id="cascade-cur-path" d={currentLoopPath} fill="none" stroke={C_CUR} strokeOpacity={0.4} strokeWidth={1.2} strokeDasharray="3 5" />

      {/* 求和节点（圆 + - +） */}
      <SumNode cx={POS_SUM.cx} cy={POS_SUM.cy} r={POS_SUM.r} color={C_POS} intensity={posErr} label="θ" />
      <SumNode cx={SPD_SUM.cx} cy={SPD_SUM.cy} r={SPD_SUM.r} color={C_SPD} intensity={spdErr} label="ω" />
      <SumNode cx={CUR_SUM.cx} cy={CUR_SUM.cy} r={CUR_SUM.r} color={C_CUR} intensity={curErr} label="i" />

      {/* PI 控制器 */}
      <PIBlock x={POS_PI.x} y={POS_PI.y} w={POS_PI.w} h={POS_PI.h} color={C_POS} title="PI 位置" kp={positionKp} ki={positionKi} />
      <PIBlock x={SPD_PI.x} y={SPD_PI.y} w={SPD_PI.w} h={SPD_PI.h} color={C_SPD} title="PI 速度" kp={speedKp} ki={speedKi} />
      <PIBlock x={CUR_PI.x} y={CUR_PI.y} w={CUR_PI.w} h={CUR_PI.h} color={C_CUR} title="PI 电流" kp={currentKp} ki={currentKi} />

      {/* 被控对象（逆变器 + 电机） */}
      <g>
        <rect x={PLANT.x} y={PLANT.y} width={PLANT.w} height={PLANT.h} rx={6} fill="#11203b" stroke={C_LINE} />
        <text x={PLANT.x + PLANT.w / 2} y={PLANT.y + 14} textAnchor="middle" fill={C_INK} fontSize={11} fontFamily="Bahnschrift, sans-serif">逆变器+电机</text>
        <text x={PLANT.x + PLANT.w / 2} y={PLANT.y + 26} textAnchor="middle" fill={C_INK_SUB} fontSize={9}>plant</text>
      </g>

      {/* 输出箭头 */}
      <line x1={PLANT.x + PLANT.w} y1={PLANT.y + PLANT.h / 2} x2={OUTPUT_X} y2={PLANT.y + PLANT.h / 2} stroke={C_INK_SUB} strokeWidth={1.4} markerEnd="url(#cascade-arrow)" />
      <text x={OUTPUT_X + 6} y={PLANT.y + PLANT.h / 2 + 4} fill={C_INK} fontSize={11} fontFamily="Bahnschrift, sans-serif">θ / ω / i</text>

      {/* 信号脉冲点（沿 path 移动）—— 用 RAF + getPointAtLength 模拟 animateMotion */}
      <Pulse pathId="cascade-pos-path" phase={phase.pos} color={C_POS} radius={5} />
      <Pulse pathId="cascade-spd-path" phase={phase.spd} color={C_SPD} radius={4.5} />
      <Pulse pathId="cascade-cur-path" phase={phase.cur} color={C_CUR} radius={4} />

      {/* 箭头标记 */}
      <defs>
        <marker id="cascade-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={C_INK_SUB} />
        </marker>
      </defs>

      {/* 图例 */}
      <g transform={`translate(${VB_W - 168}, ${VB_H - 36})`}>
        <rect x={0} y={0} width={160} height={28} rx={6} fill="#0d1929" stroke={C_LINE} />
        <LegendDot x={10} cy={14} color={C_POS} text="位置(慢)" />
        <LegendDot x={62} cy={14} color={C_SPD} text="速度" />
        <LegendDot x={108} cy={14} color={C_CUR} text="电流(快)" />
      </g>
    </svg>
  );
}

/** 嵌套外框：圆角矩形 + 左上角标题 */
function NestedFrame({ box, color, label, sub }: { box: { x: number; y: number; w: number; h: number; r: number }; color: string; label: string; sub: string }) {
  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={box.r}
        fill="transparent"
        stroke={color}
        strokeOpacity={0.45}
        strokeWidth={1.2}
        strokeDasharray="6 4"
      />
      <rect x={box.x + 10} y={box.y - 10} width={94} height={20} rx={5} fill="#0d1929" stroke={color} strokeOpacity={0.5} />
      <text x={box.x + 16} y={box.y + 4} fill={color} fontSize={11} fontFamily="Bahnschrift, sans-serif">{label}</text>
      <text x={box.x + 56} y={box.y + 4} fill={C_INK_MUTED} fontSize={10}>{sub}</text>
    </g>
  );
}

/** 求和节点：圆形 + 内部 + / - 标记 + 误差强度色块 */
function SumNode({ cx, cy, r, color, intensity, label }: { cx: number; cy: number; r: number; color: string; intensity: number; label: string }) {
  return (
    <g>
      {/* 误差强度光晕：误差越大透明度越高 */}
      <circle cx={cx} cy={cy} r={r + 4} fill={color} fillOpacity={0.08 + intensity * 0.32} />
      <circle cx={cx} cy={cy} r={r} fill="#0d1929" stroke={color} strokeWidth={1.4} />
      <text x={cx - r * 0.45} y={cy - r * 0.15} fill={color} fontSize={10} textAnchor="middle" fontFamily="Bahnschrift, sans-serif">+</text>
      <text x={cx + r * 0.45} y={cy + r * 0.55} fill={color} fontSize={10} textAnchor="middle" fontFamily="Bahnschrift, sans-serif">−</text>
      <text x={cx} y={cy + r + 11} fill={C_INK_SUB} fontSize={9} textAnchor="middle">{label}</text>
    </g>
  );
}

/** PI 控制块 */
function PIBlock({ x, y, w, h, color, title, kp, ki }: { x: number; y: number; w: number; h: number; color: string; title: string; kp: number; ki: number }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={6} fill="#11203b" stroke={color} strokeWidth={1.3} />
      <text x={x + w / 2} y={y + 12} textAnchor="middle" fill={C_INK} fontSize={10} fontFamily="Bahnschrift, sans-serif">{title}</text>
      <text x={x + w / 2} y={y + 24} textAnchor="middle" fill={color} fontSize={9}>
        Kp={fmt(kp)} Ki={fmt(ki)}
      </text>
    </g>
  );
}

function LegendDot({ x, cy, color, text }: { x: number; cy: number; color: string; text: string }) {
  return (
    <g>
      <circle cx={x + 5} cy={cy} r={3.5} fill={color} />
      <text x={x + 12} y={cy + 3} fill={C_INK_SUB} fontSize={10}>{text}</text>
    </g>
  );
}

/**
 * 沿 path 移动的脉冲点：
 *
 * 用 SVG 原生 SMIL `<animateMotion>` 实现可被 paused 控制的动画虽然简洁，但不同浏览器
 * 对 animationsPaused 的支持差异较大；项目目标是 Electron + 现代 Chromium，
 * 我们改用 RAF 推进 phase（0..1），再通过 `getPointAtLength` 取得当前点坐标。
 * 优点：暂停 = state 不更新，确定性高；不依赖 framer-motion；体积零开销。
 */
function Pulse({ pathId, phase, color, radius }: { pathId: string; phase: number; color: string; radius: number }) {
  const [pt, setPt] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = document.getElementById(pathId) as SVGPathElement | null;
    if (!el || typeof el.getTotalLength !== 'function') return;
    const len = el.getTotalLength();
    if (!Number.isFinite(len) || len <= 0) return;
    const p = el.getPointAtLength(phase * len);
    setPt({ x: p.x, y: p.y });
  }, [pathId, phase]);

  if (!pt) return null;
  return (
    <g>
      {/* 拖尾光晕 */}
      <circle cx={pt.x} cy={pt.y} r={radius + 3} fill={color} fillOpacity={0.18} />
      <circle cx={pt.x} cy={pt.y} r={radius} fill={color} />
    </g>
  );
}

/**
 * 构造一条闭合环路：
 * sum 节点 →（向 PI 中心）→ PI →（向右下角）→ 反馈回 sum
 *
 * 形式：sum → 折线到 PI 中心 → 折线到右下锚点 → 沿外框反馈回 sum
 */
function describeLoopPath(sumX: number, sumY: number, piX: number, piY: number, anchorX: number, anchorY: number): string {
  // 路径：sum 出 → 水平到 PI 正下方 x → 垂直到 PI 中心 y → 水平到 PI →
  //   再水平到 anchorX → 垂直到 anchorY → 水平回 sumX-? → 垂直回 sumY
  const segs: string[] = [];
  segs.push(`M ${sumX} ${sumY}`);
  // 1. 出 sum，水平到 PI 起点 x
  segs.push(`L ${piX} ${sumY}`);
  // 2. 垂直到 PI 中心 y
  segs.push(`L ${piX} ${piY}`);
  // 3. 水平到 anchorX（出 PI 后向右一路）
  segs.push(`L ${anchorX} ${piY}`);
  // 4. 垂直到 anchorY（外框右下角）
  segs.push(`L ${anchorX} ${anchorY}`);
  // 5. 反馈：水平回到 sum 正下方
  segs.push(`L ${sumX} ${anchorY}`);
  // 6. 垂直回 sum
  segs.push(`L ${sumX} ${sumY}`);
  return segs.join(' ');
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '–';
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
}
