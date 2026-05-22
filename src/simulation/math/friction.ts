/**
 * 复合摩擦模型：Stribeck + Coulomb + 黏性。
 *
 * **为什么需要**：
 *   - 仅"黏性 B·ω"是高中物理简化；真实电机轴承摩擦含 3 个组分：
 *     1. 静摩擦 T_static（启动瞬间最大，rad/s=0 时仍存在）
 *     2. Coulomb 摩擦 T_coulomb（恒值，与方向同号但与速度大小无关）
 *     3. 黏性摩擦 B·ω（流体阻力，线性递增）
 *   - **Stribeck 效应**：极低速段（0 < ω < ω_stribeck ≈ 5-10 rad/s）总摩擦从 T_static 平滑下降到 T_coulomb，
 *     形成"摩擦下凹谷"。这就是为啥压缩机"启动卡死再突然窜出"——力矩越过 T_static 后突然只剩 T_coulomb。
 *
 * **公式**（Armstrong-Hélouvry 1991）：
 *   T_friction(ω) = sign(ω) × [T_coulomb + (T_static − T_coulomb) × exp(−(|ω| / ω_stribeck)²)] + B × ω
 *
 * **参考**：
 *   - Armstrong-Hélouvry B, "Control of Machines with Friction", Kluwer 1991
 *   - Olsson H et al., "Friction models and friction compensation", Eur. J. Control 4(3), 1998
 *
 * **STM32 移植**：低速启动时前馈一个估计的 T_static 帮助克服静摩擦；
 *   IPM 压缩机典型 T_static ≈ 1.5 × T_coulomb，ω_stribeck ≈ 8 rad/s。
 */

export interface FrictionParams {
  /** 静摩擦力矩 (N·m)，启动瞬间需要克服的最大值 */
  Tstatic: number;
  /** Coulomb 摩擦力矩 (N·m)，与速度大小无关的恒值 */
  Tcoulomb: number;
  /** 黏性摩擦系数 B (N·m·s/rad) */
  B: number;
  /** Stribeck 速度 (rad/s)，"摩擦谷"宽度 */
  omegaStribeck: number;
}

/**
 * 给定机械角速度 + 摩擦参数算出当前摩擦力矩。
 *
 * @example
 *   // 压缩机刚启动 ω=0.1 rad/s
 *   const T = compoundFriction(0.1, { Tstatic: 0.15, Tcoulomb: 0.10, B: 0.0008, omegaStribeck: 8 });
 *   // T ≈ +0.149 N·m（接近 T_static，Stribeck 项还没衰减）
 *   //
 *   // 同样压缩机 ω=10 rad/s（电机已转起来）
 *   // T ≈ +0.108 N·m（主要是 Coulomb + 一点黏性）
 */
export function compoundFriction(omegaRadS: number, params: FrictionParams): number {
  const absOmega = Math.abs(omegaRadS);
  const stribeckRatio = absOmega / Math.max(1e-3, params.omegaStribeck);
  const stribeckTerm =
    params.Tcoulomb + (params.Tstatic - params.Tcoulomb) * Math.exp(-stribeckRatio * stribeckRatio);
  return Math.sign(omegaRadS) * stribeckTerm + params.B * omegaRadS;
}

/**
 * 检查给定驱动力矩是否能克服当前静摩擦。
 *
 * @returns true 表示电机会动；false 表示卡死（学员"启动失歩"典型现象）
 */
export function canOvercomeStatic(Tdrive: number, params: FrictionParams): boolean {
  return Math.abs(Tdrive) > params.Tstatic;
}

/**
 * 典型摩擦参数样本。
 */
export const sampleFrictionParams = {
  /** 海立 1.5HP 压缩机（额定 ~1 N·m，启动需要 ~0.15 N·m 克服） */
  hitachi15HP: {
    Tstatic: 0.15,
    Tcoulomb: 0.10,
    B: 0.0008,
    omegaStribeck: 8,
  } satisfies FrictionParams,
  /** 干净的伺服电机（高精度轴承） */
  servo: {
    Tstatic: 0.02,
    Tcoulomb: 0.015,
    B: 0.00005,
    omegaStribeck: 3,
  } satisfies FrictionParams,
  /** 老化压缩机（轴承磨损 + 油位低，Stribeck 谷加深） */
  agedCompressor: {
    Tstatic: 0.35,
    Tcoulomb: 0.18,
    B: 0.0012,
    omegaStribeck: 12,
  } satisfies FrictionParams,
};
