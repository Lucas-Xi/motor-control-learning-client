/**
 * 单相 Boost PFC（功率因数校正）前级 —— 工程级双环时域仿真。
 *
 * 拓扑（教学版，全桥整流 + Boost）：
 *
 *   v_grid  ──┐ ┌──┐  v_rect  ┌──L──┬──D──┬──── Udc ──┐
 *             │ │BR│  =|sin|  │     │     │           │
 *             │ │  │          │   ┌─S─┐   ├──C──┬───────┤
 *             │ │  │          │   │   │   │     │     │
 *             └─┘ └──┘        GND └───┘   GND   GND  Load
 *
 * 控制目标：
 *   1) 内环（电流环 ~1 kHz 带宽）：i_L 跟踪 i_ref = I_peak · |sin(ωt)|；
 *      → 电网侧电流 i_grid 近似纯正弦 → PF≈1、低 THD；
 *   2) 外环（电压环 ~20 Hz 带宽）：u_dc → PI → I_peak；
 *      → 母线 380V 维持稳定，不受负载阶跃影响；
 *   3) 双环带宽分离 ≥ 10× 是工程红线（否则两环耦合，电压环会"误把 100 Hz
 *      纹波当作负载变化"调电流，导致 i_grid 出现明显的二次谐波）。
 *
 * 双环结构（前馈 + 反馈）：
 *
 *   Udc_ref ──►(+)─►[ PI_v (Kpv,Kiv) ]──► I_peak ──×──► i_ref
 *               -                                   ▲
 *               Udc                                |sin(ωt)|
 *
 *   i_ref ──►(+)─►[ PI_i (Kpi,Kii) ]──► d_pi ──► (+) ──► duty ──► PWM ──► S
 *             -                                  ▲
 *             i_L                       d_ff = 1 - v_rect/Udc  (Boost 稳态前馈)
 *
 * 平均模型（连续导通 CCM，省去开关动作，专注控制行为）：
 *   - L · di_L/dt = v_rect - (1 - duty) · Udc
 *   - C · dUdc/dt = (1 - duty) · i_L - i_load
 *   - i_grid = sign(v_grid) · i_L          （整流桥把负半周翻折）
 *   - i_grid_no_pfc：S 永远断开，C 直接整流充电——只在 v_rect > Udc 的尖峰阶段
 *     从电网吸电流（典型脉冲，THD 100%+，PF ≈ 0.6）
 *
 * 谐波注入（可选）：
 *   - 把 harmonics_to_inject = [{order:3, amp:0.05}, ...] 加到电网电压上，
 *     模拟"非理想电网"——验证电流环对电网谐波的拒绝能力（PFC 控制的 i_L 仍
 *     按内部 |sin| 参考走，但 v_rect 已变形）。
 *
 * 单位：
 *   - Vac_rms / Vdc_ref: V
 *   - L_mH: mH ; C_uF: μF
 *   - load_W: W （内部转 i_load = load_W / Vdc_ref）
 *   - Kpv/Kiv/Kpi/Kii: 标准 PI（连续域）增益
 *   - 输出数组长度 ~600（在 60ms 内每 0.1 ms 取一个点，足够 50 Hz 30 周期里
 *     看 3 周期细节，又能跑 FFT）。
 *
 * 性能：
 *   - 内部固定 dt = 1e-5 s（100 kHz），TOTAL = 60 ms ⇒ 6000 step；
 *   - 抽稀 10× → 输出 600 个点；
 *   - 单次完整仿真 ~3 ms（V8 / 现代 CPU），useMemo 安全可见。
 *
 * 抗 windup：
 *   - 这里直接 clamp + 条件积分（饱和方向冻结），保持本文件零依赖；
 *     如果要 back-calculation，可在 UI 层把 antiwindup.ts 的 PI 替换内环 PI。
 *
 * 参考：
 *   - L. Rossetto 等, "Control Techniques for Power Factor Correction Converters"
 *   - TI Application Report SLUA144A "Optimizing the Transient Response of a
 *     Voltage Loop in a PFC Converter"
 *   - IEC 61000-3-2 Class A/D 谐波限值
 *
 * STM32 移植要点：
 *   - 电流环放在 ADC DMA 完成中断（10-20 kHz），快速读 i_L、算 PI；
 *   - 电压环放在 1 kHz 软定时器，把 I_peak 写到内环全局；
 *   - |sin(ωt)| 来源：PLL 锁电网相位（或 ZCD），保证 i_ref 与 v_grid 同相；
 *   - 前馈项 d_ff = 1 - v_rect/Udc：每次电流环都更新（轻量除法 1 次）。
 */

export interface BoostPfcHarmonic {
  /** 谐波次数（≥2 整数；3/5/7 是常见家电干扰源） */
  order: number;
  /** 相对于基波幅值的比例（0..0.3） */
  amp: number;
}

export interface BoostPfcInput {
  /** 电网电压 RMS（V） */
  Vac_rms: number;
  /** 直流母线参考（V），必须 > Vac_peak */
  Vdc_ref: number;
  /** Boost 电感（mH） */
  L_mH: number;
  /** Boost 电容（μF） */
  C_uF: number;
  /** 负载功率（W），内部转为 i_load = load_W / Vdc_ref */
  load_W: number;
  /** 电压外环 PI Kp / Ki */
  Kpv: number;
  Kiv: number;
  /** 电流内环 PI Kp / Ki */
  Kpi: number;
  Kii: number;
  /** 可选：电网谐波污染列表 */
  harmonics_to_inject?: BoostPfcHarmonic[];
  /** 是否启用 PFC 控制；false 表示开关全断（裸整流桥 + 电容） */
  pfc_enabled?: boolean;
  /** 是否在仿真中段触发负载阶跃（50% → 100%），用于看 Udc 跌落与恢复 */
  load_step?: boolean;
  /** 电网频率（Hz，默认 50） */
  freq_hz?: number;
  /** 仿真总时长（s，默认 0.06，即 3 个 50Hz 周期） */
  total_sec?: number;
  /** 内部步长（s，默认 1e-5） */
  dt?: number;
  /** 输出抽稀（默认 10，即 1e-4 一个点） */
  decimate?: number;
}

export interface BoostPfcResult {
  /** 抽稀后的时间轴（ms） */
  t_ms: number[];
  /** 电网瞬时电压（V，含正负） */
  v_grid: number[];
  /** 裸整流 + 电容（无 PFC）时的电网侧线电流（A） */
  i_grid_no_pfc: number[];
  /** 启用 Boost PFC 双环后的电网侧线电流（A） */
  i_grid_pfc: number[];
  /** PFC 模式下的母线电压（V） */
  Udc: number[];
  /** PFC 模式下的电感电流（A，绝对值，跟随 |sin|） */
  iL: number[];
  /** PFC 模式下的电流参考（A，期望形状） */
  iL_ref: number[];
  /** PFC 模式下的占空比（0..1） */
  duty: number[];
  /** PFC 模式下 i_grid 的 THD（%，仅前 40 次谐波） */
  thd: number;
  /** 无 PFC 模式下 i_grid 的 THD（%），用于对比 */
  thd_no_pfc: number;
  /** PFC 模式下的功率因数 cos(φ)·失真因子（0..1） */
  pf: number;
  /** 无 PFC 模式下的功率因数 */
  pf_no_pfc: number;
  /** Udc 阶跃恢复时间（ms，仅当 load_step=true 时有意义；否则为 0） */
  settling_ms: number;
  /** Udc 平均（V） */
  Udc_avg: number;
  /** Udc 纹波（峰峰，V） */
  Udc_ripple: number;
}

/* ─────────────────────────  内部小工具  ───────────────────────── */

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** 紧凑 PI，带饱和方向条件积分（最简抗 windup）。 */
function makePI(kp: number, ki: number, outMin: number, outMax: number) {
  let integ = 0;
  return {
    step(err: number, dt: number): number {
      // 试探：先按常规累加
      const candidate = integ + err * dt;
      const uUnsat = kp * err + ki * candidate;
      const uSat = clamp(uUnsat, outMin, outMax);
      // 同号冻结：若饱和方向与 err 一致，不让 integ 继续涨
      if (uSat !== uUnsat && err * uUnsat > 0) {
        // 维持 integ 不变
      } else {
        integ = candidate;
      }
      return uSat;
    },
    /** 预置积分（用于稳态初始化，避免起动浪涌主导观测窗口） */
    seed(value: number) {
      integ = value;
    },
    get integral() {
      return integ;
    },
  };
}

/** 单边谱（O(N²)，N≤256 完全够用，内部用于 THD / PF）。 */
function singleSidedSpectrum(samples: number[], fs: number): { freq: number[]; mag: number[] } {
  const N = samples.length;
  if (N < 2) return { freq: [], mag: [] };
  const half = N >> 1;
  const freq = new Array<number>(half + 1);
  const mag = new Array<number>(half + 1);
  const twoPiOverN = (2 * Math.PI) / N;
  for (let k = 0; k <= half; k += 1) {
    let re = 0;
    let im = 0;
    for (let n = 0; n < N; n += 1) {
      const ang = twoPiOverN * k * n;
      re += samples[n] * Math.cos(ang);
      im -= samples[n] * Math.sin(ang);
    }
    const m = Math.sqrt(re * re + im * im);
    mag[k] = k === 0 ? m / N : (2 * m) / N;
    freq[k] = (k * fs) / N;
  }
  return { freq, mag };
}

/** 给定单边谱，找最大幅值 bin 当基波，返回 THD%（含 2..harmonicMax 次）。 */
function thdFromSpectrum(mag: number[], fundIdxHint: number, harmonicMax = 40): number {
  if (mag.length < 3) return 0;
  let fundIdx = fundIdxHint > 0 ? fundIdxHint : 1;
  // 在 hint ±1 内取实际峰，避免栅栏漏选
  for (let k = Math.max(1, fundIdxHint - 1); k <= Math.min(mag.length - 1, fundIdxHint + 1); k += 1) {
    if (mag[k] > mag[fundIdx]) fundIdx = k;
  }
  const v1 = mag[fundIdx];
  if (!Number.isFinite(v1) || v1 <= 1e-6) return 0;
  let sq = 0;
  for (let h = 2; h <= harmonicMax; h += 1) {
    const idx = fundIdx * h;
    if (idx >= mag.length) break;
    sq += mag[idx] * mag[idx];
  }
  return (Math.sqrt(sq) / v1) * 100;
}

/* ─────────────────────────  主仿真  ───────────────────────── */

export function simulatePfcCycle(input: BoostPfcInput): BoostPfcResult {
  const freq = input.freq_hz ?? 50;
  const total = input.total_sec ?? 0.06;
  const dt = input.dt ?? 1e-5;
  const decimate = Math.max(1, Math.floor(input.decimate ?? 10));
  const pfcEnabled = input.pfc_enabled ?? true;
  const loadStep = input.load_step ?? false;

  const omega = 2 * Math.PI * freq;
  const L = Math.max(input.L_mH, 0.05) / 1000;
  const C = Math.max(input.C_uF, 10) / 1e6;
  const Vpeak = input.Vac_rms * Math.SQRT2;
  // 给 udc 一个下限：不能低于 Vpeak，否则 Boost 无升压余量
  const UdcRef = Math.max(input.Vdc_ref, Vpeak * 1.05);

  const iLoadNominal = Math.max(input.load_W, 1) / UdcRef;
  const iLoadHalf = iLoadNominal * 0.5;

  // 谐波归一化：基波始终是 Vpeak，谐波叠加到 v_grid 上
  const harmonics = (input.harmonics_to_inject ?? []).filter((h) => h.order >= 2 && h.amp > 0);

  /* 双环 PI（带防饱和） */
  const piV = makePI(input.Kpv, input.Kiv, 0, Math.max(40, 20 * iLoadNominal + 5));
  // 电流环输出是占空比"修正量"，前馈给基本占空比；范围限定 [-0.4, 0.4]，避免修正主导
  const piI = makePI(input.Kpi, input.Kii, -0.4, 0.4);

  /* 状态初始化（稳态附近，避免被启动瞬态淹没） */
  // 电压外环输出（I_peak）= 输入有功 / (Vrms · PF·1) ≈ 2·P / Vpeak（半波平均）
  const iPeakSteady = Math.max(2, (UdcRef * iLoadNominal * 2) / Vpeak);
  piV.seed(iPeakSteady / Math.max(input.Kiv, 0.1));

  let iL = 0;
  let Udc = UdcRef;

  // 无 PFC 路径独立状态（同一电网、同一 L、同一 C，但开关常断 → 二极管整流给 C 充电）
  let iL_noPfc = 0;
  let Udc_noPfc = Vpeak * 0.95;

  const totalSteps = Math.round(total / dt);
  const stepHalf = Math.floor(totalSteps / 2);

  // 输出缓冲（预知大小）
  const N_out = Math.floor(totalSteps / decimate);
  const t_ms = new Array<number>(N_out);
  const v_grid = new Array<number>(N_out);
  const i_grid_pfc = new Array<number>(N_out);
  const i_grid_no_pfc = new Array<number>(N_out);
  const Udc_arr = new Array<number>(N_out);
  const iL_arr = new Array<number>(N_out);
  const iL_ref_arr = new Array<number>(N_out);
  const duty_arr = new Array<number>(N_out);

  let outIdx = 0;
  let dec = 0;

  // 阶跃恢复时间检测：阶跃发生后，第一次 |Udc - UdcRef| 持续 5ms 都 < 1%·UdcRef
  let stepTriggerStep = -1;
  let settledStep = -1;
  const settleBand = UdcRef * 0.01;
  let consecutiveSettled = 0;
  const settleMinSteps = Math.round(0.005 / dt); // 5ms 持续在带内

  let UdcMin = +Infinity;
  let UdcMax = -Infinity;
  let UdcSum = 0;
  let UdcCount = 0;

  for (let step = 0; step < totalSteps; step += 1) {
    const t = step * dt;
    // 电网电压：基波 + 注入谐波
    let v = Math.sin(omega * t);
    for (let h = 0; h < harmonics.length; h += 1) {
      v += harmonics[h].amp * Math.sin(omega * harmonics[h].order * t);
    }
    const vGrid = Vpeak * v;
    const vRect = Math.abs(vGrid);

    // 当前负载电流（中段阶跃从 half → full）
    const iLoad = loadStep && step < stepHalf ? iLoadHalf : iLoadNominal;
    if (loadStep && step === stepHalf) stepTriggerStep = step;

    /* ─── 路径 A：完整 Boost PFC 双环 ─── */
    let duty = 0;
    let iRef = 0;
    if (pfcEnabled) {
      // 外环：电压 PI → I_peak
      const errV = UdcRef - Udc;
      const iPeak = piV.step(errV, dt);
      iRef = iPeak * Math.abs(Math.sin(omega * t));

      // 内环：电流 PI → 占空比修正
      const errI = iRef - iL;
      const dPi = piI.step(errI, dt);

      // 前馈：稳态 Boost D_ff = 1 - v_rect/Udc
      const dFf = 1 - clamp(vRect / Math.max(50, Udc), 0, 0.99);
      duty = clamp(dFf + dPi, 0.0, 0.95);

      // 平均模型积分
      const diL = (vRect - (1 - duty) * Udc) / L;
      iL += diL * dt;
      if (iL < 0) iL = 0;

      const dUdc = ((1 - duty) * iL - iLoad) / C;
      Udc += dUdc * dt;
      if (Udc < 50) Udc = 50;
    } else {
      // 不启用：开关常断；电感与开关串联无电流路径，故 iL=0
      iL = 0;
      iRef = 0;
      duty = 0;
      // Boost 拓扑下"开关常断"= 二极管 + 电感串联直通到电容；这里仍用平均模型描述
      const dUdc = (iL - iLoad) / C;
      Udc += dUdc * dt;
      if (Udc < 50) Udc = 50;
    }

    /* ─── 路径 B：无 PFC（裸全桥整流 + 大电容）—— 总是计算供对比 ─── */
    // 物理：当 v_rect > Udc_noPfc 时，二极管导通，i_L_noPfc 由 L 限流上升；否则 i_L_noPfc 衰减到 0
    if (vRect > Udc_noPfc + 0.5) {
      const di = (vRect - Udc_noPfc) / L;
      iL_noPfc += di * dt;
    } else {
      // 电感电流通过续流路径放电（在裸整流里无续流，电流被强制截断）
      iL_noPfc = Math.max(0, iL_noPfc - (Udc_noPfc / L) * dt);
    }
    const dUdcNo = (iL_noPfc - iLoad) / C;
    Udc_noPfc += dUdcNo * dt;
    if (Udc_noPfc < 50) Udc_noPfc = 50;

    /* ─── 阶跃恢复时间检测 ─── */
    if (stepTriggerStep >= 0 && step > stepTriggerStep + Math.round(0.002 / dt)) {
      if (Math.abs(Udc - UdcRef) < settleBand) {
        consecutiveSettled += 1;
        if (consecutiveSettled >= settleMinSteps && settledStep < 0) {
          settledStep = step - settleMinSteps;
        }
      } else {
        consecutiveSettled = 0;
      }
    }

    // 母线统计（全窗口）
    if (Udc < UdcMin) UdcMin = Udc;
    if (Udc > UdcMax) UdcMax = Udc;
    UdcSum += Udc;
    UdcCount += 1;

    /* ─── 抽稀写出 ─── */
    if (++dec >= decimate) {
      dec = 0;
      if (outIdx < N_out) {
        t_ms[outIdx] = t * 1000;
        v_grid[outIdx] = vGrid;
        i_grid_pfc[outIdx] = Math.sign(vGrid) * iL;
        i_grid_no_pfc[outIdx] = Math.sign(vGrid) * iL_noPfc;
        Udc_arr[outIdx] = Udc;
        iL_arr[outIdx] = iL;
        iL_ref_arr[outIdx] = iRef;
        duty_arr[outIdx] = duty;
        outIdx += 1;
      }
    }
  }

  // 实际写入长度（保险起见截断尾部空位）
  const len = outIdx;
  t_ms.length = len;
  v_grid.length = len;
  i_grid_pfc.length = len;
  i_grid_no_pfc.length = len;
  Udc_arr.length = len;
  iL_arr.length = len;
  iL_ref_arr.length = len;
  duty_arr.length = len;

  /* ─── THD / PF 计算 ───
   * fs_out = 1/(decimate·dt)；basebin = round(freq · N / fs_out) = round(freq · total)
   */
  const fsOut = 1 / (decimate * dt);
  const spec_pfc = singleSidedSpectrum(i_grid_pfc, fsOut);
  const spec_no = singleSidedSpectrum(i_grid_no_pfc, fsOut);
  const baseBin = Math.max(1, Math.round((freq * len) / fsOut));
  const thd = thdFromSpectrum(spec_pfc.mag, baseBin);
  const thd_no_pfc = thdFromSpectrum(spec_no.mag, baseBin);

  // PF = P_active / S = (1/T·∫v·i dt) / (V_rms · I_rms)
  // 等价于 cos(φ) · 失真因子 = cos(φ) / sqrt(1 + THD²)
  const pf = computePF(v_grid, i_grid_pfc);
  const pf_no_pfc = computePF(v_grid, i_grid_no_pfc);

  const Udc_avg = UdcCount > 0 ? UdcSum / UdcCount : UdcRef;
  const Udc_ripple = isFinite(UdcMax - UdcMin) ? UdcMax - UdcMin : 0;
  const settling_ms = settledStep > 0 ? (settledStep - stepTriggerStep) * dt * 1000 : 0;

  return {
    t_ms,
    v_grid,
    i_grid_no_pfc,
    i_grid_pfc,
    Udc: Udc_arr,
    iL: iL_arr,
    iL_ref: iL_ref_arr,
    duty: duty_arr,
    thd,
    thd_no_pfc,
    pf,
    pf_no_pfc,
    settling_ms,
    Udc_avg,
    Udc_ripple,
  };
}

function computePF(v: number[], i: number[]): number {
  const N = Math.min(v.length, i.length);
  if (N < 2) return 0;
  let pSum = 0;
  let vSq = 0;
  let iSq = 0;
  for (let n = 0; n < N; n += 1) {
    pSum += v[n] * i[n];
    vSq += v[n] * v[n];
    iSq += i[n] * i[n];
  }
  const P = pSum / N;
  const Vrms = Math.sqrt(vSq / N);
  const Irms = Math.sqrt(iSq / N);
  const S = Vrms * Irms;
  if (S < 1e-3) return 0;
  return clamp(Math.abs(P) / S, 0, 1);
}

/* 导出谱辅助（供 PfcSpectrumCard 复用，避免重复 DFT） */
export function spectrumOf(samples: number[], fs: number): { freq: number[]; mag: number[] } {
  return singleSidedSpectrum(samples, fs);
}

/* 帮助 UI 知道抽稀后的采样率（fs_out = 1/(decimate·dt)） */
export function outputSampleRate(input: Pick<BoostPfcInput, 'dt' | 'decimate'>): number {
  const dt = input.dt ?? 1e-5;
  const dec = Math.max(1, Math.floor(input.decimate ?? 10));
  return 1 / (dt * dec);
}
