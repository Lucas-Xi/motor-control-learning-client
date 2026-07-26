import { useMemo, useState } from 'react';
import { Card } from '../../components/ui/Card';

/**
 * 定子绕组展开图。
 *
 * 展示 36 槽 4 极整数槽绕组的展开图：
 * - 每极每相槽数 q = Z / (2p·m) = 36 / (8·3) = 1.5（分数槽）
 * - 实际用简化 24 槽 4 极（q=2）做示范
 * - 颜色：U(黄), V(绿), W(红)
 * - 鼠标悬停高亮同相绕组
 */
export function WindingDiagramCard() {
  // 配置：24 槽 4 极，双层叠绕组
  // 每极每相 2 槽，极距 τ = Z/2p = 24/4 = 6
  const [hoverPhase, setHoverPhase] = useState<string | null>(null);

  const slots = useMemo(() => {
    const Z = 24;
    const p = 2; // 极对数（4 极）
    const m = 3;
    const q = Z / (2 * p * m); // = 2

    const phaseOrder: string[] = [];
    // A1 B1 C1 A2 B2 C2 ... 共 2p 组
    for (let pol = 0; pol < 2 * p; pol++) {
      for (let ph = 0; ph < m; ph++) {
        for (let s = 0; s < q; s++) {
          const phaseLabel = ['U', 'V', 'W'][ph];
          // 反向极下绕组反向——仅用于绘图对称，此处省略层标记
          phaseOrder.push(phaseLabel);
        }
      }
    }

    return phaseOrder.map((ph, i) => ({
      slot: i + 1,
      phase: ph,
      x: (i % 24) / 24,
    }));
  }, []);

  const colors: Record<string, string> = { U: '#f5a623', V: '#43f7b5', W: '#ff5c7a' };
  const dimColors: Record<string, string> = { U: 'rgba(245,166,35,0.25)', V: 'rgba(67,247,181,0.25)', W: 'rgba(255,92,122,0.25)' };
  const slotPitch = 920 / 24;
  const polePitchStartX = 20;
  const polePitchEndX = polePitchStartX + 6 * slotPitch;
  const polePitchLabelX = polePitchStartX + 3 * slotPitch;

  return (
    <Card title="定子绕组展开图" eyebrow="24 槽 4 极 · 双层叠绕组" density="compact">
      <div className="mb-2 flex gap-3">
        {(['U', 'V', 'W'] as const).map((ph) => (
          <button
            key={ph}
            type="button"
            onMouseEnter={() => setHoverPhase(ph)}
            onMouseLeave={() => setHoverPhase(null)}
            className={`rounded border px-2 py-0.5 text-caption font-medium transition-colors ${
              hoverPhase === ph
                ? 'border-transparent bg-opacity-20 text-white'
                : 'border-line-subtle text-ink-secondary hover:border-line-strong'
            }`}
            style={hoverPhase === ph ? { backgroundColor: colors[ph] + '33', borderColor: colors[ph] } : {}}
          >
            <span style={{ color: colors[ph] }}>●</span> {ph} 相
          </button>
        ))}
        {hoverPhase && (
          <button
            type="button"
            onClick={() => setHoverPhase(null)}
            className="text-caption text-ink-muted underline"
          >
            清除
          </button>
        )}
      </div>

      {/* 绕组展开 SVG */}
      <div
        className="overflow-x-auto rounded focus:outline-none focus:ring-2 focus:ring-accent-primary/50"
        tabIndex={0}
        role="region"
        aria-label="定子绕组展开图横向滚动区域"
      >
        <svg viewBox="0 0 960 180" className="w-full" style={{ minWidth: 720 }}>
          {/* 背景槽线 */}
          {slots.map((s) => {
            const cx = s.x * 920 + 20;
            const isHighlight = hoverPhase === null || s.phase === hoverPhase;
            const fill = isHighlight ? colors[s.phase] : dimColors[s.phase];
            return (
              <g key={s.slot}>
                {/* 槽口 */}
                <rect
                  x={cx - 6} y="20" width="12" height="100"
                  rx="2" fill={fill} opacity={isHighlight ? 0.6 : 0.3}
                  stroke={isHighlight ? colors[s.phase] : 'rgba(148,210,255,0.08)'}
                  strokeWidth="0.5"
                />
                {/* 槽编号 */}
                <text x={cx} y="138" textAnchor="middle" fill="#5a7a8e" fontSize="7">
                  {s.slot}
                </text>
                {/* 上层绕组（极相组标识） */}
                <text x={cx} y="40" textAnchor="middle" fill={isHighlight ? colors[s.phase] : '#5a7a8e'}
                  fontSize="9" fontWeight={isHighlight ? 'bold' : 'normal'}>
                  {s.phase}
                </text>
              </g>
            );
          })}

          {/* 端部连接线（示意） */}
          {slots.map((s, i) => {
            if (i % 2 !== 0) return null;
            const next = slots[i + 1];
            if (!next || s.phase !== next.phase) return null;
            const x1 = s.x * 920 + 20;
            const x2 = next.x * 920 + 20;
            const isHighlight = hoverPhase === null || s.phase === hoverPhase;
            return (
              <path
                key={`end-${i}`}
                d={`M ${x1} 120 Q ${(x1 + x2) / 2} 145 ${x2} 120`}
                fill="none"
                stroke={isHighlight ? colors[s.phase] : dimColors[s.phase]}
                strokeWidth={1.5}
                opacity={isHighlight ? 0.5 : 0.15}
              />
            );
          })}

          {/* 极距标注 */}
          <line x1={polePitchStartX} y1="150" x2={polePitchEndX} y2="150"
            stroke="rgba(148,210,255,0.25)" strokeWidth="1" strokeDasharray="4 2" />
          <text x={polePitchLabelX} y="163" textAnchor="middle" fill="#5a7a8e" fontSize="7">
            极距 τ = 6
          </text>
        </svg>
      </div>

      <p className="mt-1 text-caption leading-relaxed text-ink-secondary">
        每极每相槽数 q = 2 · 双层叠绕组 · 极距 τ = 6。鼠标悬停高亮同相绕组。
        端部连接仅示意同相相邻槽的串联关系。
      </p>
    </Card>
  );
}