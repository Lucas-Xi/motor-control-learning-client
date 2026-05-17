import { useMemo } from 'react';

/**
 * MTPA / MTPV / 电流极限圆 / 电压极限椭圆 — IPM 电机操作图（Operating Map）
 *
 * 数学约定（电气量、统一国际单位）：
 *   - τ = 1.5 · Pp · [ψf · Iq + (Ld − Lq) · Id · Iq]   （PMSM dq 转矩方程）
 *     其中 IPM 通常 Lq > Ld，因此 (Ld − Lq) < 0；最大转矩出现在 Id < 0 且 Iq > 0 区域。
 *   - 电流极限圆: Id² + Iq² ≤ I_max²
 *   - 电压极限椭圆（理想稳态、忽略 Rs 压降）:
 *       (Ld·Id + ψf)² + (Lq·Iq)² ≤ (V_max / ω_e)²
 *       中心位于 (−ψf/Ld, 0)；ω_e 增大时椭圆收缩 → 必须把 Id 推到更负侧。
 *   - MTPA 曲线: 给定 |I|，沿 β ∈ [−π/2, 0] 数值寻优 max τ；轨迹从原点出发向 −Id/+Iq 弧。
 *   - MTPV 曲线: 当 ω_e 高到电压撞限时仍要找最大转矩，简化为 Id ≈ −ψf/Ld 附近的轨迹。
 */
export interface MtpaCurveProps {
  id: number;            // A，凸极 IPM 弱磁工况通常为负
  iq: number;            // A
  ld: number;            // mH
  lq: number;            // mH（IPM: Lq > Ld）
  flux: number;          // Wb，永磁磁链 ψf
  polePairs: number;
  ratedCurrent: number;  // A，电流极限
  rpm: number;           // 机械转速
  uDc: number;           // V，母线电压
}

const W = 480;
const H = 360;
const PAD = { left: 56, right: 18, top: 22, bottom: 44 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

// 平面范围（A）：Id 从弱磁负向到一点正向；Iq 仅展示正向（电动模式）
const ID_MIN = -30;
const ID_MAX = 5;
const IQ_MIN = -5;
const IQ_MAX = 30;

const xOf = (id: number) =>
  PAD.left + ((id - ID_MIN) / (ID_MAX - ID_MIN)) * PLOT_W;
const yOf = (iq: number) =>
  PAD.top + (1 - (iq - IQ_MIN) / (IQ_MAX - IQ_MIN)) * PLOT_H;

/** 给定电流幅值，沿角度 β 求最大转矩点 (Id,Iq) */
function mtpaPoint(magnitude: number, ld: number, lq: number, flux: number, polePairs: number) {
  let bestTau = -Infinity;
  let bestBeta = 0;
  // β ∈ [0, π/2]：Id = −|I| sin β（≤0），Iq = |I| cos β（≥0）
  for (let i = 0; i <= 90; i += 1) {
    const beta = (i / 90) * (Math.PI / 2);
    const idTry = -magnitude * Math.sin(beta);
    const iqTry = magnitude * Math.cos(beta);
    const tau = 1.5 * polePairs * (flux * iqTry + (ld - lq) * idTry * iqTry);
    if (tau > bestTau) {
      bestTau = tau;
      bestBeta = beta;
    }
  }
  return {
    id: -magnitude * Math.sin(bestBeta),
    iq: magnitude * Math.cos(bestBeta),
    tau: bestTau,
  };
}

export function MtpaCurve({
  id,
  iq,
  ld,
  lq,
  flux,
  polePairs,
  ratedCurrent,
  rpm,
  uDc,
}: MtpaCurveProps) {
  const ldH = ld / 1000;
  const lqH = lq / 1000;
  const omegaE = ((rpm * 2 * Math.PI) / 60) * polePairs;
  const vMax = uDc / Math.sqrt(3);
  // 椭圆"半径"（电压撞限时 Id² 项的最大允许偏差）
  const ellipseScale = omegaE > 1 ? vMax / omegaE : Infinity;

  // -- MTPA 曲线点序列 ----------------------------------------------------
  const mtpaPath = useMemo(() => {
    const samples = 28;
    const pts: string[] = [];
    for (let i = 0; i <= samples; i += 1) {
      const mag = (i / samples) * ratedCurrent;
      const p = mtpaPoint(mag, ldH, lqH, flux, polePairs);
      pts.push(`${xOf(p.id).toFixed(2)},${yOf(p.iq).toFixed(2)}`);
    }
    return `M ${pts.join(' L ')}`;
  }, [ldH, lqH, flux, polePairs, ratedCurrent]);

  // -- 当前工作点是否在 MTPA 上（容差 1 A） -----------------------------
  const onMtpa = useMemo(() => {
    const mag = Math.hypot(id, iq);
    if (mag < 0.5) return true;
    const p = mtpaPoint(mag, ldH, lqH, flux, polePairs);
    return Math.hypot(p.id - id, p.iq - iq) < 1.0;
  }, [id, iq, ldH, lqH, flux, polePairs]);

  // -- 电压极限椭圆参数 ---------------------------------------------------
  // (Ld·Id + ψf)² + (Lq·Iq)² = ellipseScale²
  // → 中心 Id_c = −ψf/Ld，半轴 a = ellipseScale/Ld，b = ellipseScale/Lq
  const ellipseCenterId = -flux / ldH;
  const aId = Number.isFinite(ellipseScale) ? ellipseScale / ldH : 0;
  const bIq = Number.isFinite(ellipseScale) ? ellipseScale / lqH : 0;

  // 椭圆采样（用 polyline 避免 SVG ellipse 对非中心坐标系适配麻烦）
  const ellipsePath = useMemo(() => {
    if (!Number.isFinite(ellipseScale) || aId < 0.1) return '';
    const N = 96;
    const pts: string[] = [];
    for (let i = 0; i <= N; i += 1) {
      const th = (i / N) * 2 * Math.PI;
      const idV = ellipseCenterId + aId * Math.cos(th);
      const iqV = bIq * Math.sin(th);
      pts.push(`${xOf(idV).toFixed(2)},${yOf(iqV).toFixed(2)}`);
    }
    return `M ${pts.join(' L ')} Z`;
  }, [ellipseScale, aId, bIq, ellipseCenterId]);

  // -- 电压撞限判定：当前 (Id,Iq) 是否在椭圆外 -------------------------
  const voltageSat = useMemo(() => {
    if (!Number.isFinite(ellipseScale)) return false;
    const lhs = (ldH * id + flux) ** 2 + (lqH * iq) ** 2;
    return lhs > ellipseScale ** 2;
  }, [ellipseScale, ldH, lqH, id, iq, flux]);

  // -- MTPV 曲线: Id ≈ −ψf/Ld 处沿 Iq 方向延展 ------------------------
  // 简化：在椭圆中心处沿 Iq 一段竖线（仅当电压椭圆比电流圆紧时显示）
  const showMtpv = Number.isFinite(ellipseScale) && aId < ratedCurrent;
  const mtpvPath = useMemo(() => {
    if (!showMtpv) return '';
    const idC = ellipseCenterId;
    const iqMax = Math.min(IQ_MAX - 1, Math.sqrt(Math.max(0, ratedCurrent ** 2 - idC ** 2)));
    if (!Number.isFinite(iqMax) || iqMax < 0.5) return '';
    return `M ${xOf(idC).toFixed(2)},${yOf(0).toFixed(2)} L ${xOf(idC).toFixed(2)},${yOf(iqMax).toFixed(2)}`;
  }, [showMtpv, ellipseCenterId, ratedCurrent]);

  // -- 等转矩双曲线（背景，Iq = τ_const / [1.5·Pp·(ψf + (Ld−Lq)·Id)]） --
  const torqueIsoPaths = useMemo(() => {
    const peakI = ratedCurrent;
    const peakTau = 1.5 * polePairs * flux * peakI; // 大致量级
    const tauList = [0.2, 0.4, 0.6, 0.8, 1.0].map((k) => k * peakTau);
    return tauList.map((tau) => {
      const pts: string[] = [];
      const samples = 80;
      for (let i = 0; i <= samples; i += 1) {
        const idV = ID_MIN + (i / samples) * (ID_MAX - ID_MIN);
        const denom = 1.5 * polePairs * (flux + (ldH - lqH) * idV);
        if (Math.abs(denom) < 1e-6) continue;
        const iqV = tau / denom;
        if (iqV < IQ_MIN || iqV > IQ_MAX) continue;
        pts.push(`${xOf(idV).toFixed(2)},${yOf(iqV).toFixed(2)}`);
      }
      return pts.length > 1 ? `M ${pts.join(' L ')}` : '';
    }).filter(Boolean);
  }, [ldH, lqH, flux, polePairs, ratedCurrent]);

  // -- 工作点颜色 ---------------------------------------------------------
  const overCurrent = Math.hypot(id, iq) > ratedCurrent * 1.02;
  const dotColor = overCurrent ? '#fb7185' : voltageSat ? '#ffb84d' : onMtpa ? '#43f7b5' : '#34d6ff';

  // 电流极限圆参数
  const cx = xOf(0);
  const cy = yOf(0);
  // 电流圆是真圆但 X/Y 像素比例不同 → 用 path 椭圆采样
  const currentCirclePath = useMemo(() => {
    const N = 96;
    const pts: string[] = [];
    for (let i = 0; i <= N; i += 1) {
      const th = (i / N) * 2 * Math.PI;
      const idV = ratedCurrent * Math.cos(th);
      const iqV = ratedCurrent * Math.sin(th);
      pts.push(`${xOf(idV).toFixed(2)},${yOf(iqV).toFixed(2)}`);
    }
    return `M ${pts.join(' L ')} Z`;
  }, [ratedCurrent]);

  // -- 坐标刻度 -----------------------------------------------------------
  const idTicks = [-30, -20, -10, 0];
  const iqTicks = [0, 10, 20, 30];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', width: '100%', height: '100%' }}
      role="img"
      aria-label="IPM operating map (MTPA / MTPV / current and voltage limits)"
    >
      {/* 背景 */}
      <rect x={0} y={0} width={W} height={H} fill="#0d1929" rx="14" />

      {/* 绘图区边框 */}
      <rect
        x={PAD.left}
        y={PAD.top}
        width={PLOT_W}
        height={PLOT_H}
        fill="rgba(255,92,122,0.03)"
        stroke="#1e2a3d"
        strokeWidth="1"
      />

      {/* 等转矩双曲线（浅灰背景） */}
      {torqueIsoPaths.map((d, i) => (
        <path
          key={`iso-${i}`}
          d={d}
          fill="none"
          stroke="rgba(231,243,255,0.10)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      ))}

      {/* 主坐标轴 */}
      <line x1={PAD.left} y1={cy} x2={W - PAD.right} y2={cy} stroke="#2a3a52" strokeWidth="1" />
      <line x1={cx} y1={PAD.top} x2={cx} y2={H - PAD.bottom} stroke="#2a3a52" strokeWidth="1" />

      {/* 刻度 */}
      <g fontSize="10" fill="#5d7793" fontFamily="Cascadia Code, Consolas, monospace">
        {idTicks.map((t) => (
          <g key={`xt-${t}`}>
            <line x1={xOf(t)} y1={cy - 3} x2={xOf(t)} y2={cy + 3} stroke="#3a4a62" />
            <text x={xOf(t)} y={H - PAD.bottom + 14} textAnchor="middle">{t}</text>
          </g>
        ))}
        {iqTicks.map((t) => (
          <g key={`yt-${t}`}>
            <line x1={cx - 3} y1={yOf(t)} x2={cx + 3} y2={yOf(t)} stroke="#3a4a62" />
            <text x={PAD.left - 6} y={yOf(t) + 3} textAnchor="end">{t}</text>
          </g>
        ))}
        <text x={W - PAD.right - 4} y={cy - 6} textAnchor="end" fill="#9eb5cb">Id (A)</text>
        <text x={cx + 6} y={PAD.top + 10} fill="#9eb5cb">Iq (A)</text>
      </g>

      {/* 电流极限圆（cyan、虚线） */}
      <path
        d={currentCirclePath}
        fill="rgba(52,214,255,0.04)"
        stroke="#34d6ff"
        strokeWidth="1.6"
        strokeDasharray="6 5"
      />

      {/* 电压极限椭圆（amber） */}
      {ellipsePath && (
        <path
          d={ellipsePath}
          fill={voltageSat ? 'rgba(255,184,77,0.08)' : 'rgba(255,184,77,0.05)'}
          stroke="#ffb84d"
          strokeWidth="1.6"
        />
      )}

      {/* MTPA 曲线（mint） */}
      <path d={mtpaPath} fill="none" stroke="#43f7b5" strokeWidth="2.2" />

      {/* MTPV 曲线（rose）— 仅在电压椭圆收缩到电流圆内才显示 */}
      {mtpvPath && (
        <path
          d={mtpvPath}
          fill="none"
          stroke="#fb7185"
          strokeWidth="1.8"
          strokeDasharray="4 3"
        />
      )}

      {/* 当前工作点 */}
      <circle cx={xOf(id)} cy={yOf(iq)} r={7} fill={dotColor} stroke="#e7f3ff" strokeWidth="1.5" />
      <line
        x1={cx}
        y1={cy}
        x2={xOf(id)}
        y2={yOf(iq)}
        stroke={dotColor}
        strokeWidth="1.2"
        opacity="0.45"
      />

      {/* 图例 */}
      <g
        fontSize="10"
        fontFamily="Cascadia Code, Consolas, monospace"
        transform={`translate(${PAD.left + 6} ${PAD.top + 6})`}
      >
        <rect x={0} y={0} width={150} height={showMtpv ? 76 : 60} fill="rgba(13,25,41,0.78)" stroke="#1e2a3d" rx="6" />
        <g transform="translate(8 14)">
          <line x1={0} y1={0} x2={18} y2={0} stroke="#34d6ff" strokeWidth="2" strokeDasharray="6 5" />
          <text x={24} y={3} fill="#9eb5cb">电流极限圆</text>
        </g>
        <g transform="translate(8 30)">
          <line x1={0} y1={0} x2={18} y2={0} stroke="#ffb84d" strokeWidth="2" />
          <text x={24} y={3} fill="#9eb5cb">电压极限椭圆</text>
        </g>
        <g transform="translate(8 46)">
          <line x1={0} y1={0} x2={18} y2={0} stroke="#43f7b5" strokeWidth="2" />
          <text x={24} y={3} fill="#9eb5cb">MTPA</text>
        </g>
        {showMtpv && (
          <g transform="translate(8 62)">
            <line x1={0} y1={0} x2={18} y2={0} stroke="#fb7185" strokeWidth="2" strokeDasharray="4 3" />
            <text x={24} y={3} fill="#9eb5cb">MTPV</text>
          </g>
        )}
      </g>

      {/* 状态徽章 */}
      <g transform={`translate(${W - PAD.right - 132} ${PAD.top + 6})`}>
        <rect x={0} y={0} width={132} height={22} rx="6"
          fill={overCurrent ? 'rgba(251,113,133,0.18)' : voltageSat ? 'rgba(255,184,77,0.16)' : onMtpa ? 'rgba(67,247,181,0.14)' : 'rgba(52,214,255,0.14)'}
          stroke={dotColor} strokeWidth="1" />
        <text x={66} y={15} textAnchor="middle" fontSize="11" fontWeight="700" fill={dotColor}>
          {overCurrent ? '电流越界' : voltageSat ? '电压撞限·弱磁' : onMtpa ? '运行在 MTPA' : '过渡区'}
        </text>
      </g>
    </svg>
  );
}
