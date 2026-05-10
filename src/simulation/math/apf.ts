import type { APFParams } from '../engine/types';

/**
 * 单相 Boost PFC（功率因数校正）前级简化时域仿真。
 *
 * 拓扑：
 *   AC 电源 → 整流桥 → Boost 电感 L → 直流母线
 *                                     ↓ Boost 开关 + 二极管
 *                                     ↓ 母线电容 C → 负载
 *
 * 控制目标：
 *   1. 输入电流 i_L 跟踪整流后的"|sin|"波形 → 输入端电流近似正弦 → 高功率因数
 *   2. 母线电压 Udc 稳定在目标值 → 给后级压缩机变频器供电
 *
 * 双环结构：
 *   外环（电压环）：u_dc → PI → i_ref（瞬时电流参考的幅值）
 *   内环（电流环）：i_ref · |sin(ωt)| → 与 i_L 比较 → PI → 占空比 d
 *
 * 教学级简化（非完整开关模型）：
 *   - 平均模型：用占空比直接产生升压效果，不仿真 PWM 开关动作
 *   - 整流桥用 |sin| 直接表示
 *   - 输出 60ms 时域窗口，含 3 个完整电网周期
 */

export interface APFSample {
  t: number;             // ms
  vAcInst: number;       // 电网瞬时电压（含正负）
  iLine: number;         // 输入线电流（含正负，反映功率因数）
  iLref: number;         // 电流参考（应跟踪 |sin| 形状）
  iL: number;            // 实际电感电流
  udc: number;           // 母线电压（含纹波）
  duty: number;          // Boost 占空比
}

export interface APFMetrics {
  powerFactor: number;          // 功率因数
  thd: number;                  // 输入电流总谐波失真 %
  udcRipplePct: number;         // 母线纹波百分比
  udcAvg: number;
}

export function simulateAPF(p: APFParams): { samples: APFSample[]; metrics: APFMetrics } {
  const dt = 1e-5;                                  // 100 kHz 内部仿真步
  const TOTAL_SEC = 0.06;                           // 60ms = 3 个 50Hz 周期
  const totalSteps = Math.round(TOTAL_SEC / dt);
  const omega = 2 * Math.PI * p.vAcFreqHz;
  const L = p.boostInductanceMh / 1000;
  const C = p.boostCapacitanceUf / 1e6;
  const Vpeak = p.vAcRms * Math.sqrt(2);

  // 初始化在稳态附近，避免 60ms 窗口被启动瞬态占满看不出 PFC 效果
  // 稳态分析：load 等效消耗 P_load = udc · I_load，从 AC 端取的有功功率应等于 P_load / efficiency
  // 进入电感的电流幅值约 = (udc·I_load) / (Vpeak · 0.5)（半波平均比例）
  const iAmpSteady = Math.max(2, (p.udcRef * p.loadCurrent) / Math.max(50, Vpeak * 0.5));
  let iL = 0;
  let udc = p.udcRef;
  let intCurr = 0;
  let intVolt = iAmpSteady / Math.max(p.voltageKi, 0.1);    // 让电压环输出从一开始就是 iAmpSteady

  const samples: APFSample[] = [];
  let outputCounter = 0;

  // 用于 PF / THD 估算的累加
  let p_active = 0;
  let v_rms_sq_acc = 0;
  let i_rms_sq_acc = 0;
  let i_first_harm_acc = 0;     // 50Hz 基波累加
  let acc_count = 0;
  let udc_sum = 0, udc_min = Infinity, udc_max = -Infinity;

  for (let step = 0; step < totalSteps; step++) {
    const t = step * dt;
    const vAcInst = Vpeak * Math.sin(omega * t);     // 电网瞬时（含正负）
    const vRect = Math.abs(vAcInst);                 // 整流后正弦绝对值

    // 外环：母线电压 PI → 电流参考幅值
    const errV = p.udcRef - udc;
    intVolt += errV * dt;
    const iAmp = p.voltageKp * errV + p.voltageKi * intVolt;
    const iAmpClamped = Math.max(0, Math.min(40, iAmp));

    // 电流参考：跟踪 |sin| 波形
    const iLref = iAmpClamped * Math.abs(Math.sin(omega * t));

    // 内环：电流 PI → 占空比偏置 + 前馈
    // 前馈：稳态 Boost D_ff = 1 - Vrect/Udc，让 PI 只补偿动态偏差
    const dutyFf = 1 - Math.min(0.99, vRect / Math.max(50, udc));
    const errI = iLref - iL;
    intCurr += errI * dt;
    const dutyPi = p.currentKp * errI + p.currentKi * intCurr;
    let duty = dutyFf + dutyPi;
    duty = Math.max(0, Math.min(0.95, duty));

    // Boost 平均模型（连续导通假设）
    // L·di/dt = vRect - (1-d)·udc
    // C·du/dt = (1-d)·iL - i_load - 简化母线放电
    const diL = (vRect - (1 - duty) * udc) / L;
    iL += diL * dt;
    if (iL < 0) iL = 0;       // 整流桥单向

    const dudc = ((1 - duty) * iL - p.loadCurrent) / C;
    udc += dudc * dt;
    if (udc < 50) udc = 50;

    // 输入端线电流：|iL| 跟着电网半波正负翻转
    const iLine = Math.sign(vAcInst) * iL;

    // 累计 PF / THD 量度
    p_active += vAcInst * iLine * dt;
    v_rms_sq_acc += vAcInst * vAcInst * dt;
    i_rms_sq_acc += iLine * iLine * dt;
    i_first_harm_acc += iLine * Math.sin(omega * t) * dt;
    acc_count += dt;
    udc_sum += udc;
    if (udc < udc_min) udc_min = udc;
    if (udc > udc_max) udc_max = udc;

    if (++outputCounter >= 30) {
      outputCounter = 0;
      samples.push({
        t: t * 1000,
        vAcInst,
        iLine,
        iLref,
        iL,
        udc,
        duty,
      });
    }
  }

  // PF / THD 计算（简化）
  const vRms = Math.sqrt(v_rms_sq_acc / acc_count);
  const iRms = Math.sqrt(i_rms_sq_acc / acc_count);
  const apparent = vRms * iRms;
  const powerFactor = apparent > 1e-3 ? Math.abs(p_active / acc_count) / apparent : 0;
  // THD：基波 RMS = sqrt(2)·∫i·sinω/T；其余视为谐波
  const i_fundamental_rms = Math.abs(i_first_harm_acc / acc_count) * Math.sqrt(2);
  const i_harmonic_rms = Math.sqrt(Math.max(0, iRms * iRms - i_fundamental_rms * i_fundamental_rms));
  const thd = i_fundamental_rms > 1e-3 ? (i_harmonic_rms / i_fundamental_rms) * 100 : 0;
  const udcAvg = udc_sum / (totalSteps);
  const udcRipplePct = ((udc_max - udc_min) / Math.max(1, udcAvg)) * 100;

  return {
    samples,
    metrics: {
      powerFactor: Math.min(1, powerFactor),
      thd,
      udcRipplePct,
      udcAvg,
    },
  };
}
