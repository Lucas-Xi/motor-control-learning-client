/**
 * Boost PFC 开关级仿真（Switching-Level PFC Simulation）。
 *
 * 对比平均模型（boostPfc.ts），开关级仿真在 PWM 周期尺度解析：
 *   - 三角载波比较 → 占空比决定开关动作
 *   - 开关开时 L 充电（电流上升），关时 L 放电（电流下降）
 *   - 电感电流纹波（Δi_L）：决定磁芯损耗和 EMI 的源头
 *   - 开关管/二极管导通损耗
 *
 * 适用场景：
 *   1. 验证电流纹波 vs 电感值的关系
 *   2. EMI 滤波器设计（纹波频率 = fs）
 *   3. 轻载 DCM（断续导通）边界检测
 *
 * 拓扑：单相全桥整流 + Boost PFC
 *   v_rect = |v_grid|（理想整流桥，忽略管压降）
 *   开关 S 导通：L 储能，i_L 上升
 *   开关 S 关断：L 通过 D 向 C 放电，i_L 下降
 *
 * 参考：
 *   - R. W. Erickson, "Fundamentals of Power Electronics", 3rd Ed.
 *   - TI SLUA144A
 */

export interface SwitchingPfcInput {
  /** 电网电压 RMS（V） */
  vAcRms: number;
  /** 电网频率（Hz） */
  freqHz: number;
  /** 母线参考电压（V） */
  udcRef: number;
  /** Boost 电感（μH） */
  lUh: number;
  /** 电感等效串联电阻（mΩ），默认 50 */
  lEsrMohm?: number;
  /** 母线电容（μF） */
  cUf: number;
  /** 电容等效串联电阻（mΩ），默认 100 */
  cEsrMohm?: number;
  /** 负载电流（A） */
  loadCurrent: number;
  /** PWM 开关频率（Hz） */
  pwmFs: number;
  /** 电流环 Kp */
  currentKp: number;
  /** 电流环 Ki */
  currentKi: number;
  /** 电压环 Kp（外环，控制母线电压） */
  voltageKp?: number;
  /** 电压环 Ki */
  voltageKi?: number;
  /** 仿真时长（交流周期数），默认 3 */
  cycles?: number;
}

export interface SwitchingPfcPoint {
  /** 时间（s） */
  t: number;
  /** 电网电压（V） */
  vGrid: number;
  /** 整流后电压（V） */
  vRect: number;
  /** 母线电压（V） */
  udc: number;
  /** 电感电流（A） */
  iL: number;
  /** 电网侧电流（A，= sign(v_grid) × iL） */
  iGrid: number;
  /** 占空比 */
  duty: number;
  /** 开关状态：0=关断，1=导通 */
  switchOn: boolean;
  /** 三角载波值（0-1） */
  carrier: number;
}

export interface SwitchingPfcResult {
  points: SwitchingPfcPoint[];
  /** 电网电流 THD（%，仅前 40 次） */
  thd: number;
  /** 功率因数 */
  pf: number;
  /** 输出平均电压（V） */
  udcAvg: number;
  /** 输出电压纹波（V，峰峰） */
  udcRipple: number;
  /** 电感电流有效值（A） */
  iLRms: number;
  /** 电感电流纹波（A，峰峰） */
  iLRipple: number;
  /** 开关频率纹波占比 */
  switchingRippleRatio: number;
}

/**
 * 简单的 FFT 辅助（用于 THD 计算）。
 */
function computeThdSimple(samples: number[], fs: number): { thd: number; pf: number } {
  const N = samples.length;
  if (N < 10) return { thd: 0, pf: 0 };
  // 找基波峰值
  const fFund = 50; // 已知 50 Hz 电网
  const idxFund = Math.round(fFund / (fs / N));
  if (idxFund < 1 || idxFund >= N) return { thd: 0, pf: 0 };

  // 计算基波幅值（DFT 单点）
  let re = 0; let im = 0;
  for (let n = 0; n < N; n++) {
    const angle = -2 * Math.PI * idxFund * n / N;
    re += samples[n] * Math.cos(angle);
    im += samples[n] * Math.sin(angle);
  }
  const fundMag = Math.sqrt(re * re + im * im) / N;

  // 谐波幅值（2-40 次）
  let harmEnergy = 0;
  for (let h = 2; h <= 40; h++) {
    const idx = Math.round(h * fFund / (fs / N));
    if (idx >= N) break;
    let reH = 0; let imH = 0;
    for (let n = 0; n < N; n++) {
      const angle = -2 * Math.PI * idx * n / N;
      reH += samples[n] * Math.cos(angle);
      imH += samples[n] * Math.sin(angle);
    }
    const magH = Math.sqrt(reH * reH + imH * imH) / N;
    harmEnergy += magH * magH;
  }

  const thd = fundMag > 1e-9 ? Math.sqrt(harmEnergy) / fundMag * 100 : 0;

  // PF ≈ 1 / sqrt(1 + (THD/100)^2)（假设电压正弦，电流基波与电压同相）
  const thdPct = thd;
  const pf = thdPct < 100 ? 1 / Math.sqrt(1 + (thdPct / 100) ** 2) : 0;

  return { thd, pf };
}

/**
 * 运行开关级 PFC 仿真。
 *
 * 使用固定步长 dt = 1/(fs × stepsPerCarrier)，每个 PWM 周期取
 * stepsPerCarrier 个点（默认 20）来解析开关动作。
 *
 * 电流环在每个载波周期更新一次（同步 PWM 更新）。
 */
export function simulateSwitchingPfc(input: SwitchingPfcInput): SwitchingPfcResult {
  const {
    vAcRms, freqHz, udcRef, lUh, cUf, loadCurrent,
    pwmFs, currentKp, currentKi, cycles = 3,
    lEsrMohm = 50, cEsrMohm = 100,
    voltageKp = 0.05, voltageKi = 10,
  } = input;

  // 单位转换
  const lH = lUh / 1e6;
  const lEsr = lEsrMohm / 1000;
  const cEsr = cEsrMohm / 1000;

  // 仿真参数
  const stepsPerCarrier = 20;
  const dt = 1 / (pwmFs * stepsPerCarrier);
  const totalTime = cycles / freqHz;
  const totalSteps = Math.ceil(totalTime / dt);

  // 状态
  let udc = udcRef * 0.7; // 初始预充（70%）
  let iL = 0;
  let currentIntegral = 0;
  let voltageIntegral = 0;
  let iPeakRef = loadCurrent * 1.5; // 初始 Ipeak 估计
  let duty = 0.3; // 初始占空比

  const points: SwitchingPfcPoint[] = [];
  const iGridSamples: number[] = [];

  // 电压环更新周期：每 1/4 电网周期更新一次（约 5ms @ 50Hz）
  const voltageLoopInterval = Math.round(1 / (freqHz * 4) / dt);

  for (let step = 0; step < totalSteps; step++) {
    const t = step * dt;

    // 电网电压 + 整流
    const vGrid = vAcRms * Math.SQRT2 * Math.sin(2 * Math.PI * freqHz * t);
    const vRect = Math.abs(vGrid);

    // 三角载波（0→1→0），频率 = pwmFs
    const carrierPeriod = 1 / pwmFs;
    const carrierTime = t % carrierPeriod;
    const carrier = carrierTime < carrierPeriod / 2
      ? carrierTime / (carrierPeriod / 2)
      : 2 - carrierTime / (carrierPeriod / 2);

    // 电流环（每个载波周期更新）
    if (step % stepsPerCarrier === 0) {
      // 电流参考 = |sin(ωt)| × Ipeak
      const absSin = (vGrid >= 0 ? 1 : -1) * Math.sin(2 * Math.PI * freqHz * t);
      const iRef = Math.abs(absSin) * iPeakRef;
      const error = iRef - iL;
      currentIntegral += error * (stepsPerCarrier * dt);
      const dutyUnsat = currentKp * error + currentKi * currentIntegral;
      duty = Math.max(0.02, Math.min(0.98, dutyUnsat));
      if (duty !== dutyUnsat) {
        currentIntegral -= (duty - dutyUnsat) * stepsPerCarrier * dt * 0.5;
      }
    }

    // 电压环（每 1/4 电网周期更新）
    if (step % voltageLoopInterval === 0) {
      const vError = udcRef - udc;
      voltageIntegral += vError * (voltageLoopInterval * dt);
      const iPeakUnsat = voltageKp * vError + voltageKi * voltageIntegral;
      iPeakRef = Math.max(0.1, Math.min(50, iPeakUnsat));
      if (iPeakRef !== iPeakUnsat) {
        voltageIntegral -= (iPeakRef - iPeakUnsat) * voltageLoopInterval * dt * 0.5;
      }
    }

    // 开关状态（载波比较）
    const switchOn = carrier < duty;

    // 电路微分方程（欧拉法）
    // S 导通：diL/dt = (vRect - iL * lEsr) / lH
    // S 关断：diL/dt = (vRect - iL * lEsr - udc) / lH
    const vL = switchOn
      ? vRect - iL * lEsr
      : vRect - iL * lEsr - udc;

    const diL = vL / Math.max(lH, 1e-12);

    // 母线电容方程：C × dUdc/dt = iC
    // S 关断时 iC = iL - loadCurrent（二极管导通，L 向 C 充电）
    // S 导通时 iC = -loadCurrent（L 短路到 GND，C 独自供负载）
    const iC = switchOn
      ? -loadCurrent
      : iL - loadCurrent;

    const dUdc = (iC - udc / Math.max(cEsr, 1e-12)) / Math.max(cUf / 1e6, 1e-15);

    iL += diL * dt;
    udc += dUdc * dt;
    udc = Math.max(udc, 10); // 避免负电压

    // 电网侧电流（整流桥翻折）
    const iGrid = vGrid >= 0 ? iL : -iL;

    // 记录（抽稀到每载波周期 1 点 + 全部载波比较点）
    points.push({
      t, vGrid, vRect, udc, iL, iGrid,
      duty, switchOn, carrier,
    });

    if (t >= (cycles - 1) / freqHz) {
      iGridSamples.push(iGrid);
    }
  }

  // 计算 THD / PF（用后 1 个周期的电网电流数据）
  const fs = 1 / dt;
  const { thd, pf } = computeThdSimple(iGridSamples, fs);

  // 统计
  const udcValues = points.map((p) => p.udc);
  const iLValues = points.map((p) => p.iL);
  const udcAvg = udcValues.reduce((a, b) => a + b, 0) / udcValues.length;
  const udcRipple = Math.max(...udcValues) - Math.min(...udcValues);
  const iLRms = Math.sqrt(iLValues.reduce((a, b) => a + b * b, 0) / iLValues.length);
  const iLRipple = Math.max(...iLValues) - Math.min(...iLValues);

  return {
    points,
    thd,
    pf,
    udcAvg,
    udcRipple,
    iLRms,
    iLRipple,
    switchingRippleRatio: iLRipple / (iLRms + 1e-12),
  };
}