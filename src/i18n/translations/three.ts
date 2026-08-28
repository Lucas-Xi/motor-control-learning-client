import { e } from '../entries';

/** three 命名空间：3D 场景组件（电机 / 逆变器 / 磁场 / 六边形等）。 */
export const three = {
  ariaPeriod: e('。', '.'),
  // Inverter3D
  inverterAriaLead: e('三维三相逆变桥：A 相占空比 ', '3D three-phase inverter bridge: phase A duty '),
  inverterAriaDutyB: e('，B 相占空比 ', ', phase B duty '),
  inverterAriaDutyC: e('，C 相占空比 ', ', phase C duty '),
  // MagneticField3D
  fieldAriaLead: e('三维三相旋转磁场：合成磁场角度 ', '3D three-phase rotating field: resultant field angle '),
  fieldAriaCurrentBase: e('，电流基准 ', ', current base '),
  fieldBadge: e('三相旋转磁场', '3-phase rotating field'),
  // Motor3D
  motorAriaLead: e('三维 PMSM 视图：极对数 ', '3D PMSM view: pole pairs '),
  motorAriaTheta: e('，电角度 ', ', electrical angle '),
  motorAriaCurrentVec: e('，合成电流矢量 ', ', resultant current vector '),
  motorAriaDirection: e('，方向 ', ', direction '),
  // RotorFluxScene
  rotorFluxAriaLead: e('三维 αβ-dq 矢量空间：θ_e=', '3D αβ-dq vector space: θ_e='),
  rotorFluxAriaImag: e('，|I|=', ', |I|='),
  rotorFluxAriaId: e('，Id=', ', Id='),
  rotorFluxAriaIq: e('，Iq=', ', Iq='),
  // SensorlessAngleScene3D
  sensorlessAriaLead: e('三维无感角度对比：真实角 ', '3D sensorless angle comparison: true angle '),
  sensorlessAriaEstimated: e('，估算角 ', ', estimated angle '),
  sensorlessAriaError: e('，误差 ', ', error '),
  sensorlessBadge: e('真实 θ · 估算 θ', 'true θ · estimated θ'),
  // MotorAssembly3D
  assemblyAriaLabel: e(
    '三维电机装配视图：定子、绕组、转子沿轴向展开，帮助理解整机搭建关系。',
    '3D motor assembly view: stator, windings and rotor exploded along the shaft axis to show how the machine fits together.',
  ),
  // AlphaBetaProjection3D
  clarkeAriaLead: e('三维 Clarke 投影：Iα=', '3D Clarke projection: Iα='),
  clarkeAriaIbeta: e(' A，Iβ=', ' A, Iβ='),
  clarkeAriaTail: e(
    ' A，零序由三相不平衡决定。',
    ' A; the zero-sequence term depends on three-phase imbalance.',
  ),
  // SvpwmHexagon3D
  svpwmAriaLead: e('三维 SVPWM 六边形：当前扇区 ', '3D SVPWM hexagon: current sector '),
  svpwmAriaUalpha: e('，Uα=', ', Uα='),
  svpwmAriaUbeta: e(' V，Uβ=', ' V, Uβ='),
  // CurrentLimitSpace3D
  currentLimitAriaLead: e('三维弱磁限幅空间：Id=', '3D field-weakening limit space: Id='),
  currentLimitAriaIq: e(' A，Iq=', ' A, Iq='),
  currentLimitAriaVoltage: e(' A，电压利用率 ', ' A, voltage utilization '),
};
