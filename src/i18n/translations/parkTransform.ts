import { e } from '../entries';

/** parkTransform 命名空间（由 translations.ts 机械拆分，语义未变）。 */
export const parkTransform = {
  primaryNote: e(
    '转子带 N/S 极，d 轴沿 N 极方向（绿）、q 轴领先 90°（红）；蓝色箭头是 αβ 静止坐标里的电流矢量。Park 把它分别投影到 d 轴 → Id（绿色实线段）和 q 轴 → Iq（红色实线段）。当 θ 跟住转子时，两个分量都是直流量。',
    'The rotor carries N/S poles; the d axis points along N (green), the q axis leads by 90° (red). The blue arrow is the current vector in the αβ frame. Park projects it onto d → Id (green segment) and q → Iq (red segment). When θ tracks the rotor, both components are DC.',
  ),
  fidelityHint: e('Park 是精确旋转矩阵变换 Id/Iq 来自数学公式', 'Park is an exact rotation; Id/Iq come straight from the formula.'),
  projectionTitle: e('αβ → dq 数学投影', 'αβ → dq projection'),
  projectionEyebrow: e('park projection', 'park projection'),
  vectorPlaneHint: e('拖白点改 αβ', 'Drag the dot to change αβ'),
  projectionNote: e(
    '这边和左边是同一组数据的另一种画法：保留 αβ 网格不动，叠加旋转的 d/q 轴。',
    'This is the same data drawn differently: keep the αβ grid fixed and overlay the rotating d/q axes.',
  ),
  labelIdFlux: e('Id 磁链', 'Id (flux)'),
  labelIqTorque: e('Iq 转矩', 'Iq (torque)'),

  // ---- SerialCompareParkCard ----
  serialTitle: e('Park Id/Iq 理论 vs 实测', 'Park Id/Iq: theory vs measured'),
  serialEyebrow: e('park compare', 'park compare'),
  serialThetaErrPrefix: e('Δθ 注入角度误差 ', 'Δθ injected angle error '),
  serialThetaErrSuffix: e(
    ' · 1° ≈ Iq×sin(Δθ) 的 Id 串扰',
    ' · 1° ≈ Iq×sin(Δθ) of Id crosstalk',
  ),
  serialThetaErrAria: e('θe 注入角度误差（度）', 'θe injected angle error (degrees)'),
  serialAriaDegree: e('度', 'degrees'),
  serialIdChartTitle: e('Id（A）', 'Id (A)'),
  serialIqChartTitle: e('Iq（A）', 'Iq (A)'),
  serialKpiThetaErr: e('Δθ 注入', 'Δθ injected'),
  serialKpiIdCrosstalk: e('Id 串扰峰值', 'Id crosstalk peak'),
  serialKpiIqRmse: e('Iq 跟踪 RMSE', 'Iq tracking RMSE'),
  serialKpiIdMean: e('Id 实测均值', 'Measured Id mean'),
  serialProtocolLead: e('板端协议：t_us, ia, ib, ic, ', 'Board protocol: t_us, ia, ib, ic, '),
  serialProtocolTail: e(
    ' · 浏览器实时 Park。Δθ 不为零 → dq 串扰、PI 错把磁通误差当作转矩误差 → 抖动 / 反转',
    ' · Park runs live in the browser. Non-zero Δθ → dq crosstalk; the PI mistakes flux error for torque error → jitter / reverse rotation',
  ),
  serialSrFault: e('严重', 'severe'),
  serialSrWarn: e('警告', 'warning'),
  serialSrAux: e('辅助', 'auxiliary'),
  serialSrOk: e('正常', 'normal'),
};
