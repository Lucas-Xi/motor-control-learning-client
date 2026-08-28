import { useCallback, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { GripVertical, RotateCcw } from 'lucide-react';
import type { CompressorSpec, InverterPlatform } from '../../content/compressorLibrary';
import type {
  ControlStrategy,
  LiquidSeparator,
  LoadCondition,
  PfcPlatform,
} from '../../content/assemblyLibraries';
import {
  useAssemblyProgressStore,
  type WorkshopNodeId,
  type NodePosition,
} from '../../store/assemblyProgressStore';
import { useRafThrottle } from '../../utils/useRafThrottle';
import { useI18n, type TKey } from '../../i18n/useI18n';

/**
 * Phase B · 可视化拖拽画布。
 *
 * - 6 个 slot（压缩机 / 变频器 / 控制策略 / 工况 / PFC / 液气分离器）以方框节点
 *   绘制在一张 SVG 画布上，用户可以拖动节点重排版面。
 * - 节点之间用箭头连出三种连接（管路/电路/信号），用颜色区分。
 * - 节点也是 drop target：拖 SlotPicker 上的 chip（用 application/x-assembly-slot
 *   MIME 标识）至匹配类别的节点即可切换该 slot。
 * - 节点位置 persist 到 assemblyProgressStore.nodePositions，刷新后恢复。
 * - 键盘等效：tab 到节点后 ←/→/↑/↓ 1% 步进、Shift+方向 5% 大步、Home 复位、Enter 触发 swap 弹层。
 */

const DRAG_TYPE = 'application/x-assembly-slot';
type DragCategory = WorkshopNodeId;

/** SVG 画布的内部坐标系（与百分比换算用：x_px = x_pct * VB_W / 100） */
const VB_W = 1000;
const VB_H = 520;
const NODE_W = 170;
const NODE_H = 78;

const NODE_LABEL: Record<WorkshopNodeId, TKey> = {
  load: 'assemblyWorkshop.slotLoad',
  separator: 'assemblyWorkshop.slotSeparatorFull',
  compressor: 'assemblyWorkshop.slotCompressor',
  pfc: 'assemblyWorkshop.slotPfcFull',
  inverter: 'assemblyWorkshop.slotInverter',
  strategy: 'assemblyWorkshop.slotStrategy',
};

type ConnectionKind = 'mech' | 'power' | 'signal';
const CONN_COLOR: Record<ConnectionKind, string> = {
  mech: 'rgb(67 247 181)',    // accent.measure — 制冷工质 / 机械
  power: 'rgb(255 184 77)',   // accent.warn — 电力（PFC→Vdc→变频器→压缩机三相）
  signal: 'rgb(52 214 255)',  // accent.primary — 控制 / 反馈
};
const CONN_LABEL: Record<ConnectionKind, TKey> = {
  mech: 'assemblyWorkshop.connMech',
  power: 'assemblyWorkshop.connPower',
  signal: 'assemblyWorkshop.connSignal',
};

interface Connection {
  from: WorkshopNodeId;
  to: WorkshopNodeId;
  kind: ConnectionKind;
  /** 中性术语标签（Vdc / duty 等），需要翻译的用 labelKey */
  label?: string;
  labelKey?: TKey;
}

/**
 * 6 节点之间的连接定义。
 * 这里硬编码，避免连接走 store 反复推渲染 —— 节点拖动只改坐标，连接拓扑不变。
 */
const CONNECTIONS: Connection[] = [
  // 制冷链路（机械）
  { from: 'load', to: 'separator', kind: 'mech', labelKey: 'assemblyWorkshop.connTorque' },
  { from: 'separator', to: 'compressor', kind: 'mech', labelKey: 'assemblyWorkshop.connSuction' },
  // 电气链路
  { from: 'pfc', to: 'inverter', kind: 'power', label: 'Vdc' },
  { from: 'inverter', to: 'compressor', kind: 'power', label: 'Iabc' },
  // 控制信号
  { from: 'strategy', to: 'inverter', kind: 'signal', label: 'duty' },
  { from: 'compressor', to: 'strategy', kind: 'signal', label: 'θ / BEMF' },
];

interface Props {
  compressor: CompressorSpec;
  inverter: InverterPlatform;
  strategy: ControlStrategy;
  load: LoadCondition;
  pfc: PfcPlatform;
  separator: LiquidSeparator;
  onSwapCompressor: (idx: number) => void;
  onSwapInverter: (idx: number) => void;
  onSwapStrategy: (idx: number) => void;
  onSwapLoad: (idx: number) => void;
  onSwapPfc: (idx: number) => void;
  onSwapSeparator: (idx: number) => void;
}

export function DraggableCanvas(props: Props) {
  const { t } = useI18n();
  const positions = useAssemblyProgressStore((s) => s.nodePositions);
  const setNodePosition = useAssemblyProgressStore((s) => s.setNodePosition);
  const resetNodePositions = useAssemblyProgressStore((s) => s.resetNodePositions);

  // 选中节点（键盘聚焦也算选中）。删除连接需要先选一条连接；这里实现"连接选中"用 hover/keyboard
  const [selectedConn, setSelectedConn] = useState<number | null>(null);

  // 连接标签：中文走 labelKey，中性术语直接用 label
  const connLabel = useCallback((c: Connection) => (c.labelKey ? t(c.labelKey) : c.label ?? ''), [t]);

  const swapHandlers = useMemo<Record<WorkshopNodeId, (idx: number) => void>>(() => ({
    compressor: props.onSwapCompressor,
    inverter: props.onSwapInverter,
    strategy: props.onSwapStrategy,
    load: props.onSwapLoad,
    pfc: props.onSwapPfc,
    separator: props.onSwapSeparator,
  }), [props.onSwapCompressor, props.onSwapInverter, props.onSwapStrategy, props.onSwapLoad, props.onSwapPfc, props.onSwapSeparator]);

  // 节点当前展示的简短名 + 副标题（与 SlotPicker 顺序一致）
  const labelOf = useCallback((id: WorkshopNodeId): { title: string; sub: string } => {
    if (id === 'compressor') return { title: props.compressor.brand.split('（')[0], sub: `${props.compressor.partNo} · ${props.compressor.hp}HP` };
    if (id === 'inverter') return { title: props.inverter.ipmBrand, sub: `${props.inverter.ipmPartNo} · ${props.inverter.ratedCurrentA}A` };
    if (id === 'strategy') return { title: props.strategy.name.split('（')[0], sub: props.strategy.id };
    if (id === 'load') return { title: props.load.name.split('·')[0].trim(), sub: `${props.load.targetRpm} rpm · ${props.load.refrigerant}` };
    if (id === 'pfc') return { title: props.pfc.name.split('（')[0], sub: `Vdc ${props.pfc.vdcOutput}V · PF ${props.pfc.pf}` };
    return { title: props.separator.name.split('（')[0], sub: `≤ ${props.separator.maxRampRpmS} rpm/s` };
  }, [props.compressor, props.inverter, props.strategy, props.load, props.pfc, props.separator]);

  // 节点中心 px 坐标（用于连线）—— 用 positions 实时算
  const center = useCallback((id: WorkshopNodeId) => {
    const p = positions[id];
    return {
      cx: (p.x / 100) * VB_W + NODE_W / 2,
      cy: (p.y / 100) * VB_H + NODE_H / 2,
    };
  }, [positions]);

  return (
    <div className="rounded-xl border border-line-subtle bg-bg-base p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-3.5 w-3.5 text-accent-primary" />
          <p className="text-caption uppercase tracking-[0.18em] text-ink-muted">{t('assemblyWorkshop.canvasTitle')}</p>
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          {(['mech', 'power', 'signal'] as ConnectionKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1 text-ink-muted">
              <span className="inline-block h-2 w-4" style={{ backgroundColor: CONN_COLOR[k] }} />
              {t(CONN_LABEL[k])}
            </span>
          ))}
          <button
            type="button"
            onClick={() => { resetNodePositions(); setSelectedConn(null); }}
            className="flex items-center gap-1 rounded border border-line-subtle bg-bg-surface px-1.5 py-0.5 text-ink-muted hover:text-ink-primary"
            title={t('assemblyWorkshop.canvasResetTitle')}
          >
            <RotateCcw className="h-3 w-3" /> {t('assemblyWorkshop.canvasReset')}
          </button>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        className="w-full select-none touch-none"
        style={{ aspectRatio: `${VB_W} / ${VB_H}`, maxHeight: 380 }}
        role="img"
        aria-label={t('assemblyWorkshop.canvasAria')}
      >
        <defs>
          {(['mech', 'power', 'signal'] as ConnectionKind[]).map((k) => (
            <marker
              key={k}
              id={`canvas-arrow-${k}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,5 L0,10 z" fill={CONN_COLOR[k]} />
            </marker>
          ))}
        </defs>

        {/* 背景网格（弱视觉，提示画布范围） */}
        <rect x="0" y="0" width={VB_W} height={VB_H} fill="rgba(7,17,31,0.0)" />
        {Array.from({ length: 5 }, (_, i) => (
          <line key={`hg-${i}`} x1="0" x2={VB_W} y1={(i + 1) * (VB_H / 6)} y2={(i + 1) * (VB_H / 6)} stroke="rgba(231,243,255,0.04)" strokeWidth="1" />
        ))}
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`vg-${i}`} y1="0" y2={VB_H} x1={(i + 1) * (VB_W / 10)} x2={(i + 1) * (VB_W / 10)} stroke="rgba(231,243,255,0.04)" strokeWidth="1" />
        ))}

        {/* 连接：先画连接，再画节点（节点压在连接上方） */}
        {CONNECTIONS.map((conn, i) => {
          const a = center(conn.from);
          const b = center(conn.to);
          const selected = selectedConn === i;
          return (
            <ConnectionPath
              key={`${conn.from}-${conn.to}-${i}`}
              ax={a.cx}
              ay={a.cy}
              bx={b.cx}
              by={b.cy}
              kind={conn.kind}
              label={connLabel(conn)}
              selected={selected}
              onSelect={() => setSelectedConn(selected ? null : i)}
            />
          );
        })}

        {/* 6 个节点 */}
        {(Object.keys(positions) as WorkshopNodeId[]).map((id) => {
          const { title, sub } = labelOf(id);
          return (
            <CanvasNode
              key={id}
              id={id}
              position={positions[id]}
              setPosition={(pos) => setNodePosition(id, pos)}
              title={title}
              sub={sub}
              onSwap={swapHandlers[id]}
            />
          );
        })}
      </svg>

      <p className="mt-2 text-caption text-ink-muted">
        {t('assemblyWorkshop.canvasHint')}
        {selectedConn !== null && (
          <span className="ml-2 text-accent-primary">{t('assemblyWorkshop.canvasConnSelected').replace('{label}', connLabel(CONNECTIONS[selectedConn])).replace('{kind}', t(CONN_LABEL[CONNECTIONS[selectedConn].kind]))}</span>
        )}
      </p>
    </div>
  );
}

// ———————————————————— CanvasNode ————————————————————

interface NodeProps {
  id: WorkshopNodeId;
  position: NodePosition;
  setPosition: (pos: NodePosition) => void;
  title: string;
  sub: string;
  onSwap: (idx: number) => void;
}

function CanvasNode({ id, position, setPosition, title, sub, onSwap }: NodeProps) {
  const { t } = useI18n();
  const [dragOver, setDragOver] = useState(false);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<{ ox: number; oy: number } | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);

  // pointermove 必须经 useRafThrottle，每帧最多一次 store 写入（CLAUDE.md 关键约束）
  const commit = useRafThrottle((x: number, y: number) => {
    setPosition({ x, y });
  });

  // 屏幕坐标 → SVG viewBox 百分比
  const screenToPercent = useCallback((clientX: number, clientY: number): NodePosition => {
    const svg = groupRef.current?.ownerSVGElement;
    if (!svg) return { x: position.x, y: position.y };
    const rect = svg.getBoundingClientRect();
    // 屏幕像素 → viewBox 像素 → 百分比
    const vbX = ((clientX - rect.left) / rect.width) * VB_W;
    const vbY = ((clientY - rect.top) / rect.height) * VB_H;
    // 把节点左上角对齐到 (vbX - ox, vbY - oy)；最终 percent = 左上 / VB
    const off = dragOffsetRef.current ?? { ox: NODE_W / 2, oy: NODE_H / 2 };
    const xPct = ((vbX - off.ox) / VB_W) * 100;
    const yPct = ((vbY - off.oy) / VB_H) * 100;
    // 保证节点完整在画布内（节点宽高占百分比）
    const maxX = 100 - (NODE_W / VB_W) * 100;
    const maxY = 100 - (NODE_H / VB_H) * 100;
    return {
      x: Math.max(0, Math.min(maxX, xPct)),
      y: Math.max(0, Math.min(maxY, yPct)),
    };
  }, [position.x, position.y]);

  const onPointerDown = (e: ReactPointerEvent<SVGGElement>) => {
    // 仅左键 / 主指针。避免接管文本拖拽
    if (e.button !== 0) return;
    e.stopPropagation();
    const svg = groupRef.current?.ownerSVGElement;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const vbX = ((e.clientX - rect.left) / rect.width) * VB_W;
    const vbY = ((e.clientY - rect.top) / rect.height) * VB_H;
    const nodeX = (position.x / 100) * VB_W;
    const nodeY = (position.y / 100) * VB_H;
    dragOffsetRef.current = { ox: vbX - nodeX, oy: vbY - nodeY };
    draggingRef.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGGElement>) => {
    if (!draggingRef.current) return;
    const next = screenToPercent(e.clientX, e.clientY);
    commit(next.x, next.y);
  };
  const onPointerUp = (e: ReactPointerEvent<SVGGElement>) => {
    draggingRef.current = false;
    dragOffsetRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // 键盘等效（参考 VectorPlane handleKeyDown 范式 + 引入大步 / Home）
  const onKeyDown = (e: ReactKeyboardEvent<SVGGElement>) => {
    const step = e.shiftKey ? 5 : 1;
    let handled = true;
    let nx = position.x;
    let ny = position.y;
    switch (e.key) {
      case 'ArrowLeft':  nx -= step; break;
      case 'ArrowRight': nx += step; break;
      case 'ArrowUp':    ny -= step; break;
      case 'ArrowDown':  ny += step; break;
      case 'Home':       nx = DEFAULT_X[id]; ny = DEFAULT_Y[id]; break;
      default: handled = false;
    }
    if (!handled) return;
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: nx, y: ny });
  };

  // drag-from-chip drop target
  const onDragEnter = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
  };
  const onDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!dragOver) setDragOver(true);
  };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const data = e.dataTransfer.getData(DRAG_TYPE);
    if (!data) return;
    const [cat, idxStr] = data.split(':');
    if (cat !== (id as DragCategory)) return;
    const idx = parseInt(idxStr, 10);
    if (!Number.isNaN(idx)) onSwap(idx);
  };

  const x = (position.x / 100) * VB_W;
  const y = (position.y / 100) * VB_H;
  const stroke = dragOver ? 'rgb(52 214 255)' : 'rgb(46 65 89)';
  const fill = dragOver ? 'rgb(52 214 255 / 0.15)' : 'rgb(13 25 41 / 0.95)';

  return (
    <g
      ref={groupRef}
      role="application"
      tabIndex={0}
      aria-label={t('assemblyWorkshop.canvasNodeAria')
        .replace('{label}', t(NODE_LABEL[id]))
        .replace('{title}', title)
        .replace('{x}', position.x.toFixed(0))
        .replace('{y}', position.y.toFixed(0))}
      transform={`translate(${x}, ${y})`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{ cursor: draggingRef.current ? 'grabbing' : 'grab', outline: 'none' }}
    >
      <title>{`${t(NODE_LABEL[id])}：${title}`}</title>
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={10}
        fill={fill}
        stroke={stroke}
        strokeWidth={dragOver ? 2.4 : 1.4}
      />
      {/* 类别标签条（上沿色块） */}
      <rect width={NODE_W} height={6} y={0} rx={3} fill={CATEGORY_COLOR[id]} opacity={0.85} />
      <text x={10} y={26} fontSize={10} fill="rgb(158 181 203)" fontFamily="ui-monospace, monospace" style={{ textTransform: 'uppercase', letterSpacing: 1.5 }}>
        {t(NODE_LABEL[id])}
      </text>
      <text x={10} y={46} fontSize={13} fill="rgb(231 243 255)" fontWeight={500}>
        {truncate(title, 18)}
      </text>
      <text x={10} y={64} fontSize={10} fill="rgb(158 181 203)">
        {truncate(sub, 24)}
      </text>
      {dragOver && (
        <text x={NODE_W - 8} y={NODE_H - 8} fontSize={9} fill="rgb(52 214 255)" textAnchor="end" fontFamily="ui-monospace, monospace">
          drop ↓
        </text>
      )}
    </g>
  );
}

// ———————————————————— ConnectionPath ————————————————————

function ConnectionPath({
  ax, ay, bx, by, kind, label, selected, onSelect,
}: { ax: number; ay: number; bx: number; by: number; kind: ConnectionKind; label: string; selected: boolean; onSelect: () => void }) {
  // 端点偏移到节点边缘附近，避免箭头插进节点中心（用单位向量缩进 36 px）
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const startX = ax + ux * 36;
  const startY = ay + uy * 36;
  const endX = bx - ux * 38;
  const endY = by - uy * 38;
  // 中点偏一点画曲线，避免节点重叠时连接全挤一起
  const midX = (startX + endX) / 2 + -uy * 24;  // 法向偏移
  const midY = (startY + endY) / 2 + ux * 24;
  const d = `M ${startX} ${startY} Q ${midX} ${midY} ${endX} ${endY}`;
  const color = CONN_COLOR[kind];

  return (
    <g style={{ cursor: 'pointer' }} onClick={onSelect}>
      {/* 透明粗描边便于命中 */}
      <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
      <path
        d={d}
        stroke={color}
        strokeWidth={selected ? 3 : 1.8}
        strokeOpacity={selected ? 1 : 0.85}
        fill="none"
        markerEnd={`url(#canvas-arrow-${kind})`}
        strokeDasharray={kind === 'signal' ? '6 4' : undefined}
      />
      <text
        x={midX}
        y={midY - 6}
        fontSize={10}
        fill={color}
        textAnchor="middle"
        style={{ pointerEvents: 'none', fontFamily: 'ui-monospace, monospace' }}
      >
        {label}
      </text>
    </g>
  );
}

// ———————————————————— 辅助常量 / 工具 ————————————————————

const CATEGORY_COLOR: Record<WorkshopNodeId, string> = {
  load: CONN_COLOR.mech,
  separator: CONN_COLOR.mech,
  compressor: CONN_COLOR.mech,
  pfc: CONN_COLOR.power,
  inverter: CONN_COLOR.power,
  strategy: CONN_COLOR.signal,
};

// 复用 DEFAULT 但只取数值（避免再 import 静态）
const DEFAULT_X: Record<WorkshopNodeId, number> = { load: 8, separator: 38, compressor: 68, pfc: 8, inverter: 38, strategy: 68 };
const DEFAULT_Y: Record<WorkshopNodeId, number> = { load: 18, separator: 18, compressor: 18, pfc: 70, inverter: 70, strategy: 70 };

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
