/**
 * 电机热模型闭环仿真。
 *
 * 将 thermalRsFlux（温度→Rs/ψf 补偿 + 一阶热模型）与 motorModelHd（电磁+损耗计算）
 * 双向闭环耦合，实现温度→参数→损耗→温度的完整反馈。
 *
 * 工作流程（每 dt 步）：
 *   1. 读取当前 windingTempC
 *   2. 调用 stepPmsmModelHd() → 得到铜损 + 铁损 + 机械输出
 *   3. 总损耗 = Pcu + Pfe
 *   4. 调用 stepThermal() → 推进温度 windingTempC
 *   5. 回到 1
 *
 * 物理效应：
 *   - 温度↑ → Rs↑（PTC，+0.393%/K）→ 铜损↑ → 温度↑↑ （正反馈）
 *   - 温度↑ → 永磁 flux↓（NTC，-0.12%/K）→ 转矩效率↓ → 同转矩需要更大 iq → 铜损↑
 *   - 由这些效应导致的热失控是电机设计的核心约束之一
 */

import {
  stepPmsmModelHd,
  type MotorModelHdConfig,
  type MotorModelHdInput,
} from './motorModelHd';
import {
  stepThermal,
  defaultThermalParams,
  type ThermalParams,
} from './thermalRsFlux';
import { createPmsmState } from './motorModel';
import { clamp } from '../../utils/clamp';

export interface ThermalSimInput {
  /** 环境温度（°C），默认 25 */
  ambientC?: number;
  /** 初始绕组温度（°C），默认 25 */
  initialTempC?: number;
  /** 热模型参数 */
  thermalParams?: ThermalParams;
  /** 电机 HD 配置（含所有子模型参数） */
  config: MotorModelHdConfig;
  /** 仿真步长（s），默认 0.001 */
  dt?: number;
  /** 仿真时长（s），默认 5 */
  duration?: number;
  /** d 轴电压（V） */
  vd: number;
  /** q 轴电压（V） */
  vq: number;
  /** 负载转矩（Nm） */
  loadTorque: number;
  /** 初始转速（rpm），默认 0 */
  initialRpm?: number;
}

export interface ThermalSimPoint {
  t: number;
  windingTempC: number;
  rs: number;
  flux: number;
  omegaRpm: number;
  id: number;
  iq: number;
  copperLossW: number;
  ironLossW: number;
  totalLossW: number;
  torqueNm: number;
  demagAlarm: boolean;
  demagMarginK: number;
  /** 热稳态占比（0=刚启动，1=已稳态） */
  thermalSettledPct: number;
}

export interface ThermalSimResult {
  points: ThermalSimPoint[];
  /** 最终稳态温度（°C），取最后 10% 数据的平均值 */
  steadyTempC: number;
  /** 热时间常数（s），温度从初始上升到 63% 稳态的时间 */
  thermalTimeConstant: number;
  /** 是否发生热失控 */
  thermalRunaway: boolean;
  /** 最高温度（°C） */
  peakTempC: number;
  /** 退磁报警次数 */
  demagAlarmCount: number;
}

/**
 * 运行闭环热仿真。
 */
export function simulateThermal(input: ThermalSimInput): ThermalSimResult {
  const {
    ambientC = 25,
    initialTempC = 25,
    thermalParams = defaultThermalParams,
    config,
    dt = 0.001, duration = 5,
    vd, vq, loadTorque,
    initialRpm = 0,
  } = input;

  const steps = Math.ceil(duration / dt);

  let windingTempC = initialTempC;
  let omegaRadS = initialRpm * Math.PI / 30;
  let state = createPmsmState();
  state.omegaMechanical = omegaRadS;

  const points: ThermalSimPoint[] = [];

  for (let step = 0; step < steps; step++) {
    const t = step * dt;

    // 调用高保真模型
    const hdInput: MotorModelHdInput = {
      vd, vq,
      loadTorque,
      dt,
      windingTempC,
      config,
      state,
    };

    const result = stepPmsmModelHd(hdInput);

    omegaRadS = result.state.omegaMechanical;
    state = result.state;

    const pcu = result.diagnostics.copperLossW;
    const pfe = result.diagnostics.ironLossW;
    const totalLossW = pcu + pfe;

    // 热模型推进
    windingTempC = stepThermal(windingTempC, ambientC, totalLossW, dt, thermalParams);

    // 热稳态占比
    const tSteady = ambientC + totalLossW * thermalParams.RthermalKW;
    const thermalSettledPct = tSteady > initialTempC
      ? clamp((windingTempC - initialTempC) / Math.max(tSteady - initialTempC, 1), 0, 1)
      : 1;

    points.push({
      t,
      windingTempC,
      rs: result.diagnostics.rsCompensated,
      flux: result.diagnostics.fluxCompensated,
      omegaRpm: result.state.omegaMechanical * 30 / Math.PI,
      id: result.state.id,
      iq: result.state.iq,
      copperLossW: pcu,
      ironLossW: pfe,
      totalLossW,
      torqueNm: result.state.torque,
      demagAlarm: result.diagnostics.demagAlarm,
      demagMarginK: 0, // motorModelHd 不输出 margin
      thermalSettledPct,
    });
  }

  // 稳态分析（最后 10%）
  const last10Pct = points.slice(Math.floor(points.length * 0.9));
  const steadyTempC = last10Pct.length > 0
    ? last10Pct.reduce((s, p) => s + p.windingTempC, 0) / last10Pct.length
    : windingTempC;

  // 热时间常数（63% 上升时间）
  const tempRange = steadyTempC - initialTempC;
  const threshold63 = initialTempC + 0.63 * tempRange;
  let thermalTimeConstant = duration;
  for (const p of points) {
    if (p.windingTempC >= threshold63) {
      thermalTimeConstant = p.t;
      break;
    }
  }

  const peakTempC = Math.max(...points.map((p) => p.windingTempC));
  const thermalRunaway = peakTempC > 200;
  const demagAlarmCount = points.filter((p) => p.demagAlarm).length;

  return {
    points,
    steadyTempC,
    thermalTimeConstant,
    thermalRunaway,
    peakTempC,
    demagAlarmCount,
  };
}

/** 从轨迹抽稀，给 UI 用。 */
export function downsampleThermalPoints<T>(points: T[], maxPoints: number): T[] {
  if (maxPoints <= 0) return [];
  if (points.length <= maxPoints) return points;
  const lastIdx = points.length - 1;
  const out: T[] = [];
  for (let k = 0; k < maxPoints - 1; k++) {
    const i = Math.round((k * lastIdx) / (maxPoints - 1));
    out.push(points[i]);
  }
  out.push(points[lastIdx]);
  return out;
}
