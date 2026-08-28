import type { StartupState } from '../../simulation/engine/types';
import { useI18n, type TKey } from '../../i18n/useI18n';

/**
 * 压缩机启动状态机有向图。
 *
 * 主路径：idle → precharge → align → open-loop → hfi → bemf → fieldweak
 *
 * 反向降级（虚线弧形）：
 *   - bemf → hfi   （BEMF 信号丢失 / 低速）
 *   - hfi → open-loop  （HFI 解角失败 / 凸极不足）
 *   - fieldweak → bemf （转速回落到弱磁阈值以下）
 *
 * 每条转移箭头中点附"条件标签"。条件即将触发时（比例阈值 > 0.85）：
 *   - 箭头加粗 + 颜色变 mint
 *   - 标签变 mint
 */

interface Transition {
  from: StartupState;
  to: StartupState;
  label: string;          // 转移条件，如 "rpm > 100"
  kind: 'forward' | 'fallback';
}

interface Props {
  currentState: StartupState;
  visitedStates?: StartupState[];
  /** 当前状态变量值（决定哪些转移即将触发） */
  currentRpm: number;
  hfiHandoffRpm: number;
  bemfHandoffRpm: number;
  fieldweakRpm: number;
}

// === 节点布局：viewBox 720×360，7 个状态从左到右等距 ===
const NODE_W = 80;
const NODE_H = 44;
const VB_W = 720;
const VB_H = 360;
const ROW_Y = 130;        // 主行节点中心 y

const ORDER: StartupState[] = ['idle', 'precharge', 'align', 'open-loop', 'hfi', 'bemf', 'fieldweak', 'fault'];

/** 节点中心点坐标 */
function nodeCenter(state: StartupState): { x: number; y: number } {
  const idx = ORDER.indexOf(state);
  // 左右各留 36px 边距，节点在中心
  const margin = 36;
  const usable = VB_W - margin * 2;
  const x = margin + (usable / (ORDER.length - 1)) * idx;
  return { x, y: ROW_Y };
}

/** 主路径转移条件（每相邻一对一条），label 中的占位符在 render 时替换 */
function buildTransitions(p: Props, t: (key: TKey) => string): Transition[] {
  return [
    { from: 'idle',       to: 'precharge', label: t('charts.suTrEnable'),                   kind: 'forward' },
    { from: 'precharge',  to: 'align',     label: t('charts.suTrVbusStable'),               kind: 'forward' },
    { from: 'align',      to: 'open-loop', label: t('charts.suTrAlignDone'),                kind: 'forward' },
    { from: 'open-loop',  to: 'hfi',       label: `rpm > ${Math.round(p.hfiHandoffRpm)}`,    kind: 'forward' },
    { from: 'hfi',        to: 'bemf',      label: `rpm > ${Math.round(p.bemfHandoffRpm)}`,   kind: 'forward' },
    { from: 'bemf',       to: 'fieldweak', label: `rpm > ${Math.round(p.fieldweakRpm)}`,     kind: 'forward' },
    // 反向降级
    { from: 'bemf',       to: 'hfi',       label: t('charts.suTrBemfWeak'),  kind: 'fallback' },
    { from: 'hfi',        to: 'open-loop', label: t('charts.suTrHfiFail'),   kind: 'fallback' },
    { from: 'fieldweak',  to: 'bemf',      label: t('charts.suTrRpmDrop'),   kind: 'fallback' },
  ];
}

/** 0..1：当前转移条件「逼近度」，>0.85 视为即将触发 */
function transitionImminence(tr: Transition, p: Props): number {
  if (tr.kind !== 'forward') return 0;
  if (tr.from !== p.currentState) return 0;
  if (tr.from === 'open-loop') return p.currentRpm / Math.max(1, p.hfiHandoffRpm);
  if (tr.from === 'hfi')       return p.currentRpm / Math.max(1, p.bemfHandoffRpm);
  if (tr.from === 'bemf')      return p.currentRpm / Math.max(1, p.fieldweakRpm);
  return 0;
}

/** 节点视觉态：active / visited / idle */
function nodeVisual(state: StartupState, p: Props): 'active' | 'visited' | 'idle' {
  if (state === p.currentState) return 'active';
  if ((p.visitedStates ?? []).includes(state)) return 'visited';
  return 'idle';
}

const COLORS = {
  active: { fill: '#43f7b520', stroke: '#43f7b5', text: '#e7f3ff' },
  visited: { fill: '#34d6ff20', stroke: '#34d6ff', text: '#34d6ff' },
  idle: { fill: '#0d1929', stroke: '#1e2a3d', text: '#5d7793' },
} as const;

export function StartupStateGraph(props: Props) {
  const { t } = useI18n();
  const transitions = buildTransitions(props, t);

  // 节点名 / 关键动作（旁注信息块用）
  const nodeName: Record<StartupState, string> = {
    idle: t('charts.suStateIdle'),
    precharge: t('charts.suStatePrecharge'),
    align: t('charts.suStateAlign'),
    'open-loop': t('charts.suStateOpenLoop'),
    hfi: 'HFI',
    bemf: 'BEMF',
    fieldweak: t('charts.suStateFieldweak'),
    fault: t('charts.suStateFault'),
  };
  const nodeAction: Record<StartupState, string> = {
    idle: t('charts.suActionIdle'),
    precharge: t('charts.suActionPrecharge'),
    align: t('charts.suActionAlign'),
    'open-loop': t('charts.suActionOpenLoop'),
    hfi: t('charts.suActionHfi'),
    bemf: t('charts.suActionBemf'),
    fieldweak: t('charts.suActionFieldweak'),
    fault: t('charts.suActionFault'),
  };

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      xmlns="http://www.w3.org/2000/svg"
      className="h-full w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* 主路径箭头（mint） */}
        <marker id="arrow-fwd" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#43f7b5" />
        </marker>
        {/* 主路径箭头（idle 灰） */}
        <marker id="arrow-fwd-idle" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#3a4d63" />
        </marker>
        {/* 回退箭头（amber） */}
        <marker id="arrow-back" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#ffb84d" />
        </marker>
      </defs>

      {/* === 1. 转移箭头（先画，让节点压在上面） === */}
      {transitions.map((tr, i) => {
        const a = nodeCenter(tr.from);
        const b = nodeCenter(tr.to);
        const imminence = transitionImminence(tr, props);
        const isImminent = imminence > 0.85;
        const fwdActive = tr.kind === 'forward' && tr.from === props.currentState;

        if (tr.kind === 'forward') {
          // 主路径：水平直线，从节点右沿 → 下个节点左沿
          const x1 = a.x + NODE_W / 2;
          const x2 = b.x - NODE_W / 2;
          const y = a.y;
          const stroke = fwdActive ? '#43f7b5' : '#3a4d63';
          const strokeW = isImminent ? 3 : fwdActive ? 2.2 : 2;
          const marker = fwdActive ? 'arrow-fwd' : 'arrow-fwd-idle';
          const labelColor = isImminent ? '#43f7b5' : '#9eb5cb';
          const labelMidX = (x1 + x2) / 2;
          const labelMidY = y - 8;
          return (
            <g key={`tr-${i}`}>
              <line
                x1={x1} y1={y} x2={x2} y2={y}
                stroke={stroke}
                strokeWidth={strokeW}
                markerEnd={`url(#${marker})`}
              />
              <text
                x={labelMidX} y={labelMidY}
                textAnchor="middle"
                fontSize={10}
                fill={labelColor}
                fontWeight={isImminent ? 600 : 400}
              >
                {tr.label}
              </text>
            </g>
          );
        } else {
          // 回退：节点下方弧形（贝塞尔），方向 from → to
          const x1 = a.x;
          const x2 = b.x;
          const y0 = a.y + NODE_H / 2;     // 弧形起点 y（节点下沿）
          // 控制点决定弧形深度，距离越长弧越深
          const dist = Math.abs(x2 - x1);
          const dip = Math.min(70, 35 + dist * 0.18);
          const cy = y0 + dip;
          const cx = (x1 + x2) / 2;
          const path = `M ${x1} ${y0} Q ${cx} ${cy} ${x2} ${y0}`;
          const labelMidX = cx;
          const labelMidY = cy - 2;
          return (
            <g key={`tr-${i}`}>
              <path
                d={path}
                fill="none"
                stroke="#ffb84d"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                markerEnd="url(#arrow-back)"
              />
              <text
                x={labelMidX} y={labelMidY}
                textAnchor="middle"
                fontSize={9}
                fill="#ffb84d"
                opacity={0.9}
              >
                {tr.label}
              </text>
            </g>
          );
        }
      })}

      {/* === 2. 节点（圆角矩形 + 状态名） === */}
      {ORDER.map((s, idx) => {
        const c = nodeCenter(s);
        const visual = nodeVisual(s, props);
        const col = COLORS[visual];
        const isActive = visual === 'active';
        return (
          <g key={s}>
            <rect
              x={c.x - NODE_W / 2}
              y={c.y - NODE_H / 2}
              width={NODE_W}
              height={NODE_H}
              rx={10}
              ry={10}
              fill={col.fill}
              stroke={col.stroke}
              strokeWidth={isActive ? 2 : 1.2}
            />
            {/* 序号 */}
            <text
              x={c.x - NODE_W / 2 + 8}
              y={c.y - NODE_H / 2 + 12}
              fontSize={9}
              fill={col.text}
              opacity={0.6}
            >
              {idx}
            </text>
            {/* 状态名（中文） */}
            <text
              x={c.x}
              y={c.y + 4}
              textAnchor="middle"
              fontSize={13}
              fontWeight={isActive ? 600 : 500}
              fill={isActive ? '#ffffff' : col.text}
            >
              {nodeName[s]}
            </text>
          </g>
        );
      })}

      {/* === 3. 当前状态信息块（节点下方/上方留出位置避开回退弧）=== */}
      {(() => {
        const c = nodeCenter(props.currentState);
        const action = nodeAction[props.currentState];
        // 信息块放在主行上方，避开下方反向弧
        const boxW = 220;
        const boxH = 38;
        let bx = c.x - boxW / 2;
        // 边界保护
        bx = Math.max(8, Math.min(VB_W - boxW - 8, bx));
        const by = ROW_Y - NODE_H / 2 - boxH - 18;
        return (
          <g>
            <rect
              x={bx} y={by}
              width={boxW} height={boxH}
              rx={6} ry={6}
              fill="#0d1929"
              stroke="#43f7b5"
              strokeOpacity={0.5}
              strokeWidth={1}
            />
            <text
              x={bx + 10} y={by + 14}
              fontSize={9}
              fill="#43f7b5"
              fontWeight={600}
              letterSpacing={1.5}
            >
              CURRENT · {props.currentState.toUpperCase()}
            </text>
            <text
              x={bx + 10} y={by + 29}
              fontSize={10}
              fill="#e7f3ff"
            >
              {action}
            </text>
            {/* 指示线：从信息块底部连到节点顶部 */}
            <line
              x1={c.x} y1={by + boxH}
              x2={c.x} y2={c.y - NODE_H / 2}
              stroke="#43f7b5"
              strokeWidth={1}
              strokeDasharray="2 2"
              opacity={0.5}
            />
          </g>
        );
      })()}

      {/* === 4. 图例 === */}
      <g transform={`translate(12, ${VB_H - 18})`}>
        <line x1={0} y1={0} x2={20} y2={0} stroke="#43f7b5" strokeWidth={2} markerEnd="url(#arrow-fwd)" />
        <text x={26} y={3} fontSize={10} fill="#9eb5cb">{t('charts.suLegendMain')}</text>
        <line x1={90} y1={0} x2={110} y2={0} stroke="#ffb84d" strokeWidth={1.5} strokeDasharray="4 3" markerEnd="url(#arrow-back)" />
        <text x={116} y={3} fontSize={10} fill="#9eb5cb">{t('charts.suLegendFallback')}</text>
        <text x={186} y={3} fontSize={10} fill="#43f7b5">{t('charts.suLegendCurrent')}</text>
        <text x={236} y={3} fontSize={10} fill="#34d6ff">{t('charts.suLegendVisited')}</text>
        <text x={300} y={3} fontSize={10} fill="#5d7793">{t('charts.suLegendUnvisited')}</text>
      </g>
    </svg>
  );
}
