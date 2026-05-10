import { formatNumber } from '../../utils/format';

interface Props {
  alpha: number;
  beta: number;
  thetaRad: number;
  id: number;
  iq: number;
  size?: number;
}

/**
 * Park 变换 2D 投影图：
 *   - 灰色定子轮廓 + 中心彩色转子盘（带 N/S 极）
 *   - α / β 静止坐标轴（淡灰）
 *   - d 轴沿 N 极方向（绿）；q 轴 +90°（红）
 *   - 输入 Iαβ：青色实箭头
 *   - 输出 Id：绿色粗线段沿 d 轴；Iq：红色粗线段沿 q 轴
 *   - 平行四边形虚线连接 αβ 端点 ↔ Id/Iq 端点，直观展示"分量分解"
 *   - 数值标签固定在 SVG 四角，不和图形挤在一起
 */
export function RotorFrame2D({ alpha, beta, thetaRad, id, iq, size = 380 }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const statorR = size * 0.4;
  const rotorR = size * 0.13;
  const limit = Math.max(8, Math.abs(alpha), Math.abs(beta), Math.abs(id), Math.abs(iq));
  const scale = (size * 0.34) / limit;

  // αβ 矢量端点
  const vx = cx + alpha * scale;
  const vy = cy - beta * scale;

  // d / q 单位方向
  const dx = Math.cos(thetaRad);
  const dy = -Math.sin(thetaRad);
  const qx = Math.cos(thetaRad + Math.PI / 2);
  const qy = -Math.sin(thetaRad + Math.PI / 2);

  // d/q 轴端点（用于画轴线）
  const dHeadX = cx + dx * statorR * 0.85;
  const dHeadY = cy + dy * statorR * 0.85;
  const qHeadX = cx + qx * statorR * 0.85;
  const qHeadY = cy + qy * statorR * 0.85;

  // Id / Iq 投影段端点
  const idEndX = cx + dx * id * scale;
  const idEndY = cy + dy * id * scale;
  const iqEndX = cx + qx * iq * scale;
  const iqEndY = cy + qy * iq * scale;

  // 转子上 N（沿 d 方向）/ S（反方向）
  const npX = cx + dx * rotorR * 0.6;
  const npY = cy + dy * rotorR * 0.6;
  const spX = cx - dx * rotorR * 0.6;
  const spY = cy - dy * rotorR * 0.6;

  // θ 角弧标
  const thetaArcR = 26;
  const thetaNorm = ((thetaRad % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const arcEndX = cx + thetaArcR * Math.cos(thetaNorm);
  const arcEndY = cy - thetaArcR * Math.sin(thetaNorm);
  const largeArc = thetaNorm > Math.PI ? 1 : 0;

  return (
    <div className="rounded-2xl border border-line-subtle bg-bg-base p-4">
      <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto h-[380px] max-w-full">
        <defs>
          <marker id="abArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#34d6ff" />
          </marker>
          <marker id="dArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#43f7b5" />
          </marker>
          <marker id="qArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff5c7a" />
          </marker>
        </defs>

        {/* 静止 αβ 坐标轴（最弱） */}
        <line x1={cx - statorR * 0.95} y1={cy} x2={cx + statorR * 0.95} y2={cy} stroke="#2c3d57" strokeWidth="1" strokeDasharray="2 4" />
        <line x1={cx} y1={cy - statorR * 0.95} x2={cx} y2={cy + statorR * 0.95} stroke="#2c3d57" strokeWidth="1" strokeDasharray="2 4" />
        <text x={cx + statorR + 4} y={cy + 4} fill="#5d7793" fontSize="12">α</text>
        <text x={cx + 6} y={cy - statorR - 4} fill="#5d7793" fontSize="12">β</text>

        {/* 定子外圈 */}
        <circle cx={cx} cy={cy} r={statorR} fill="none" stroke="#1e2a3d" strokeWidth="2" />

        {/* d 轴（绿色虚线 + 箭头） */}
        <line x1={cx} y1={cy} x2={dHeadX} y2={dHeadY}
          stroke="#43f7b5" strokeWidth="1.5" strokeDasharray="6 4" markerEnd="url(#dArrow)" opacity="0.85" />
        <text x={dHeadX + dx * 14} y={dHeadY + dy * 14 + 4} fill="#43f7b5" fontSize="13" fontWeight="700" textAnchor="middle">d</text>

        {/* q 轴 */}
        <line x1={cx} y1={cy} x2={qHeadX} y2={qHeadY}
          stroke="#ff5c7a" strokeWidth="1.5" strokeDasharray="6 4" markerEnd="url(#qArrow)" opacity="0.85" />
        <text x={qHeadX + qx * 14} y={qHeadY + qy * 14 + 4} fill="#ff5c7a" fontSize="13" fontWeight="700" textAnchor="middle">q</text>

        {/* θ 角弧 */}
        {Math.abs(thetaNorm) > 0.05 && thetaNorm < Math.PI * 2 - 0.05 && (
          <>
            <path
              d={`M ${cx + thetaArcR} ${cy} A ${thetaArcR} ${thetaArcR} 0 ${largeArc} 0 ${arcEndX} ${arcEndY}`}
              fill="none" stroke="#9eb5cb" strokeWidth="1.2" />
            <text
              x={cx + (thetaArcR + 12) * Math.cos(thetaNorm / 2)}
              y={cy - (thetaArcR + 12) * Math.sin(thetaNorm / 2) + 4}
              fill="#9eb5cb" fontSize="11" textAnchor="middle">
              θ
            </text>
          </>
        )}

        {/* 平行四边形辅助：从 αβ 端点连到 Id 端点 / Iq 端点 */}
        <line x1={vx} y1={vy} x2={idEndX} y2={idEndY} stroke="#43f7b5" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
        <line x1={vx} y1={vy} x2={iqEndX} y2={iqEndY} stroke="#ff5c7a" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />

        {/* Id 投影段（沿 d 轴粗实线） */}
        <line x1={cx} y1={cy} x2={idEndX} y2={idEndY} stroke="#43f7b5" strokeWidth="4" strokeLinecap="round" />
        <circle cx={idEndX} cy={idEndY} r="4.5" fill="#43f7b5" stroke="#0d1929" strokeWidth="1.5" />

        {/* Iq 投影段 */}
        <line x1={cx} y1={cy} x2={iqEndX} y2={iqEndY} stroke="#ff5c7a" strokeWidth="4" strokeLinecap="round" />
        <circle cx={iqEndX} cy={iqEndY} r="4.5" fill="#ff5c7a" stroke="#0d1929" strokeWidth="1.5" />

        {/* αβ 实际电流矢量（最显眼） */}
        <line x1={cx} y1={cy} x2={vx} y2={vy} stroke="#34d6ff" strokeWidth="3.5" markerEnd="url(#abArrow)" />
        <circle cx={vx} cy={vy} r="5.5" fill="#e7f3ff" stroke="#34d6ff" strokeWidth="2" />

        {/* 转子（最后画，盖在轴线上但保持可见） */}
        <circle cx={cx} cy={cy} r={rotorR} fill="#11203b" stroke="#5d7793" strokeWidth="1.5" />
        <circle cx={npX} cy={npY} r={rotorR * 0.42} fill="#ff5c7a" />
        <text x={npX} y={npY + 4} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="800">N</text>
        <circle cx={spX} cy={spY} r={rotorR * 0.42} fill="#34d6ff" />
        <text x={spX} y={spY + 4} textAnchor="middle" fill="#fff" fontSize="11" fontWeight="800">S</text>

        {/* 数值标签固定四角，不挤画面中心 */}
        <text x="14" y="22" fill="#34d6ff" fontSize="12" fontFamily="Cascadia Code, Consolas, monospace">
          Iαβ ({formatNumber(alpha, 2)}, {formatNumber(beta, 2)})
        </text>
        <text x={size - 14} y="22" textAnchor="end" fill="#9eb5cb" fontSize="12" fontFamily="Cascadia Code, Consolas, monospace">
          θ = {formatNumber((thetaRad * 180) / Math.PI, 0)}°
        </text>
        <text x="14" y={size - 14} fill="#43f7b5" fontSize="12" fontFamily="Cascadia Code, Consolas, monospace">
          Id = {formatNumber(id, 2)} A
        </text>
        <text x={size - 14} y={size - 14} textAnchor="end" fill="#ff5c7a" fontSize="12" fontFamily="Cascadia Code, Consolas, monospace">
          Iq = {formatNumber(iq, 2)} A
        </text>
      </svg>
    </div>
  );
}
