import { formatNumber } from '../../utils/format';
import { useSimulationStore } from '../../store/simulationStore';

interface Props {
  polePairs: number;
  mechanicalDeg: number;
  rpm: number;
  size?: number;
}

const SLOTS = 12;          // 教学用 12 槽固定（典型 12 槽 8 极 PMSM 配置）
const PHASE_COLOR = ['#34d6ff', '#43f7b5', '#ffb84d'] as const;
const PHASE_NAME = ['A', 'B', 'C'] as const;

/**
 * 电机径向剖面 2D 解剖图：
 *   - 外圈：定子铁芯（灰色铁皮带网格纹）
 *   - 12 个均匀分布的定子槽，每槽贴一组绕组截面（圆点 = ⊙ 流出 / ⊗ 流入）
 *   - 三相按 AABBCC AABBCC 双层分布（每相 4 个截面，构成 4 极 12 槽）
 *   - 气隙：一道窄黑环
 *   - 转子：内圆，带 polePairs × 2 块交替的 N（红）/S（蓝）永磁极
 *   - 机械角度 θm：转子整体旋转标志（一根从原点指向定子第一槽的指针，作为机械参考）
 *   - 标注线指向"定子铁芯""定子绕组""气隙""转子""永磁极"
 *
 * 这个图是 STATIC 几何描述，不依赖时间——polePairs 和 mechanicalDeg 改变能立即看到"槽数没变、磁极数变了""转子转过去了"。
 */
export function MotorAnatomy2D({ polePairs, mechanicalDeg, rpm, size = 460 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const statorOuterR = size * 0.45;
  const statorInnerR = size * 0.36;
  const airGapR = size * 0.345;
  const rotorOuterR = size * 0.30;
  const rotorInnerR = size * 0.07;

  // 跟仿真时钟挂钩：mechanicalDeg 是滑块设置的"基准朝向"，运行时再叠加 rpm × time 的实际旋转。
  // 暂停时 time 不前进，rotor 停在当前角度；单步把 time 推进 5ms，rotor 也对应前进。
  const time = useSimulationStore((s) => s.time);
  const liveAngleDeg = mechanicalDeg + (rpm / 60) * 360 * time;
  const rotorRadDeg = ((liveAngleDeg % 360) + 360) % 360;

  // 槽位置：12 槽，每槽对应一组绕组的横截面
  // 三相分布 schema (AABBCC AABBCC)：A 在槽 0,1,6,7；B 在 2,3,8,9；C 在 4,5,10,11
  // 同一相相邻两槽的"电流方向"互为相反（一进一出），形成一条匝
  const slotAssign = ['A', 'A', 'B', 'B', 'C', 'C', 'A', 'A', 'B', 'B', 'C', 'C'] as const;
  const slotDir = [+1, -1, +1, -1, +1, -1, +1, -1, +1, -1, +1, -1] as const; // ⊙ + / ⊗ -

  const slotR = (statorOuterR + statorInnerR) / 2;
  const coilDotR = size * 0.022;

  // 转子永磁极：交替 N/S，共 polePairs*2 块，沿 mechanicalDeg 旋转
  const polePairsClamped = Math.max(1, Math.min(8, Math.round(polePairs)));
  const numPoles = polePairsClamped * 2;
  const poleArcDeg = 360 / numPoles;

  return (
    <div className="rounded-2xl border border-line-subtle bg-bg-base p-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-[460px] max-w-full">
        <defs>
          <pattern id="ironHatch" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#1e2a3d" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#2c3d57" strokeWidth="1" />
          </pattern>
          <radialGradient id="rotorBg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#11203b" />
            <stop offset="80%" stopColor="#0d1929" />
            <stop offset="100%" stopColor="#1e2a3d" />
          </radialGradient>
        </defs>

        {/* 1. 定子铁芯（外环带斜线纹理） */}
        <circle cx={cx} cy={cy} r={statorOuterR} fill="url(#ironHatch)" stroke="#2c3d57" strokeWidth="1.5" />
        <circle cx={cx} cy={cy} r={statorInnerR} fill="#0d1929" stroke="#1e2a3d" strokeWidth="1" />

        {/* 2. 12 个定子槽（沿 statorInnerR 内圆切出来的小凹口） */}
        {Array.from({ length: SLOTS }).map((_, i) => {
          const angle = (i / SLOTS) * Math.PI * 2 - Math.PI / 2; // 12 点钟方向开始
          const slotInner = statorInnerR + 2;
          const slotOuter = statorInnerR + size * 0.04;
          const halfWidth = (Math.PI / SLOTS) * 0.28; // 槽宽度
          const x1 = cx + Math.cos(angle - halfWidth) * slotInner;
          const y1 = cy + Math.sin(angle - halfWidth) * slotInner;
          const x2 = cx + Math.cos(angle + halfWidth) * slotInner;
          const y2 = cy + Math.sin(angle + halfWidth) * slotInner;
          const x3 = cx + Math.cos(angle + halfWidth) * slotOuter;
          const y3 = cy + Math.sin(angle + halfWidth) * slotOuter;
          const x4 = cx + Math.cos(angle - halfWidth) * slotOuter;
          const y4 = cy + Math.sin(angle - halfWidth) * slotOuter;
          return (
            <polygon key={`slot-${i}`} points={`${x1},${y1} ${x2},${y2} ${x3},${y3} ${x4},${y4}`}
              fill="#0d1929" stroke="#2c3d57" strokeWidth="0.8" />
          );
        })}

        {/* 3. 绕组截面：每槽内画一个 A/B/C 圆点 */}
        {slotAssign.map((phase, i) => {
          const angle = (i / SLOTS) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * slotR;
          const y = cy + Math.sin(angle) * slotR;
          const phaseIdx = phase === 'A' ? 0 : phase === 'B' ? 1 : 2;
          const color = PHASE_COLOR[phaseIdx];
          const isOut = slotDir[i] > 0;
          return (
            <g key={`coil-${i}`}>
              <circle cx={x} cy={y} r={coilDotR} fill={color} fillOpacity="0.25" stroke={color} strokeWidth="1.5" />
              {isOut ? (
                <circle cx={x} cy={y} r={coilDotR * 0.32} fill={color} />
              ) : (
                <g stroke={color} strokeWidth="1.5">
                  <line x1={x - coilDotR * 0.5} y1={y - coilDotR * 0.5} x2={x + coilDotR * 0.5} y2={y + coilDotR * 0.5} />
                  <line x1={x - coilDotR * 0.5} y1={y + coilDotR * 0.5} x2={x + coilDotR * 0.5} y2={y - coilDotR * 0.5} />
                </g>
              )}
              {/* 槽内相名小标 */}
              <text x={x} y={y - coilDotR - 4} textAnchor="middle" fill={color}
                fontSize="9" fontWeight="700" opacity="0.85">{phase}</text>
            </g>
          );
        })}

        {/* 4. 气隙（细线带渐隐） */}
        <circle cx={cx} cy={cy} r={airGapR} fill="none" stroke="#5d7793" strokeWidth="0.8" strokeDasharray="2 3" opacity="0.6" />

        {/* 5. 转子（整体跟随 mechanicalDeg 旋转） */}
        <g transform={`rotate(${rotorRadDeg} ${cx} ${cy})`}>
          {/* 转子外缘 */}
          <circle cx={cx} cy={cy} r={rotorOuterR} fill="url(#rotorBg)" stroke="#5d7793" strokeWidth="1.5" />
          {/* 转子轴 */}
          <circle cx={cx} cy={cy} r={rotorInnerR} fill="#11203b" stroke="#5d7793" strokeWidth="1.5" />
          {/* 永磁极扇区（polePairs*2 块交替 N/S） */}
          {Array.from({ length: numPoles }).map((_, i) => {
            const startDeg = i * poleArcDeg - 90;     // -90 让第一个磁极在 12 点钟
            const endDeg = startDeg + poleArcDeg;
            const isN = i % 2 === 0;
            const sR = (Math.PI / 180) * startDeg;
            const eR = (Math.PI / 180) * endDeg;
            const innerR = rotorInnerR + size * 0.012;
            const outerR = rotorOuterR - size * 0.008;
            const x1 = cx + Math.cos(sR) * innerR;
            const y1 = cy + Math.sin(sR) * innerR;
            const x2 = cx + Math.cos(sR) * outerR;
            const y2 = cy + Math.sin(sR) * outerR;
            const x3 = cx + Math.cos(eR) * outerR;
            const y3 = cy + Math.sin(eR) * outerR;
            const x4 = cx + Math.cos(eR) * innerR;
            const y4 = cy + Math.sin(eR) * innerR;
            const largeArc = poleArcDeg > 180 ? 1 : 0;
            const path = `M ${x1} ${y1} L ${x2} ${y2} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x1} ${y1} Z`;
            const labelDeg = startDeg + poleArcDeg / 2;
            const labelR = (innerR + outerR) / 2;
            const lx = cx + Math.cos((Math.PI / 180) * labelDeg) * labelR;
            const ly = cy + Math.sin((Math.PI / 180) * labelDeg) * labelR;
            return (
              <g key={`mag-${i}`}>
                <path d={path} fill={isN ? '#ff5c7a' : '#34d6ff'} fillOpacity="0.85"
                  stroke={isN ? '#fff' : '#fff'} strokeWidth="0.4" strokeOpacity="0.3" />
                <text x={lx} y={ly + 4} textAnchor="middle" fill="#fff"
                  fontSize={Math.max(10, 14 - polePairsClamped)} fontWeight="800">
                  {isN ? 'N' : 'S'}
                </text>
              </g>
            );
          })}
          {/* 转子机械参考线（表示当前 θm 朝向） */}
          <line x1={cx} y1={cy} x2={cx} y2={cy - rotorOuterR + 4}
            stroke="#e7f3ff" strokeWidth="1.5" />
        </g>

        {/* 6. 标注引出线（leader lines） */}
        <Annotation
          fromX={cx + statorOuterR * 0.92} fromY={cy - statorOuterR * 0.4}
          toX={cx + statorOuterR + 14} toY={size * 0.22}
          label="定子铁芯" sub="iron stator yoke" color="#9eb5cb"
        />
        <Annotation
          fromX={cx + slotR * 0.95} fromY={cy + slotR * 0.05}
          toX={cx + statorOuterR + 14} toY={size * 0.42}
          label="定子绕组" sub="3-phase windings A/B/C" color="#43f7b5"
        />
        <Annotation
          fromX={cx + airGapR} fromY={cy + 2}
          toX={cx + statorOuterR + 14} toY={size * 0.55}
          label="气隙" sub="air gap" color="#5d7793"
        />
        <Annotation
          fromX={cx - rotorOuterR * 0.7} fromY={cy + rotorOuterR * 0.2}
          toX={size * 0.06} toY={size * 0.42}
          label="转子" sub="rotor" color="#9eb5cb"
        />
        <Annotation
          fromX={cx - rotorOuterR * 0.4} fromY={cy - rotorOuterR * 0.55}
          toX={size * 0.06} toY={size * 0.18}
          label="永磁极 N/S" sub={`${polePairsClamped} 对，共 ${numPoles} 块`}
          color="#ff5c7a"
        />

        {/* 7. 底部状态条 */}
        <text x={size / 2} y={size - 14} textAnchor="middle" fill="#9eb5cb" fontSize="11"
          fontFamily="Cascadia Code, Consolas, monospace">
          {polePairsClamped} 极对 · {numPoles} 极 · θm = {formatNumber(rotorRadDeg, 1)}° · {formatNumber(rpm, 0)} rpm · 12 槽
        </text>
        <text x={14} y={size - 14} fill="#5d7793" fontSize="10">⊙ 流出纸面 ⊗ 流入纸面</text>
      </svg>
    </div>
  );
}

function Annotation({
  fromX, fromY, toX, toY, label, sub, color,
}: {
  fromX: number; fromY: number; toX: number; toY: number;
  label: string; sub: string; color: string;
}) {
  const textAnchor = toX > fromX ? 'start' : 'end';
  const tx = textAnchor === 'start' ? toX + 4 : toX - 4;
  return (
    <g>
      <line x1={fromX} y1={fromY} x2={toX} y2={toY}
        stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
      <circle cx={fromX} cy={fromY} r="2.5" fill={color} />
      <text x={tx} y={toY - 2} textAnchor={textAnchor}
        fill={color} fontSize="11" fontWeight="600">
        {label}
      </text>
      <text x={tx} y={toY + 11} textAnchor={textAnchor}
        fill="#5d7793" fontSize="10">
        {sub}
      </text>
    </g>
  );
}
