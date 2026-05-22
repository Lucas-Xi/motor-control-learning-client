/**
 * 机械刚性 + 共振 + Backlash 双质量传动模型（工业最后一公里第 3 项）。
 *
 * **为什么需要**：
 *   motorModel.ts 把电机+负载当作单质量（J = J_motor + J_load）。真实传动链是双质量：
 *     - 电机转子 J_motor 通过弹性轴/皮带/联轴器 → 负载 J_load
 *     - 弹性轴有有限刚度 K_s（Nm/rad）和阻尼 D_s（Nm·s/rad）
 *     - 中间还可能有 backlash（齿轮间隙、键槽松动）
 *   忽略这些 → 学员永远看不到"速度环 Kp 一调高就 200 Hz 共振啸叫"的真实现象。
 *
 * **公式（双质量 + 弹性轴 + backlash）**：
 *   J_m × dω_m/dt = T_em − T_spring
 *   J_l × dω_l/dt = T_spring − T_load_ext
 *
 *   T_spring = K_s × max(0, |Δθ| − backlash/2) × sign(Δθ) + D_s × (ω_m − ω_l)
 *     其中 Δθ = θ_m − θ_l（电机相对负载的扭转角）
 *     backlash 区内：T_spring = D_s × (ω_m − ω_l)（无弹性扭矩，仅黏滞）
 *
 * **共振 / 反共振频率**：
 *   ω_resonance = sqrt(K_s × (J_m + J_l) / (J_m × J_l))
 *   ω_antiresonance = sqrt(K_s / J_l)
 *   速度环 Kp 必须 ≤ ω_antiresonance / 5 否则激发共振
 *
 * **典型工况**：
 *   - 直驱（家用空调压缩机）：K_s 巨大（几乎刚性），共振 > 2 kHz，不影响 FOC
 *   - 皮带传动（工业风机）：K_s 小，共振 200-500 Hz，速度环带宽必须低于此
 *   - 高精度伺服（机器人关节）：K_s 中等 + 谐波减速器 backlash 可见
 *
 * **参考**：
 *   - Schäfer & Brandenburg, "State position control for elastic
 *     pointing and tracking systems", EPE 1989
 *   - Vukosavic & Stojic, "Suppression of torsional oscillations in a
 *     high-performance speed servo drive", IEEE Trans. Ind. Electron. 45(1), 1998
 *   - 阮毅《电力拖动自动控制系统》§9.4 弹性传动机构
 *
 * **STM32 移植**：本模块是"在仿真里加共振"；真实控制器对偶 → 用陷波滤波器（biquad notch
 * @ resonance freq）消除速度反馈中的共振峰，或用观测器估计 ω_load 做主动阻尼。
 */

export interface ComplianceParams {
  /** 电机转子转动惯量 J_motor (kg·m²) */
  Jmotor: number;
  /** 负载转动惯量 J_load (kg·m²) */
  Jload: number;
  /** 轴扭转刚度 K_s (Nm/rad) */
  Ks: number;
  /** 轴阻尼系数 D_s (Nm·s/rad) */
  Ds: number;
  /** Backlash 间隙 (rad)，0 表示无间隙 */
  backlashRad: number;
}

export interface ComplianceState {
  /** 电机机械角度 (rad) */
  thetaMotor: number;
  /** 负载机械角度 (rad) */
  thetaLoad: number;
  /** 电机机械角速度 (rad/s) */
  omegaMotor: number;
  /** 负载机械角速度 (rad/s) */
  omegaLoad: number;
  /** 当前弹簧（轴）扭矩 (N·m)，供观察 */
  Tspring: number;
}

export function createComplianceState(): ComplianceState {
  return {
    thetaMotor: 0,
    thetaLoad: 0,
    omegaMotor: 0,
    omegaLoad: 0,
    Tspring: 0,
  };
}

export interface ComplianceStepInput {
  /** 电机电磁转矩 T_em (N·m)，来自 FOC 电流环 */
  Tem: number;
  /** 外部负载扭矩 T_load_ext (N·m)，作用在负载侧（如压缩机阀片力） */
  TloadExt: number;
  /** 步长 (s) */
  dt: number;
  params: ComplianceParams;
  state: ComplianceState;
}

/**
 * 双质量传动单步推进。
 *
 * @example
 *   // 皮带驱动：K_s=200 Nm/rad，电机 J=2e-4，负载 J=1e-3
 *   let st = createComplianceState();
 *   const params = { Jmotor: 2e-4, Jload: 1e-3, Ks: 200, Ds: 0.05, backlashRad: 0.005 };
 *   for (let k = 0; k < 1000; k++) {
 *     const r = stepCompliance({ Tem: 0.5, TloadExt: 0.3, dt: 1e-4, params, state: st });
 *     st = r;
 *   }
 *   // st.omegaMotor 应接近稳态；过程中可看到共振振荡
 */
export function stepCompliance(input: ComplianceStepInput): ComplianceState {
  const { params, state } = input;
  // 自适应子步长：双质量是刚性 ODE，Euler 在 dt > 1/(10·ω_res) 时发散。
  // 这里按共振周期自动切到子步长（最少 1 子步、最多 50 子步，保持调用方语义）。
  const omegaR = Math.sqrt(
    params.Ks * (params.Jmotor + params.Jload) / Math.max(1e-12, params.Jmotor * params.Jload),
  );
  const maxStableDt = 0.2 / Math.max(1, omegaR);     // 经验：dt < 0.2/ω_res
  const nSub = Math.min(50, Math.max(1, Math.ceil(input.dt / maxStableDt)));
  const dtSub = input.dt / nSub;

  let thetaMotor = state.thetaMotor;
  let thetaLoad = state.thetaLoad;
  let omegaMotor = state.omegaMotor;
  let omegaLoad = state.omegaLoad;
  let Tspring = 0;
  const bHalf = params.backlashRad / 2;

  for (let s = 0; s < nSub; s += 1) {
    const dTheta = thetaMotor - thetaLoad;
    let TspringElastic = 0;
    if (dTheta > bHalf) {
      TspringElastic = params.Ks * (dTheta - bHalf);
    } else if (dTheta < -bHalf) {
      TspringElastic = params.Ks * (dTheta + bHalf);
    }
    const TspringDamping = params.Ds * (omegaMotor - omegaLoad);
    Tspring = TspringElastic + TspringDamping;

    const dOmegaMotor = (input.Tem - Tspring) / Math.max(1e-9, params.Jmotor);
    const dOmegaLoad = (Tspring - input.TloadExt) / Math.max(1e-9, params.Jload);
    omegaMotor += dOmegaMotor * dtSub;
    omegaLoad += dOmegaLoad * dtSub;
    thetaMotor += omegaMotor * dtSub;
    thetaLoad += omegaLoad * dtSub;
  }

  return { thetaMotor, thetaLoad, omegaMotor, omegaLoad, Tspring };
}

/**
 * 算共振 / 反共振频率（Hz）。
 *
 * - resonanceHz：电机和负载相对扭转的固有频率
 * - antiResonanceHz：负载侧自由振荡频率（电机锁死时）
 */
export function resonanceFrequencies(params: ComplianceParams): {
  resonanceHz: number;
  antiResonanceHz: number;
  resonanceRadS: number;
  antiResonanceRadS: number;
} {
  const Jm = Math.max(1e-9, params.Jmotor);
  const Jl = Math.max(1e-9, params.Jload);
  const omegaR = Math.sqrt(params.Ks * (Jm + Jl) / (Jm * Jl));
  const omegaAR = Math.sqrt(params.Ks / Jl);
  return {
    resonanceHz: omegaR / (2 * Math.PI),
    antiResonanceHz: omegaAR / (2 * Math.PI),
    resonanceRadS: omegaR,
    antiResonanceRadS: omegaAR,
  };
}

/**
 * 估算速度环 Kp 上限（速度环带宽 < 反共振频率 / 5 是经典工程经验）。
 */
export function maxSpeedLoopBandwidth(params: ComplianceParams): number {
  const { antiResonanceHz } = resonanceFrequencies(params);
  return antiResonanceHz / 5;
}

/**
 * 典型机械传动样本。
 */
export const sampleComplianceParams = {
  /** 家用 1.5HP 压缩机直驱：刚性传动，共振 > 1 kHz */
  directDriveCompressor: {
    Jmotor: 1.8e-4,
    Jload: 0.5e-4,
    Ks: 20000,    // 几乎刚性
    Ds: 0.5,
    backlashRad: 0,
  } satisfies ComplianceParams,
  /** 工业风机皮带传动：共振 ~200-400 Hz */
  industrialFanBelt: {
    Jmotor: 5e-3,
    Jload: 2e-2,
    Ks: 14000,
    Ds: 2,
    backlashRad: 0,
  } satisfies ComplianceParams,
  /** 机器人关节谐波减速器：可见 backlash + 共振 ~150-200 Hz */
  roboticJoint: {
    Jmotor: 1.2e-3,
    Jload: 8e-3,
    Ks: 1500,
    Ds: 0.15,
    backlashRad: 0.012,    // 0.7° backlash
  } satisfies ComplianceParams,
  /** 老化设备：刚度降 + backlash 加大 */
  agedDrive: {
    Jmotor: 1.2e-3,
    Jload: 8e-3,
    Ks: 800,
    Ds: 0.04,
    backlashRad: 0.025,
  } satisfies ComplianceParams,
};
