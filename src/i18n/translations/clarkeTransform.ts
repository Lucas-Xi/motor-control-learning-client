import { e } from '../entries';

/** clarkeTransform 命名空间（由 translations.ts 机械拆分，语义未变）。 */
export const clarkeTransform = {
  primaryTitle: e('αβ 矢量平面', 'αβ vector plane'),
  primaryEyebrow: e('clarke output', 'clarke output'),
  vectorPlaneHint: e('拖拽白点直接改变 αβ', 'Drag the dot to change αβ'),
  fidelityHint: e('Clarke 是精确矩阵变换，输出与教科书一致', 'Clarke is an exact matrix transform — output matches textbook.'),
  abcTitle: e('abc 三相输入', 'abc three-phase input'),
  abcEyebrow: e('phase currents', 'phase currents'),
  matrixTitle: e('变换矩阵', 'Transform matrix'),
  matrixEyebrow: e('abc → αβ0', 'abc → αβ0'),

  // ---- SerialCompareClarkeCard ----
  serialTitle: e('Clarke α/β 理论 vs 实测', 'Clarke α/β: theory vs measured'),
  serialEyebrow: e('clarke compare', 'clarke compare'),
  serialIcGainPrefix: e('ic 通道增益 ', 'ic channel gain '),
  serialIcGainSuffix: e('（圆/椭圆切换）', ' (circle/ellipse toggle)'),
  serialIcGainAria: e(
    'ic 通道增益系数（影响 αβ 轨迹圆/椭圆形态）',
    'ic channel gain factor (shapes the αβ trajectory into a circle or ellipse)',
  ),
  serialAriaTimes: e('倍', 'times'),
  serialAlphaChartTitle: e('α 实测 vs 理论（A）', 'α measured vs theory (A)'),
  serialBetaChartTitle: e('β 实测 vs 理论（A）', 'β measured vs theory (A)'),
  serialTrajectoryTitle: e(
    'αβ 平面轨迹（圆=平衡 / 椭圆=不平衡）',
    'αβ plane trajectory (circle = balanced / ellipse = unbalanced)',
  ),
  serialTrajectoryAria: e(
    'αβ 平面散点轨迹，实测线越接近圆形说明三相越平衡',
    'αβ scatter trajectory — the closer the measured trace is to a circle, the better the three phases are balanced',
  ),
  serialKpiRmse: e('α/β 跟踪 RMSE', 'α/β tracking RMSE'),
  serialKpiEllipticity: e('轨迹椭圆度', 'Trajectory ellipticity'),
  serialKpiZeroSeq: e('零序分量 RMS', 'Zero-sequence RMS'),
  serialKpiAxisRatio: e('长/短轴比', 'Long/short axis ratio'),
  serialProtocolLead: e('板端协议：t_us, ', 'Board protocol: t_us, '),
  serialProtocolTail: e(
    ' · 浏览器实时 Clarke。圆 → 平衡；椭圆 → ic 增益失配；偏离原点 → ADC 偏置',
    ' · Clarke runs live in the browser. Circle → balanced; ellipse → ic gain mismatch; off-origin → ADC bias',
  ),
  serialSrFault: e('严重', 'severe'),
  serialSrWarn: e('警告', 'warning'),
  serialSrAux: e('辅助', 'auxiliary'),
  serialSrOk: e('正常', 'normal'),

  // ---- ClarkeTransformModule 补遗 ----
  waveOverlayTitle: e('αβ 波形叠加', 'αβ waveform overlay'),
  waveOverlayEyebrow: e('虚线=abc · 实线=αβ', 'dashed = abc · solid = αβ'),
};
