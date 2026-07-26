import { useMemo } from 'react';
import { pSat, type Refrigerant } from '../../simulation/math/refrigerantProps';

/**
 * 压缩机操作包线（Operating Envelope）— 在 (T_e, T_c) 平面绘制允许工作区域。
 *
 * 4 条边界（取交集为安全区）：
 *   1) 蒸发温度范围：T_e ∈ [-30, 18] °C
 *   2) 冷凝温度范围：T_c ∈ [25, T_c_max(refrigerant)]
 *   3) 排气温度限：T_d ≤ 110 °C，用工程近似 T_d ≈ T_e + (T_c - T_e) × 1.5 + 30 反求
 *      解出 T_c 上界 = (110 - T_e - 30) / 1.5 + T_e = (80 - 0.5·T_e) / 1.5·... 化简：
 *      令 T_d = T_e + 1.5·(T_c - T_e) + 30 = -0.5·T_e + 1.5·T_c + 30 ≤ 110
 *      → T_c ≤ (80 + 0.5·T_e) / 1.5
 *   4) 压力比限：P_sat(T_c) / P_sat(T_e) ≤ 7
 *      解析无闭式，对每个 T_e 数值搜索 T_c 使 ratio = 7。
 *
 * 安全区 = 上述 4 条都满足的交集。绘制方式：扫描 T_e 列，
 * 每列取 max(Tc_min) 与 min(Tc_max_3, Tc_max_4) 围成多边形。
 */

export interface CompressorEnvelopeProps {
  Te: number;
  Tc: number;
  Tdischarge: number;
  pressureRatio: number;
  refrigerant: Refrigerant;
}

const W = 480;
const H = 360;
const PADDING = { left: 44, right: 22, top: 22, bottom: 44 };
const PLOT_W = W - PADDING.left - PADDING.right;
const PLOT_H = H - PADDING.top - PADDING.bottom;

const TE_MIN = -30;
const TE_MAX = 20;
const TC_MIN_PLOT = 25;
const TC_MAX_PLOT = 70;

// 包线本身的边界（不是绘图视区）
const TE_LO = -30;
const TE_HI = 18;
const TC_LO = 25;
const TD_LIMIT = 110;
const PR_LIMIT = 7;

// 各制冷剂的冷凝温度上限（依据临界温度留 1°C 余量）
const TC_HI_MAP: Record<Refrigerant, number> = {
  R134a: 80,
  R32: 70,
  R410A: 65,
};

const xOf = (Te: number) =>
  PADDING.left + ((Te - TE_MIN) / (TE_MAX - TE_MIN)) * PLOT_W;
const yOf = (Tc: number) =>
  PADDING.top + (1 - (Tc - TC_MIN_PLOT) / (TC_MAX_PLOT - TC_MIN_PLOT)) * PLOT_H;

const clip = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** T_d ≤ 110 时 T_c 的上界：T_c ≤ (80 + 0.5·T_e) / 1.5 */
function tcLimitByTd(Te: number): number {
  return (80 + 0.5 * Te) / 1.5;
}

/** 二分搜索压力比 = PR_LIMIT 时的 T_c */
function tcLimitByPressureRatio(Te: number, r: Refrigerant, tcUpper: number): number {
  const Ps = pSat(Te, r);
  const target = PR_LIMIT * Ps;
  // 在 [Te + 1, tcUpper + 5] 范围内二分；P_sat(T_c) 单调递增
  let lo = Te + 1;
  let hi = Math.max(lo + 1, tcUpper + 10);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    const Pd = pSat(mid, r);
    if (Pd < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function CompressorEnvelope({
  Te,
  Tc,
  Tdischarge,
  pressureRatio,
  refrigerant,
}: CompressorEnvelopeProps) {
  const tcHi = TC_HI_MAP[refrigerant];

  // 沿 T_e 扫描，构造上边界（min(Td限, 压比限, Tc范围)）和下边界（Tc_LO）
  const { tdCurve, prCurve, safePath, dangerPath } = useMemo(() => {
    const N = 80;
    const tdPts: Array<{ Te: number; Tc: number }> = [];
    const prPts: Array<{ Te: number; Tc: number }> = [];
    const upperPts: Array<{ Te: number; Tc: number }> = [];
    for (let i = 0; i <= N; i++) {
      const TeI = TE_LO + (i / N) * (TE_HI - TE_LO);
      const tcByTd = tcLimitByTd(TeI);
      const tcByPr = tcLimitByPressureRatio(TeI, refrigerant, tcHi);
      tdPts.push({ Te: TeI, Tc: tcByTd });
      prPts.push({ Te: TeI, Tc: tcByPr });
      const upper = Math.min(tcByTd, tcByPr, tcHi);
      upperPts.push({ Te: TeI, Tc: upper });
    }

    const fmt = (p: { Te: number; Tc: number }) =>
      `${xOf(clip(p.Te, TE_MIN, TE_MAX)).toFixed(1)} ${yOf(clip(p.Tc, TC_MIN_PLOT, TC_MAX_PLOT)).toFixed(1)}`;

    const tdCurve =
      'M ' +
      tdPts
        .filter((p) => p.Tc >= TC_MIN_PLOT - 5 && p.Tc <= TC_MAX_PLOT + 10)
        .map((p, i) => `${i === 0 ? '' : 'L '}${fmt(p)}`)
        .join(' ');

    const prCurve =
      'M ' +
      prPts
        .filter((p) => p.Tc >= TC_MIN_PLOT - 5 && p.Tc <= TC_MAX_PLOT + 10)
        .map((p, i) => `${i === 0 ? '' : 'L '}${fmt(p)}`)
        .join(' ');

    // 安全区多边形：左下 → 上沿（upperPts，左到右）→ 右下 → 闭合
    const safeUpper = upperPts.map(fmt).join(' L ');
    const safePath = `M ${xOf(TE_LO).toFixed(1)} ${yOf(TC_LO).toFixed(1)} L ${safeUpper} L ${xOf(TE_HI).toFixed(1)} ${yOf(TC_LO).toFixed(1)} Z`;

    // 危险区：整图减去安全区。这里偷懒用整张图填红、再叠绿覆盖。
    const dangerPath = `M ${PADDING.left} ${PADDING.top} L ${PADDING.left + PLOT_W} ${PADDING.top} L ${PADDING.left + PLOT_W} ${PADDING.top + PLOT_H} L ${PADDING.left} ${PADDING.top + PLOT_H} Z`;

    return { tdCurve, prCurve, safePath, dangerPath };
  }, [refrigerant, tcHi]);

  // 当前点状态评估：到任何一个边界的距离 ≤ 5°C 则临界，越界则故障
  const tcByTd = tcLimitByTd(Te);
  const tcByPr = tcLimitByPressureRatio(Te, refrigerant, tcHi);
  // marginTd / marginPr 保留注释用途 — 在 CompressorEnvelope.tsx 中作为 T_d / 压比
  // 余量的可视化参考：
  void (TD_LIMIT - Tdischarge);
  void (PR_LIMIT - pressureRatio);
  // marginTd, marginPr 保留为注释用途
  const marginTcTd = tcByTd - Tc;                // 到 T_d 限对应的 T_c 上界
  const marginTcPr = tcByPr - Tc;                // 到压比限对应的 T_c 上界
  const marginTcUp = tcHi - Tc;
  const marginTeLo = Te - TE_LO;
  const marginTeHi = TE_HI - Te;
  const marginTcLo = Tc - TC_LO;

  const violated =
    Tdischarge > TD_LIMIT ||
    pressureRatio > PR_LIMIT ||
    Te < TE_LO ||
    Te > TE_HI ||
    Tc < TC_LO ||
    Tc > tcHi;

  const minMargin = Math.min(
    marginTcTd,
    marginTcPr,
    marginTcUp,
    marginTeLo,
    marginTeHi,
    marginTcLo,
  );
  const critical = !violated && minMargin <= 5;

  const dotColor = violated ? '#ff5c7a' : critical ? '#ffb84d' : '#43f7b5';

  const ptX = clip(xOf(Te), PADDING.left + 4, W - PADDING.right - 4);
  const ptY = clip(yOf(Tc), PADDING.top + 4, H - PADDING.bottom - 4);

  const teTicks = [-30, -20, -10, 0, 10, 20];
  const tcTicks = [25, 35, 45, 55, 65];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: '100%' }}
      role="img"
      aria-label="Compressor operating envelope"
    >
      {/* 越界（淡红）整张铺底 */}
      <path d={dangerPath} fill="rgba(255,92,122,0.04)" />
      {/* 安全区（浅绿）覆盖 */}
      <path d={safePath} fill="rgba(67,247,181,0.06)" stroke="rgba(67,247,181,0.4)" strokeWidth="1" />

      {/* 网格 */}
      {teTicks.map((te) => (
        <line
          key={`gx-${te}`}
          x1={xOf(te)}
          y1={PADDING.top}
          x2={xOf(te)}
          y2={H - PADDING.bottom}
          stroke="rgba(231,243,255,0.05)"
          strokeDasharray="3 6"
        />
      ))}
      {tcTicks.map((tc) => (
        <line
          key={`gy-${tc}`}
          x1={PADDING.left}
          y1={yOf(tc)}
          x2={W - PADDING.right}
          y2={yOf(tc)}
          stroke="rgba(231,243,255,0.05)"
          strokeDasharray="3 6"
        />
      ))}

      {/* 坐标轴 */}
      <line x1={PADDING.left} y1={H - PADDING.bottom} x2={W - PADDING.right} y2={H - PADDING.bottom} stroke="#1e2a3d" strokeWidth="1" />
      <line x1={PADDING.left} y1={PADDING.top} x2={PADDING.left} y2={H - PADDING.bottom} stroke="#1e2a3d" strokeWidth="1" />

      {/* 刻度文字 */}
      {teTicks.map((te) => (
        <text key={`tx-${te}`} x={xOf(te)} y={H - PADDING.bottom + 14} textAnchor="middle" fontSize="10" fill="#9eb5cb">
          {te}
        </text>
      ))}
      {tcTicks.map((tc) => (
        <text key={`ty-${tc}`} x={PADDING.left - 6} y={yOf(tc) + 3} textAnchor="end" fontSize="10" fill="#9eb5cb">
          {tc}
        </text>
      ))}
      <text x={(PADDING.left + W - PADDING.right) / 2} y={H - 10} textAnchor="middle" fontSize="11" fill="#9eb5cb">
        蒸发温度 T_e (°C)
      </text>
      <text
        x={14}
        y={(PADDING.top + H - PADDING.bottom) / 2}
        fontSize="11"
        fill="#9eb5cb"
        transform={`rotate(-90 14 ${(PADDING.top + H - PADDING.bottom) / 2})`}
      >
        冷凝温度 T_c (°C)
      </text>

      {/* 排气温度限：rose */}
      <path d={tdCurve} stroke="#ff5c7a" strokeWidth="1.6" fill="none" strokeDasharray="5 3" />
      {/* 压力比限：amber */}
      <path d={prCurve} stroke="#ffb84d" strokeWidth="1.6" fill="none" strokeDasharray="5 3" />

      {/* 当前工作点 */}
      <circle cx={ptX} cy={ptY} r="11" fill={dotColor} fillOpacity="0.18" />
      <circle cx={ptX} cy={ptY} r="6" fill={dotColor} stroke="#0d1929" strokeWidth="1.5" />

      {/* 制冷剂角标（右上） */}
      <g transform={`translate(${W - PADDING.right - 6}, ${PADDING.top + 6})`}>
        <rect x="-46" y="0" width="46" height="18" rx="4" fill="rgba(125,211,252,0.12)" stroke="rgba(125,211,252,0.4)" strokeWidth="1" />
        <text x="-23" y="13" textAnchor="middle" fontSize="11" fontWeight="600" fill="#7dd3fc">
          {refrigerant}
        </text>
      </g>

      {/* 图例（左上角） */}
      <g transform={`translate(${PADDING.left + 8}, ${PADDING.top + 8})`}>
        <line x1="0" y1="6" x2="14" y2="6" stroke="#ff5c7a" strokeWidth="1.6" strokeDasharray="5 3" />
        <text x="18" y="9" fontSize="10" fill="#9eb5cb">T_d ≤ 110°C</text>
        <line x1="98" y1="6" x2="112" y2="6" stroke="#ffb84d" strokeWidth="1.6" strokeDasharray="5 3" />
        <text x="116" y="9" fontSize="10" fill="#9eb5cb">P_d/P_s ≤ 7</text>
      </g>

      {/* 越界警告文字（图例下方） */}
      {violated && (
        <g>
          <rect
            x={PADDING.left + 8}
            y={PADDING.top + 24}
            width="140"
            height="22"
            rx="4"
            fill="rgba(255,92,122,0.18)"
            stroke="#ff5c7a"
            strokeWidth="1"
          />
          <text x={PADDING.left + 14} y={PADDING.top + 39} fontSize="11" fontWeight="600" fill="#ff5c7a">
            ⚠ 工作点越出包线
          </text>
        </g>
      )}
    </svg>
  );
}
