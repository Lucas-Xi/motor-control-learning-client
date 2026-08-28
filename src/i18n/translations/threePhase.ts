import { e } from '../entries';

/** threePhase 命名空间（由 translations.ts 机械拆分，语义未变）。 */
export const threePhase = {
  primaryTitle: e('三相定子截面与合成磁场', 'Three-phase stator cross-section and resultant field'),
  primaryEyebrow: e('stator cross-section', 'stator cross-section'),
  primaryNote: e(
    'A / B / C 三相绕组放在 120° 等分位置；圆点 ⊙ 表示电流流出纸面，⊗ 流入；亮度对应 |I|。中心绿色箭头是三相电流合成的旋转磁场矢量；尾巴的浅绿点是它走过的轨迹。',
    'A / B / C three-phase windings are spaced 120° apart; ⊙ marks current flowing out of the page, ⊗ into the page; brightness scales with |I|. The green arrow at the centre is the resultant rotating field, with a fading trail.',
  ),
  alphaBetaTitle: e('αβ 静止坐标矢量', 'αβ stationary-frame vector'),
  alphaBetaEyebrow: e('clarke output', 'clarke output'),
  vectorPlaneHint: e('拖白点直接改 αβ', 'Drag the dot to change αβ'),
  alphaBetaNote: e(
    'Clarke 把 abc 三相投影成 (α, β)。运行时这个箭头与左侧定子箭头方向一致，但坐标系是静止的——观察它如何沿单位圆旋转。',
    'Clarke maps the abc currents to (α, β). At runtime this arrow shares the same direction as the stator arrow on the left, but the axes stay stationary — watch it sweep around the unit circle.',
  ),
  fidelityHint: e(
    '三相 sin 生成 + Clarke 投影是精确数学，幅值/相位/谐波/不平衡都按公式注入',
    'Three-phase sinusoid generation + Clarke projection is exact math; amplitude / phase / harmonics / imbalance are injected by formula.',
  ),

  // ---- SerialCompareThreePhaseCard ----
  serialTitle: e('三相 ia/ib/ic 理论 vs 实测', 'Three-phase ia/ib/ic: theory vs measured'),
  serialEyebrow: e('three-phase compare', 'three-phase compare'),
  serialIcGainPrefix: e('ic LEM 增益 ', 'ic LEM gain '),
  serialIcGainAria: e('ic 通道 LEM 增益系数', 'ic channel LEM gain factor'),
  serialAriaTimes: e('倍', 'times'),
  serialAdcBiasPrefix: e('ADC 偏置 ', 'ADC bias '),
  serialAdcBiasAria: e('ADC 直流偏置（A）', 'ADC DC bias (A)'),
  serialAriaAmpere: e('安培', 'amps'),
  serialRealChartTitle: e('实测 ia/ib/ic（A）', 'Measured ia/ib/ic (A)'),
  serialKclChartTitle: e('KCL 残差 = ia+ib+ic（A）', 'KCL residual = ia+ib+ic (A)'),
  serialKpiKcl: e('KCL 残差 RMS', 'KCL residual RMS'),
  serialKpiIcGain: e('ic 增益估算', 'ic gain estimate'),
  serialKpiImbalance: e('αβ 模长波动', 'αβ magnitude spread'),
  serialKpiSamples: e('窗口样本数', 'Window samples'),
  serialFrameUnit: e('帧', 'frames'),
  serialProtocolLead: e('板端协议：t_us, ', 'Board protocol: t_us, '),
  serialProtocolTail: e(
    ' · 滑块模拟 LEM 增益偏差 + ADC 直流偏置；KCL 残差非零 → ADC 校准 / 共模偏置问题',
    ' · the sliders emulate LEM gain error + ADC DC bias; a non-zero KCL residual points to ADC calibration / common-mode bias issues',
  ),
  serialSrFault: e('严重偏差', 'severe deviation'),
  serialSrWarn: e('警告偏差', 'warning deviation'),
  serialSrAux: e('辅助值', 'auxiliary value'),
  serialSrOk: e('正常', 'normal'),
};
