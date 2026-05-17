import { clamp } from '../../utils/clamp';

/**
 * 死区扭曲 (Dead-Time Distortion) 时域仿真。
 *
 * 物理背景：
 *   两电平三相逆变器每相由上下两个 IGBT/MOSFET 组成。理想 PWM 中上下管对称切换：
 *   开通侧导通 → 相电压 = +Udc/2；关断侧导通 → 相电压 = -Udc/2。
 *   平均相电压 = (duty - 0.5) × Udc。
 *
 *   工程实际中为防止上下管直通必须插入死区时间 td (μs)，期间两管同时关闭。
 *   死区窗口内相电压由 *相电流方向* 通过反并联续流二极管决定：
 *     - i_phase > 0 (流出端子): 电流强迫续流到下管二极管 → V_phase = -Udc/2
 *     - i_phase < 0 (流入端子): 电流强迫续流到上管二极管 → V_phase = +Udc/2
 *
 *   每个 PWM 周期发生 *两次* 死区切换（上升沿、下降沿各一次），导致一个与电流方向相反的
 *   平均直流压降偏差：
 *
 *     ΔV_avg = sign(i) × td × f_pwm × Udc        (单位 V)
 *
 *   该误差在低速小电流时占额定电压百分比最大，是死区致音频啸叫、电流过零畸变 (zero-crossing
 *   clamping / current crossover distortion) 的主因。死区补偿 (dead-time compensation)
 *   就是把这个 ΔV 实时加回 Vd/Vq 参考。
 *
 * 单位：deadTimeUs μs，pwmFreqHz Hz，uDc V，windowMs ms。
 * 角度无关——本模型只关心一个 PWM 周期内的开关时序，多个周期通过窗口拼接。
 */
export interface DeadTimeParams {
  /** PWM 频率 Hz，典型 4-16 kHz */
  pwmFreqHz: number;
  /** 死区时间 μs，典型 1-5 μs */
  deadTimeUs: number;
  /** A 相理想占空比 0..1 */
  dutyA: number;
  /** B 相理想占空比 0..1 */
  dutyB: number;
  /** C 相理想占空比 0..1 */
  dutyC: number;
  /** 直流母线电压 V */
  uDc: number;
  /** A 相电流方向 -1 / 0 / +1 */
  iaSign: number;
  /** B 相电流方向 -1 / 0 / +1 */
  ibSign: number;
  /** C 相电流方向 -1 / 0 / +1 */
  icSign: number;
  /** 仿真窗口 ms */
  windowMs: number;
  /** 输出采样点数 */
  points: number;
}

export interface DeadTimeSample {
  /** 时间 ms */
  t: number;
  /** 理想 A 相电压 V，相对母线中点 */
  vaIdeal: number;
  /** 理想 B 相电压 V */
  vbIdeal: number;
  /** 理想 C 相电压 V */
  vcIdeal: number;
  /** 含死区压降的实际 A 相电压 V */
  vaReal: number;
  /** 含死区压降的实际 B 相电压 V */
  vbReal: number;
  /** 含死区压降的实际 C 相电压 V */
  vcReal: number;
  /** A 相该时刻 ideal-real 偏差 V */
  vaError: number;
}

/**
 * 单 PWM 周期内对某一相进行瞬时电压计算。
 * 中心对齐 PWM：在 [0, T] 内导通段位于 [(1-d)·T/2, (1+d)·T/2]。
 * 死区段位于 *每个切换沿前后 td/2*，两段死区合计长度 = td。在死区段电压由电流方向决定。
 */
function instantPhaseVoltage(
  phaseInPeriod: number, // 0..1，PWM 周期内归一化时间
  duty: number,
  uDc: number,
  iSign: number,
  deadFracHalf: number, // td / (2·T)，归一化的"半死区"
): { ideal: number; real: number } {
  const onStart = (1 - duty) * 0.5;
  const onEnd = (1 + duty) * 0.5;
  const half = uDc * 0.5;

  // 理想：开通段 +Udc/2，关断段 -Udc/2
  const ideal = phaseInPeriod >= onStart && phaseInPeriod < onEnd ? half : -half;

  // 死区窗口：上升沿 [onStart - deadFracHalf, onStart + deadFracHalf]
  // 下降沿 [onEnd - deadFracHalf, onEnd + deadFracHalf]
  const inRisingDead = phaseInPeriod >= onStart - deadFracHalf && phaseInPeriod < onStart + deadFracHalf;
  const inFallingDead = phaseInPeriod >= onEnd - deadFracHalf && phaseInPeriod < onEnd + deadFracHalf;

  let real = ideal;
  if (inRisingDead || inFallingDead) {
    // 死区期间两管都关闭，电压由电流续流方向决定。
    // 习惯：iSign>0 表示电流流出端子 → 下管二极管续流 → V = -Udc/2
    //       iSign<0 表示电流流入端子 → 上管二极管续流 → V = +Udc/2
    if (iSign > 0) real = -half;
    else if (iSign < 0) real = half;
    else real = 0; // 电流过零点，死区不产生明确偏差
  }
  return { ideal, real };
}

/**
 * 时域采样：在 windowMs 内按 PWM 周期重复，输出三相理想 vs 实际电压时间序列。
 */
export function simulateDeadTime(p: DeadTimeParams): DeadTimeSample[] {
  const periodSec = 1 / Math.max(p.pwmFreqHz, 1);
  const periodMs = periodSec * 1000;
  const dutyA = clamp(p.dutyA, 0, 1);
  const dutyB = clamp(p.dutyB, 0, 1);
  const dutyC = clamp(p.dutyC, 0, 1);
  const tdSec = p.deadTimeUs * 1e-6;
  // 限制死区不超过半个周期，避免病态参数
  const deadFracHalf = clamp(tdSec / (2 * periodSec), 0, 0.45);
  const points = Math.max(2, Math.floor(p.points));
  const samples: DeadTimeSample[] = [];

  for (let i = 0; i < points; i += 1) {
    const tMs = (i / (points - 1)) * p.windowMs;
    const phase = (tMs % periodMs) / periodMs; // 0..1

    const a = instantPhaseVoltage(phase, dutyA, p.uDc, p.iaSign, deadFracHalf);
    const b = instantPhaseVoltage(phase, dutyB, p.uDc, p.ibSign, deadFracHalf);
    const c = instantPhaseVoltage(phase, dutyC, p.uDc, p.icSign, deadFracHalf);

    samples.push({
      t: tMs,
      vaIdeal: a.ideal,
      vbIdeal: b.ideal,
      vcIdeal: c.ideal,
      vaReal: a.real,
      vbReal: b.real,
      vcReal: c.real,
      vaError: a.ideal - a.real,
    });
  }
  return samples;
}

/**
 * 死区导致的平均相电压误差（解析公式）。
 *
 *   ΔV = sign(i) × td × f_pwm × Udc        (单位 V)
 *
 * 推导：每个 PWM 周期内，死区窗口的总时长 = td（升/降沿各贡献 td/2 但合并积分 = td）。
 * 在 td 内电压偏离理想值 Udc，方向由电流方向决定，故周期平均偏差 = (td / T) × Udc × sign(i)
 * = td × f_pwm × Udc × sign(i)。
 */
export function deadTimeVoltageError(
  deadTimeUs: number,
  pwmFreqHz: number,
  uDc: number,
  currentSign: number,
): number {
  const td = deadTimeUs * 1e-6;
  return Math.sign(currentSign) * td * pwmFreqHz * uDc;
}
