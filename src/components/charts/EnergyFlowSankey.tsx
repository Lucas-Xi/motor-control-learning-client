/**
 * 能量流 Sankey 图（电网 → 制冷量）。
 *
 * 设计目标：用流量带（stroke-width 与功率成比例）直观展示
 * 整个变频压缩机系统在哪一环节损失最大。
 *
 *   电网  ──→  PFC 输出  ──→  FOC 输出 (机械)  ──→  压缩机气动功  ──→  制冷量
 *              ↘ PFC 损耗      ↘ FOC 损耗            ↘ 压缩机损耗
 *
 * 流量带颜色：
 *   - 主流（有效功传递）  : mint  #43f7b5（半透明）
 *   - 损耗流（去顶部损耗）: rose  #ff5c7a（半透明）
 *   - 输出制冷量          : cyan  #34d6ff（半透明）
 *
 * 纯 SVG，viewBox 0 0 720 380，外层用 padding-top 比例 hack 自适应宽度。
 */
import { useI18n } from '../../i18n/useI18n';

interface FlowNode {
  id: string;
  label: string;
  side: 'left' | 'middle' | 'right';
  level: number; // 0..3
  yPosition: number; // 0..1 高度比例
}

interface FlowLink {
  from: string;
  to: string;
  power: number; // kW
  category: 'useful' | 'loss';
}

interface Props {
  /** 输入: 电网取功 (kW) */
  gridPowerKw: number;
  /** PFC 效率 0..1 */
  pfcEfficiency: number;
  /** FOC 效率 0..1 */
  focEfficiency: number;
  /** 压缩机机械-气动等熵效率 */
  isentropicEff: number;
  /** 容积效率（决定有效流量比例） */
  volumetricEff: number;
  /** 输出: 制冷量 (kW) */
  coolingKw: number;
  /** COP（用于交叉验证） */
  cop: number;
}

const VB_W = 720;
const VB_H = 380;

// 节点矩形尺寸
const NODE_W = 80;
const NODE_H = 40;

// 主链条 5 个节点的 X 中心：均匀分布在 [60, 660]
const MAIN_X: Record<string, number> = {
  grid: 60,
  pfcOut: 210,
  mech: 360,
  compressorWork: 510,
  cooling: 660,
};

// 主链条 Y（中部偏下，给顶部损耗节点留空间）
const MAIN_Y = 240;

// 顶部损耗节点的 Y
const LOSS_Y = 60;
// 顶部损耗节点的 X 中心：放在两两主节点中间
const LOSS_X: Record<string, number> = {
  pfcLoss: (MAIN_X.grid + MAIN_X.pfcOut) / 2,
  focLoss: (MAIN_X.pfcOut + MAIN_X.mech) / 2,
  compLoss: (MAIN_X.mech + MAIN_X.compressorWork) / 2,
};

/** 计算流量带宽度：power(kW) 越大越粗，最小 4px，最大约 36px */
function strokeForPower(powerKw: number, gridKw: number): number {
  if (gridKw <= 1e-6) return 2;
  const ratio = Math.max(0, Math.min(1, powerKw / gridKw));
  return 4 + ratio * 32;
}

/**
 * 生成贝塞尔曲线 path d。
 *
 *  起点 (x1,y1) 在源节点右/下边缘，终点 (x2,y2) 在目标节点左/上边缘。
 *  控制点用水平方向 60% 的距离做弯曲（cubic bezier C），让流量带平滑地"流动"。
 *
 *  对于水平流（主链条）：
 *      d = `M x1 y1 C x1+dx*0.5 y1, x2-dx*0.5 y2, x2 y2`
 *  对于斜向流（去顶部损耗节点）：
 *      用 (x1,y1)→((x1+x2)/2,y1)→((x1+x2)/2,y2)→(x2,y2) 形式平滑过渡
 */
function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1;
  const c1x = x1 + dx * 0.5;
  const c1y = y1;
  const c2x = x2 - dx * 0.5;
  const c2y = y2;
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

interface NodePos {
  cx: number;
  cy: number;
}

function nodeAt(id: string): NodePos {
  if (id in MAIN_X) return { cx: MAIN_X[id], cy: MAIN_Y };
  if (id in LOSS_X) return { cx: LOSS_X[id], cy: LOSS_Y };
  return { cx: 0, cy: 0 };
}

export function EnergyFlowSankey({
  gridPowerKw,
  pfcEfficiency,
  focEfficiency,
  isentropicEff,
  volumetricEff,
  coolingKw,
  cop,
}: Props) {
  const { t } = useI18n();
  // 各级功率
  const pfcOutKw = gridPowerKw * pfcEfficiency;
  const mechPowerKw = pfcOutKw * focEfficiency;
  const compressorWorkKw = mechPowerKw * volumetricEff;
  void isentropicEff; // 保留用于注释/未来扩展

  // 损耗
  const pfcLossKw = Math.max(0, gridPowerKw - pfcOutKw);
  const focLossKw = Math.max(0, pfcOutKw - mechPowerKw);
  // 压缩机损耗：考虑容积效率与等熵效率两部分（教学简化合并显示）
  // 显示出来的"压缩机气动功"已经把容积效率扣过；剩下的差值就是压缩机损耗。
  // 制冷量 vs 压缩机气动功：差值是热泵循环本身的能量等价（实际是从蒸发器吸热而来），
  // 但对学员而言关心的是"在压缩机环节又损失多少"，所以把 isentropicEff 也作为可视化提示。
  const compLossKw = Math.max(0, mechPowerKw - compressorWorkKw);

  // COP 一致性校验：理论 cop_check ≈ coolingKw / gridPowerKw
  const copCheck = gridPowerKw > 1e-6 ? coolingKw / gridPowerKw : 0;
  const copMismatch =
    cop > 1e-3 && Math.abs(copCheck - cop) / Math.max(0.5, cop) > 0.05;

  // 总效率（粗略：制冷量与电网功率比，即 COP，但额外乘以等熵效率以示意"机械→气动"折算）
  const overallEff = gridPowerKw > 1e-6 ? coolingKw / gridPowerKw : 0;

  // 节点定义（用于渲染）
  const nodes: Array<FlowNode & { power: number; sub?: string }> = [
    { id: 'grid', label: t('charts.enGrid'), side: 'left', level: 0, yPosition: 0.6, power: gridPowerKw },
    { id: 'pfcOut', label: t('charts.enPfcOut'), side: 'middle', level: 1, yPosition: 0.6, power: pfcOutKw },
    { id: 'mech', label: t('charts.enFocMech'), side: 'middle', level: 2, yPosition: 0.6, power: mechPowerKw },
    {
      id: 'compressorWork',
      label: t('charts.enAeroWork'),
      side: 'middle',
      level: 3,
      yPosition: 0.6,
      power: compressorWorkKw,
    },
    { id: 'cooling', label: t('charts.enCooling'), side: 'right', level: 4, yPosition: 0.6, power: coolingKw },
    { id: 'pfcLoss', label: t('charts.enPfcLoss'), side: 'middle', level: 1, yPosition: 0.15, power: pfcLossKw },
    { id: 'focLoss', label: t('charts.enFocLoss'), side: 'middle', level: 2, yPosition: 0.15, power: focLossKw },
    { id: 'compLoss', label: t('charts.enCompLoss'), side: 'middle', level: 3, yPosition: 0.15, power: compLossKw },
  ];

  // 流量带
  const links: FlowLink[] = [
    { from: 'grid', to: 'pfcOut', power: pfcOutKw, category: 'useful' },
    { from: 'grid', to: 'pfcLoss', power: pfcLossKw, category: 'loss' },
    { from: 'pfcOut', to: 'mech', power: mechPowerKw, category: 'useful' },
    { from: 'pfcOut', to: 'focLoss', power: focLossKw, category: 'loss' },
    { from: 'mech', to: 'compressorWork', power: compressorWorkKw, category: 'useful' },
    { from: 'mech', to: 'compLoss', power: compLossKw, category: 'loss' },
    { from: 'compressorWork', to: 'cooling', power: coolingKw, category: 'useful' },
  ];

  const pct = (kw: number) => (gridPowerKw > 1e-6 ? (kw / gridPowerKw) * 100 : 0);

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={t('charts.enAria')}
    >
      {/* 背景轻栅格 */}
      <rect x={0} y={0} width={VB_W} height={VB_H} fill="transparent" />

      {/* 链路（先画，让节点盖住端点） */}
      <g>
        {links.map((link, i) => {
          const a = nodeAt(link.from);
          const b = nodeAt(link.to);
          // 起点：源节点右边缘中点；终点：目标节点左边缘中点
          // 对去往顶部损耗的链路：起点改成源节点上边缘中点，终点改成损耗节点下边缘中点
          let x1: number;
          let y1: number;
          let x2: number;
          let y2: number;
          if (link.category === 'loss') {
            x1 = a.cx;
            y1 = a.cy - NODE_H / 2;
            x2 = b.cx;
            y2 = b.cy + NODE_H / 2;
            // 弯曲：让水平方向先"上扬"再到顶部
            const c1x = x1;
            const c1y = (y1 + y2) / 2;
            const c2x = x2;
            const c2y = (y1 + y2) / 2;
            const d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
            const w = strokeForPower(link.power, gridPowerKw);
            return (
              <path
                key={i}
                d={d}
                fill="none"
                stroke="#ff5c7a"
                strokeOpacity={0.45}
                strokeWidth={w}
                strokeLinecap="round"
              />
            );
          }
          x1 = a.cx + NODE_W / 2;
          y1 = a.cy;
          x2 = b.cx - NODE_W / 2;
          y2 = b.cy;
          const d = bezierPath(x1, y1, x2, y2);
          const w = strokeForPower(link.power, gridPowerKw);
          // 最后一段是制冷量输出 → cyan
          const isOutput = link.to === 'cooling';
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={isOutput ? '#34d6ff' : '#43f7b5'}
              strokeOpacity={0.5}
              strokeWidth={w}
              strokeLinecap="round"
            />
          );
        })}
      </g>

      {/* 节点矩形 + 标签 */}
      <g>
        {nodes.map((n) => {
          const { cx, cy } = nodeAt(n.id);
          const isLoss = n.id.endsWith('Loss');
          const isOutput = n.id === 'cooling';
          const stroke = isLoss ? '#ff5c7a' : isOutput ? '#34d6ff' : '#43f7b5';
          const fill = isLoss
            ? 'rgba(255,92,122,0.10)'
            : isOutput
              ? 'rgba(52,214,255,0.10)'
              : 'rgba(67,247,181,0.10)';
          return (
            <g key={n.id}>
              <rect
                x={cx - NODE_W / 2}
                y={cy - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={6}
                ry={6}
                fill={fill}
                stroke={stroke}
                strokeWidth={1.2}
                strokeOpacity={0.9}
              />
              <text
                x={cx}
                y={cy - 2}
                textAnchor="middle"
                fill="#e6edf3"
                fontSize={11}
                fontWeight={500}
              >
                {n.label}
              </text>
              <text
                x={cx}
                y={cy + 12}
                textAnchor="middle"
                fill="#9aa7b4"
                fontSize={10}
              >
                {n.power.toFixed(2)} kW
              </text>
              {/* 占电网功率百分比标在节点上方（损耗节点放在下方避免越界） */}
              <text
                x={cx}
                y={isLoss ? cy + NODE_H / 2 + 12 : cy - NODE_H / 2 - 6}
                textAnchor="middle"
                fill={stroke}
                fontSize={10}
                opacity={0.85}
              >
                {pct(n.power).toFixed(1)}%
              </text>
            </g>
          );
        })}
      </g>

      {/* 流向箭头说明（左下角图例） */}
      <g transform={`translate(12, ${VB_H - 60})`}>
        <rect x={0} y={0} width={186} height={50} rx={6} ry={6} fill="rgba(13,17,23,0.55)" stroke="#2a323c" />
        <circle cx={12} cy={14} r={4} fill="#43f7b5" />
        <text x={22} y={18} fill="#e6edf3" fontSize={10}>{t('charts.enLegendUseful')}</text>
        <circle cx={12} cy={30} r={4} fill="#ff5c7a" />
        <text x={22} y={34} fill="#e6edf3" fontSize={10}>{t('charts.enLegendLoss')}</text>
        <circle cx={108} cy={14} r={4} fill="#34d6ff" />
        <text x={118} y={18} fill="#e6edf3" fontSize={10}>{t('charts.enLegendCooling')}</text>
        <text x={108} y={34} fill="#9aa7b4" fontSize={9}>{t('charts.enLegendWidth')}</text>
      </g>

      {/* COP 一致性提示 */}
      {copMismatch && (
        <g transform={`translate(${VB_W - 220}, ${VB_H - 30})`}>
          <rect x={0} y={-14} width={210} height={22} rx={4} ry={4} fill="rgba(255,178,36,0.12)" stroke="#ffb224" />
          <text x={105} y={2} textAnchor="middle" fill="#ffb224" fontSize={10}>
            {t('charts.enCopMismatchPrefix')}{copCheck.toFixed(2)} vs {cop.toFixed(2)}{t('charts.enCopMismatchSuffix')}
          </text>
        </g>
      )}

      {/* 总效率 / 顶部摘要 */}
      <g transform="translate(360, 24)">
        <text textAnchor="middle" fill="#9aa7b4" fontSize={11}>
          {t('charts.enOverallPrefix')}
          <tspan fill="#34d6ff" fontWeight={600}>
            {' '}
            {overallEff.toFixed(2)}
          </tspan>
        </text>
      </g>
    </svg>
  );
}
