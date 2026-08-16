/**
 * 机械共振模型 — 2 质量弹簧阻尼系统 (2-Mass Spring-Damper)。
 *
 * 电机控制中，联轴器和负载侧的机械谐振是速度环带宽的硬约束。
 * 最常见的模型是"两个转动惯量中间夹一个弹簧阻尼"：
 *
 *   电机 ──[K_s, C_s]── 负载
 *     J1                    J2
 *
 * 传递函数（从电机电磁转矩到电机转速）：
 *   G(s) = ω1(s) / Te(s) = (J2·s² + C_s·s + K_s) /
 *            s·[J1·J2·s² + (J1+J2)·C_s·s + (J1+J2)·K_s]
 *
 * 系统特征：
 *   - 共振频率（ARF）：两质量同相振动，等效惯量 = J1+J2，频率较高
 *   - 反共振频率（NRF）：两质量反相振动，等效惯量 → 0，频率较低
 *   - 在反共振频率处，电机转速对电磁转矩的增益急剧下降（"陷波"）
 *   - 在共振频率处，增益急剧上升（"峰值"）→ 速度环振荡
 *
 * 工程意义：
 *   - 反共振频率限制了速度环带宽的上限
 *   - 共振频率导致轴转矩振荡（可被扭振传感器检测到）
 *   - 陷波滤波器（notch filter）放在速度环输出端，可抑制共振峰值
 *   - 现代伺服驱动普遍使用 2 质量模型设计速度环 + 陷波
 *
 * 参考：
 *   - Ellis G, "Control System Design Guide", 4th Ed, Ch.12
 *   - Bösing M, "Modeling and Control of Mechanical Systems", RWTH Aachen
 */

export interface TwoMassParams {
  /** 电机侧惯量（kg·m²） */
  j1: number;
  /** 负载侧惯量（kg·m²） */
  j2: number;
  /** 轴刚度（Nm/rad），刚度越大，共振频率越高 */
  shaftStiffness: number;
  /** 轴阻尼（Nm·s/rad），阻尼越大，共振峰越低 */
  shaftDamping: number;
}

export interface TwoMassState {
  /** 电机转速（rad/s） */
  omega1: number;
  /** 电机机械角度（rad） */
  theta1: number;
  /** 负载转速（rad/s） */
  omega2: number;
  /** 负载机械角度（rad） */
  theta2: number;
  /** 轴转矩（Nm） */
  shaftTorque: number;
}

export interface TwoMassStepInput {
  /** 电磁转矩（Nm） */
  te: number;
  /** 负载转矩（Nm） */
  loadTorque: number;
  /** 时间步长（s） */
  dt: number;
}

export interface TwoMassResult {
  state: TwoMassState;
  /** 电机加速度（rad/s²） */
  alpha1: number;
  /** 负载加速度（rad/s²） */
  alpha2: number;
}

/**
 * 2 质量弹簧阻尼系统单步仿真。
 */
export function stepTwoMass(
  state: TwoMassState,
  params: TwoMassParams,
  input: TwoMassStepInput,
): TwoMassResult {
  const { j1, j2, shaftStiffness, shaftDamping } = params;
  const { te, loadTorque, dt } = input;
  const { theta1, theta2, omega1, omega2 } = state;

  // 角度差 → 轴转矩
  const deltaTheta = theta1 - theta2;
  const deltaOmega = omega1 - omega2;
  const shaftTorque = shaftStiffness * deltaTheta + shaftDamping * deltaOmega;

  // 运动方程
  // J1·dω1/dt = Te - T_shaft
  // J2·dω2/dt = T_shaft - T_load
  const alpha1 = (te - shaftTorque) / Math.max(j1, 1e-12);
  const alpha2 = (shaftTorque - loadTorque) / Math.max(j2, 1e-12);

  const newOmega1 = omega1 + alpha1 * dt;
  const newOmega2 = omega2 + alpha2 * dt;
  const newTheta1 = theta1 + newOmega1 * dt;
  const newTheta2 = theta2 + newOmega2 * dt;

  return {
    state: {
      omega1: newOmega1,
      theta1: newTheta1,
      omega2: newOmega2,
      theta2: newTheta2,
      shaftTorque,
    },
    alpha1,
    alpha2,
  };
}

export interface ResonanceAnalysis {
  /** 反共振频率（Hz） */
  antiResonanceFreq: number;
  /** 共振频率（Hz） */
  resonanceFreq: number;
  /** 反共振角频率（rad/s） */
  antiResonanceOmega: number;
  /** 共振角频率（rad/s） */
  resonanceOmega: number;
  /** 刚度比（反共振频率/共振频率） */
  stiffnessRatio: number;
  /** 等效总惯量 */
  totalInertia: number;
  /** 共振峰品质因数（高 Q = 尖锐峰值，需要精确陷波） */
  qualityFactor: number;
  /** 电机侧共振增益（dB，相对低频增益） */
  resonanceGainDb: number;
}

/**
 * 计算 2 质量系统的共振/反共振频率。
 *
 * 传递函数极点：
 *   s·[J1·J2·s² + (J1+J2)·C_s·s + (J1+J2)·K_s] = 0
 *
 * 忽略阻尼时：
 *   ω_ar = sqrt(K_s / J2)        （反共振频率 — 分子零点）
 *   ω_r  = sqrt(K_s·(J1+J2) / (J1·J2))   （共振频率 — 分母极点）
 */
export function analyzeResonance(params: TwoMassParams): ResonanceAnalysis {
  const { j1, j2, shaftStiffness, shaftDamping } = params;
  const J1 = Math.max(j1, 1e-12);
  const J2 = Math.max(j2, 1e-12);
  const K = shaftStiffness;
  const C = shaftDamping;

  const totalInertia = J1 + J2;

  // 反共振角频率（无阻尼）
  const omegaAR = Math.sqrt(K / J2);

  // 共振角频率（无阻尼）
  const omegaR = Math.sqrt(K * (J1 + J2) / (J1 * J2));

  // 品质因数（Q = 峰值高度 / 带宽）
  // Q ≈ sqrt(K·J1·J2) / (C·(J1+J2))
  const qFactor = C > 1e-12
    ? Math.sqrt(K * J1 * J2) / (C * totalInertia)
    : 50;

  // 共振增益：峰值增益 / 低频增益
  // 低频时 G(s) ≈ 1/(s·(J1+J2))，峰值 ≈ 1/(C·s)
  // 增益比 ≈ (J1+J2) / C  （阻尼决定峰值高度）
  const resonanceGainDb = C > 1e-12
    ? 20 * Math.log10(totalInertia / C)
    : 40;

  return {
    antiResonanceFreq: omegaAR / (2 * Math.PI),
    resonanceFreq: omegaR / (2 * Math.PI),
    antiResonanceOmega: omegaAR,
    resonanceOmega: omegaR,
    stiffnessRatio: omegaAR / Math.max(omegaR, 1e-12),
    totalInertia,
    qualityFactor: qFactor,
    resonanceGainDb,
  };
}

/**
 * 频率响应：在给定频率处计算传递函数的幅值和相位。
 *
 * 传递函数：G(jω) = ω1/Te = (J2·s² + C·s + K) /
 *                          s·[J1·J2·s² + (J1+J2)·C·s + (J1+J2)·K]
 *
 * 等效地，令 s = jω：
 *   分子 = K - J2·ω² + j·C·ω
 *   分母 = -ω²·(J1+J2)·C + j·ω·[(J1+J2)·K - J1·J2·ω²]
 *
 * 验证：分母 = jω · (J1·J2·(jω)² + (J1+J2)·C·jω + (J1+J2)·K)
 *            = jω · (-J1·J2·ω² + (J1+J2)·K + j·(J1+J2)·C·ω)
 *            = jω·(-J1·J2·ω² + (J1+J2)·K) - ω·(J1+J2)·C·ω
 *            = -(J1+J2)·C·ω² + j·ω·[(J1+J2)·K - J1·J2·ω²]
 *
 * @param freqHz 频率（Hz）
 * @returns { mag: 幅值 (rad/s per Nm), phaseDeg: 相位 (°) }
 *
 * 计算复数传递函数 G(jω) = ω1/Te：
 *   分子 = K - J2·ω² + j·C·ω
 *   分母 = -(J1+J2)·C·ω² + j·ω·[(J1+J2)·K - J1·J2·ω²]
 */
export function frequencyResponse(
  freqHz: number,
  params: TwoMassParams,
): { mag: number; phaseDeg: number } {
  const { j1, j2, shaftStiffness, shaftDamping } = params;
  const omega = 2 * Math.PI * freqHz;
  const J1 = Math.max(j1, 1e-12);
  const J2 = Math.max(j2, 1e-12);
  const K = shaftStiffness;
  const C = shaftDamping;

  // 分子 = K - J2·ω² + j·C·ω
  const numRe = K - J2 * omega * omega;
  const numIm = C * omega;

  // 分母 = -(J1+J2)·C·ω² + j·ω·[(J1+J2)·K - J1·J2·ω²]
  const denRe = -(J1 + J2) * C * omega * omega;
  const denIm = omega * ((J1 + J2) * K - J1 * J2 * omega * omega);

  // 复数除法
  const denMag2 = denRe * denRe + denIm * denIm;
  if (denMag2 < 1e-20) return { mag: 1e6, phaseDeg: 0 };

  const resRe = (numRe * denRe + numIm * denIm) / denMag2;
  const resIm = (numIm * denRe - numRe * denIm) / denMag2;

  const mag = Math.sqrt(resRe * resRe + resIm * resIm);
  const phaseDeg = Math.atan2(resIm, resRe) * 180 / Math.PI;

  return { mag, phaseDeg };
}

/**
 * 生成频率响应扫频数据。
 */
export function sweepFrequencyResponse(
  params: TwoMassParams,
  freqMinHz = 0.5,
  freqMaxHz = 500,
  pointsPerDecade = 20,
): Array<{ freqHz: number; mag: number; magDb: number; phaseDeg: number }> {
  const data: Array<{ freqHz: number; mag: number; magDb: number; phaseDeg: number }> = [];
  const decades = Math.log10(freqMaxHz / freqMinHz);
  const totalPoints = Math.ceil(decades * pointsPerDecade);

  for (let i = 0; i <= totalPoints; i++) {
    const frac = i / totalPoints;
    const freqHz = freqMinHz * Math.pow(10, frac * decades);
    const { mag, phaseDeg } = frequencyResponse(freqHz, params);
    data.push({
      freqHz,
      mag,
      magDb: 20 * Math.log10(Math.max(mag, 1e-20)),
      phaseDeg,
    });
  }

  return data;
}

export interface TwoMassStepTrace {
  t: number;
  omega1: number;
  omega2: number;
  shaftTorque: number;
}

/** 恒定电磁转矩阶跃，返回电机/负载转速与轴转矩轨迹。 */
export function simulateTwoMassTorqueStep(
  params: TwoMassParams,
  te: number,
  duration = 0.08,
  dt = 0.0002,
): TwoMassStepTrace[] {
  let state: TwoMassState = {
    omega1: 0,
    theta1: 0,
    omega2: 0,
    theta2: 0,
    shaftTorque: 0,
  };
  const traces: TwoMassStepTrace[] = [{
    t: 0,
    omega1: 0,
    omega2: 0,
    shaftTorque: 0,
  }];
  const steps = Math.max(1, Math.round(duration / Math.max(dt, 1e-9)));
  for (let i = 1; i <= steps; i++) {
    const r = stepTwoMass(state, params, { te, loadTorque: 0, dt });
    state = r.state;
    traces.push({
      t: i * dt,
      omega1: state.omega1,
      omega2: state.omega2,
      shaftTorque: state.shaftTorque,
    });
  }
  return traces;
}

/** 在扫频数据里找幅值峰值对应的频率（用于测试/标注）。 */
export function findSweepPeakFreq(
  sweep: Array<{ freqHz: number; mag: number }>,
): number {
  if (sweep.length === 0) return 0;
  let bestFreq = sweep[0].freqHz;
  let bestMag = sweep[0].mag;
  for (let i = 1; i < sweep.length; i++) {
    if (sweep[i].mag > bestMag) {
      bestMag = sweep[i].mag;
      bestFreq = sweep[i].freqHz;
    }
  }
  return bestFreq;
}
