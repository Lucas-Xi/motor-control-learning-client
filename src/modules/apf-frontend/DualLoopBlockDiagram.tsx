import { useState } from 'react';
import { Card } from '../../components/ui/Card';

/**
 * 双环 Boost PFC 结构图：
 *   - 电流环（cyan）：i_L 采样 → 电流 PI → PWM duty
 *   - 电压环（mint）：Udc 采样 → 电压 PI → I_peak 给定
 *
 * 通过 hover 节点高亮所属通道，让初学者建立"两条回路 + 共用功率级"的
 * 心智模型；不靠 SVG 动画浮夸，靠颜色 + 文字说明传达信息。
 */

type Channel = 'current' | 'voltage' | null;

interface NodeDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  channel: 'current' | 'voltage' | 'power';
}

const NODES: NodeDef[] = [
  // 功率级（power channel = 灰色，恒态显示）
  { id: 'grid',    x: 16,  y: 100, w: 70, h: 38, label: 'v_grid', sub: '220 V / 50 Hz', channel: 'power' },
  { id: 'bridge',  x: 100, y: 100, w: 56, h: 38, label: '整流桥', sub: '|sin|', channel: 'power' },
  { id: 'L',       x: 170, y: 100, w: 54, h: 38, label: 'L', sub: '1.5 mH', channel: 'power' },
  { id: 'switch',  x: 238, y: 100, w: 54, h: 38, label: 'S (PWM)', sub: 'IGBT', channel: 'current' },
  { id: 'diode',   x: 306, y: 100, w: 54, h: 38, label: 'D', sub: '快恢复', channel: 'power' },
  { id: 'cap',     x: 374, y: 100, w: 54, h: 38, label: 'C', sub: '470 μF', channel: 'voltage' },
  { id: 'load',    x: 442, y: 100, w: 54, h: 38, label: '负载', sub: '1.5 kW', channel: 'power' },
  // 采样
  { id: 'iSense',  x: 174, y: 180, w: 60, h: 30, label: 'i_L 采样', channel: 'current' },
  { id: 'uSense',  x: 380, y: 180, w: 60, h: 30, label: 'Udc 采样', channel: 'voltage' },
  // 控制器
  { id: 'piV',     x: 376, y: 234, w: 80, h: 34, label: '电压 PI', sub: 'Kpv / Kiv', channel: 'voltage' },
  { id: 'piI',     x: 170, y: 234, w: 80, h: 34, label: '电流 PI', sub: 'Kpi / Kii', channel: 'current' },
  { id: 'mul',     x: 280, y: 234, w: 56, h: 34, label: '× |sin|', sub: 'i_ref', channel: 'current' },
  { id: 'pwm',     x: 60,  y: 234, w: 80, h: 34, label: 'PWM', sub: 'duty', channel: 'current' },
];

const CYAN = '#34d6ff'; // accent.primary
const MINT = '#43f7b5'; // accent.measure
const POWER = '#9eb5cb'; // ink.secondary

function channelColor(ch: NodeDef['channel'], hover: Channel): string {
  if (ch === 'power') return POWER;
  if (ch === 'current') return hover === null || hover === 'current' ? CYAN : '#3b4a5e';
  return hover === null || hover === 'voltage' ? MINT : '#3b4a5e';
}

function nodeChannel(ch: NodeDef['channel']): Channel {
  if (ch === 'current') return 'current';
  if (ch === 'voltage') return 'voltage';
  return null;
}

export function DualLoopBlockDiagram() {
  const [hover, setHover] = useState<Channel>(null);

  // 连接线定义（from, to, channel）
  const lines: Array<{ id: string; d: string; ch: 'current' | 'voltage' | 'power'; arrow?: boolean }> = [
    // 主功率链（左→右）
    { id: 'p1', d: 'M 86 119 H 100', ch: 'power' },
    { id: 'p2', d: 'M 156 119 H 170', ch: 'power' },
    { id: 'p3', d: 'M 224 119 H 238', ch: 'power' },
    { id: 'p4', d: 'M 292 119 H 306', ch: 'power' },
    { id: 'p5', d: 'M 360 119 H 374', ch: 'power' },
    { id: 'p6', d: 'M 428 119 H 442', ch: 'power' },
    // i_L 采样：电感节点下行
    { id: 'is', d: 'M 197 138 V 180', ch: 'current', arrow: true },
    // 采样 → 电流 PI
    { id: 'i2pi', d: 'M 200 210 V 234', ch: 'current', arrow: true },
    // 电流 PI ← 比较节点（i_ref - i_L），i_ref 从 mul 来
    { id: 'mul2pi', d: 'M 280 251 H 250', ch: 'current', arrow: true },
    // 电流 PI → PWM
    { id: 'pi2pwm', d: 'M 170 251 H 140', ch: 'current', arrow: true },
    // PWM → S
    { id: 'pwm2sw', d: 'M 100 234 V 138', ch: 'current', arrow: true },
    // Udc 采样：电容节点下行
    { id: 'us', d: 'M 410 138 V 180', ch: 'voltage', arrow: true },
    // 采样 → 电压 PI
    { id: 'u2piV', d: 'M 416 210 V 234', ch: 'voltage', arrow: true },
    // 电压 PI → 乘法器（I_peak）
    { id: 'piV2mul', d: 'M 376 251 H 336', ch: 'voltage', arrow: true },
  ];

  return (
    <Card
      title="双环结构图"
      eyebrow="dual-loop topology"
      density="compact"
      action={
        <div className="flex items-center gap-2 text-caption">
          <button
            type="button"
            onMouseEnter={() => setHover('current')}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover('current')}
            onBlur={() => setHover(null)}
            className="rounded-md border border-accent-primary/40 bg-accent-primary/10 px-2 py-0.5 text-accent-primary"
          >
            电流环
          </button>
          <button
            type="button"
            onMouseEnter={() => setHover('voltage')}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover('voltage')}
            onBlur={() => setHover(null)}
            className="rounded-md border border-accent-measure/40 bg-accent-measure/10 px-2 py-0.5 text-accent-measure"
          >
            电压环
          </button>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <svg
          viewBox="0 0 520 290"
          role="img"
          aria-label="单相 Boost PFC 双环结构图：上层为整流桥-电感-开关-二极管-电容功率链；下层为电流环和电压环 PI 控制器，电压环输出乘以 |sin| 后作为电流环参考"
          className="h-auto w-full"
        >
          <defs>
            <marker id="arrow-cyan" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={CYAN} />
            </marker>
            <marker id="arrow-mint" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={MINT} />
            </marker>
            <marker id="arrow-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b4a5e" />
            </marker>
          </defs>

          {/* 连接线 */}
          {lines.map((l) => {
            const c = channelColor(l.ch, hover);
            const marker =
              l.arrow
                ? l.ch === 'current'
                  ? hover === null || hover === 'current'
                    ? 'url(#arrow-cyan)'
                    : 'url(#arrow-dim)'
                  : l.ch === 'voltage'
                  ? hover === null || hover === 'voltage'
                    ? 'url(#arrow-mint)'
                    : 'url(#arrow-dim)'
                  : undefined
                : undefined;
            return (
              <path
                key={l.id}
                d={l.d}
                stroke={c}
                strokeWidth={1.6}
                fill="none"
                markerEnd={marker}
                opacity={l.ch === 'power' ? 0.8 : 1}
              />
            );
          })}

          {/* 节点 */}
          {NODES.map((n) => {
            const c = channelColor(n.channel, hover);
            const dim = n.channel !== 'power' && hover !== null && nodeChannel(n.channel) !== hover;
            return (
              <g
                key={n.id}
                onMouseEnter={() => {
                  const ch = nodeChannel(n.channel);
                  if (ch) setHover(ch);
                }}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: n.channel === 'power' ? 'default' : 'pointer' }}
              >
                <rect
                  x={n.x}
                  y={n.y}
                  width={n.w}
                  height={n.h}
                  rx={6}
                  fill="#0d1929"
                  stroke={c}
                  strokeWidth={dim ? 1 : 1.5}
                  opacity={dim ? 0.45 : 1}
                />
                <text x={n.x + n.w / 2} y={n.y + (n.sub ? 16 : 22)} textAnchor="middle" fill="#e7f3ff" fontSize={11} opacity={dim ? 0.5 : 1}>
                  {n.label}
                </text>
                {n.sub && (
                  <text x={n.x + n.w / 2} y={n.y + 29} textAnchor="middle" fill={c} fontSize={9} opacity={dim ? 0.5 : 0.9}>
                    {n.sub}
                  </text>
                )}
              </g>
            );
          })}

          {/* 通道标签 */}
          <text x={8} y={16} fill={CYAN} fontSize={10} opacity={hover === 'voltage' ? 0.4 : 1}>
            ━ 内环：电流 ~1 kHz
          </text>
          <text x={8} y={32} fill={MINT} fontSize={10} opacity={hover === 'current' ? 0.4 : 1}>
            ━ 外环：电压 ~20 Hz
          </text>
          <text x={400} y={16} fill={POWER} fontSize={10}>
            ━ 主功率链
          </text>
        </svg>
      </div>
      <p className="mt-2 text-caption leading-relaxed text-ink-secondary">
        悬停 <span className="text-accent-primary">电流环</span> 或 <span className="text-accent-measure">电压环</span> 高亮对应通道。两环带宽分离 10 倍以上（电流环 ~1 kHz、电压环 ~20 Hz）是工程红线 —— 否则电压环会"误把 100 Hz 母线纹波当负载变化"调电流参考，导致 i_grid 出现二次谐波。
      </p>
    </Card>
  );
}
