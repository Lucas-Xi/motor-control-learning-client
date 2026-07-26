/**
 * 齿槽前馈 LUT 在线自适应学习。
 *
 * 背景：预计算的 LUT 基于额定工况，但实际运行中齿槽幅值会随温度（永磁 NTC）、
 * 饱和（id 大时）变化。若不更新，补偿残差逐渐增大。
 *
 * 自适应策略（残差跟踪 + 迭代更新 + 遗忘因子）：
 *   1. 在机械角 θ 的每个位置观测残差转矩 T_res = T_actual - T_model
 *   2. 用 LMS（最小均方）算法迭代更新该位置的 LUT 值：
 *        ΔLUT[k] = -μ · T_res(θ) · sign(dT/diq)
 *        LUT_new[k] = (1 - λ) · LUT_old[k] + ΔLUT[k]
 *   3. 遗忘因子 λ 控制历史权重：λ=0 永久记忆，λ>0 逐渐遗忘旧数据
 *
 * 工程实现注意事项：
 *   - 只应在稳态运行（转速波动 < 5%）时启用学习
 *   - 学习率 μ 不能太大（震荡）也不能太小（收敛慢）
 *   - 每个角度 bin 需要多次观测才能收敛（转速较高时积累快）
 *
 * 参考：Ruderman M, "Tracking control of motor drives using feedforward
 *   friction observer", IEEE Trans. Ind. Electron. 2008.
 */

import { type FfcLut } from './coggingCompensation';
import { wrapAngleRad } from '../../utils/clamp';

export interface AdaptiveLutConfig {
  /** 学习率 μ，默认 0.01。太大=震荡，太小=收敛慢。范围 0.001~0.1 */
  learningRate: number;
  /** 遗忘因子 λ，0-1。0=永久记忆，1=完全不记忆（瞬态）。推荐 0.01~0.1 */
  forgetFactor: number;
  /** 转矩常数 Kt (N·m/A)，用于将残差转矩折算为 iq 修正量 */
  torqueConstant: number;
  /** 启用学习的转速波动阈值（相对值），默认 0.05（5%） */
  speedRippleThreshold: number;
}

export interface AdaptiveLutState {
  /** 已更新的 LUT 副本（每次 learn() 调用后返回新副本） */
  lut: FfcLut;
  /** 每 bin 累计观测次数 */
  observationCount: Float64Array;
  /** 累计残差转矩（Nm），用于诊断 */
  cumulativeResidual: number;
  /** 当前学习是否活跃 */
  isLearning: boolean;
  /** 学习率 μ */
  learningRate: number;
  /** 遗忘因子 λ */
  forgetFactor: number;
  /** 转矩常数 Kt (N·m/A) */
  torqueConstant: number;
  /** 转速波动阈值 */
  speedRippleThreshold: number;
}

/**
 * 创建自适应 LUT 状态机。
 * 从一个预计算的静态 LUT 开始，后续运行中持续更新。
 */
export function createAdaptiveLut(
  initialLut: FfcLut,
  config: Partial<AdaptiveLutState> = {},
): AdaptiveLutState {
  const {
    learningRate = 0.01,
    forgetFactor = 0.02,
    torqueConstant = 1.0,
    speedRippleThreshold = 0.05,
  } = config as Partial<AdaptiveLutState>;

  return {
    lut: {
      size: initialLut.size,
      values: new Float64Array(initialLut.values),
      stepRad: initialLut.stepRad,
    },
    observationCount: new Float64Array(initialLut.size),
    cumulativeResidual: 0,
    isLearning: false,
    learningRate,
    forgetFactor,
    torqueConstant,
    speedRippleThreshold,
  };
}

/**
 * 执行一次学习步骤。
 *
 * @param state 自适应状态（会被原地修改）
 * @param thetaMechanicalRad 当前机械角度（rad）
 * @param residualTorqueNm 当前观测到的残差转矩（Nm），正=欠补偿
 * @param speedRipple 当前转速波动（相对值，0.01=1%）
 * @param dt 时间步长（s）
 * @returns 更新后的 state 引用
 */
export function adaptiveLutStep(
  state: AdaptiveLutState,
  thetaMechanicalRad: number,
  residualTorqueNm: number,
  speedRipple: number,
  dt: number,
): AdaptiveLutState {
  const {
    learningRate, forgetFactor, torqueConstant, speedRippleThreshold,
  } = state;

  // 仅转速平稳时学习
  state.isLearning = speedRipple < speedRippleThreshold;

  if (!state.isLearning) {
    return state;
  }

  // 角度索引
  const wrapped = wrapAngleRad(thetaMechanicalRad);
  const positive = wrapped < 0 ? wrapped + 2 * Math.PI : wrapped;
  const idxF = positive / state.lut.stepRad;
  const i0 = Math.floor(idxF) % state.lut.size;
  const i1 = (i0 + 1) % state.lut.size;
  const frac = idxF - Math.floor(idxF);

  // 残差转矩 → iq 修正量
  const diq = -(learningRate / Math.max(torqueConstant, 1e-12)) * residualTorqueNm;

  // 分配到相邻两个 bin（线性插值的逆向分配）
  const update0 = diq * (1 - frac);
  const update1 = diq * frac;

  // 遗忘 + 更新
  state.lut.values[i0] = state.lut.values[i0] * (1 - forgetFactor * dt) + update0;
  state.lut.values[i1] = state.lut.values[i1] * (1 - forgetFactor * dt) + update1;

  // 统计
  state.observationCount[i0] += 1 * (1 - frac);
  state.observationCount[i1] += 1 * frac;
  state.cumulativeResidual += Math.abs(residualTorqueNm) * dt;

  return state;
}

/**
 * 重置自适应 LUT 到初始状态。
 */
export function resetAdaptiveLut(
  state: AdaptiveLutState,
  initialLut: FfcLut,
): AdaptiveLutState {
  state.lut.values = new Float64Array(initialLut.values);
  state.observationCount.fill(0);
  state.cumulativeResidual = 0;
  state.isLearning = false;
  return state;
}

export interface AdaptiveLutDiagnostics {
  /** 有多少个 bin 被观测过至少一次 */
  binsTrained: number;
  /** 训练覆盖率（%） */
  coveragePct: number;
  /** 最大观测次数 */
  maxObservations: number;
  /** 平均观测次数（仅已训练的 bin） */
  avgObservations: number;
  /** 累计残差能量（Nm·s） */
  cumulativeEnergy: number;
  /** 当前 LUT 相对初始 LUT 的最大变化量（A） */
  maxDelta: number;
}

/**
 * 自适应 LUT 诊断统计。
 */
export function diagnoseAdaptiveLut(
  state: AdaptiveLutState,
  initialLut: FfcLut,
): AdaptiveLutDiagnostics {
  let trained = 0;
  let sumObs = 0;
  let maxObs = 0;
  let maxDelta = 0;

  for (let k = 0; k < state.lut.size; k++) {
    if (state.observationCount[k] > 0.5) {
      trained++;
      sumObs += state.observationCount[k];
      maxObs = Math.max(maxObs, state.observationCount[k]);
    }
    const delta = Math.abs(state.lut.values[k] - initialLut.values[k]);
    maxDelta = Math.max(maxDelta, delta);
  }

  return {
    binsTrained: trained,
    coveragePct: (trained / state.lut.size) * 100,
    maxObservations: maxObs,
    avgObservations: trained > 0 ? sumObs / trained : 0,
    cumulativeEnergy: state.cumulativeResidual,
    maxDelta,
  };
}