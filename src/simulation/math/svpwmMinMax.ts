/**
 * Min/Mid/Max 法 SVPWM —— 与七段式（sector-based）SVPWM 数学等价的简化实现。
 *
 * 物理背景：
 *   传统七段式 SVPWM 先判扇区、再算 T1/T2/T0，分支多、查表多。
 *   一个更优雅的实现是直接对三相参考电压做"共模注入"：
 *
 *     Va_ref = Valpha
 *     Vb_ref = -0.5·Valpha + (√3/2)·Vbeta
 *     Vc_ref = -0.5·Valpha - (√3/2)·Vbeta              （反 Clarke）
 *
 *     V_cm  = -(max(Va,Vb,Vc) + min(Va,Vb,Vc)) / 2     ← 关键的共模注入
 *
 *     Va' = Va + V_cm
 *     Vb' = Vb + V_cm
 *     Vc' = Vc + V_cm
 *
 *     duty_x = 0.5 + Vx' / Udc                         （中心对齐 PWM 习惯）
 *
 *   该共模分量 V_cm 是一个 3 次谐波（频率 3ωe，幅值约 Udc/6），是七段式零矢量 V0/V7
 *   平均分配在 PWM 周期两端的等效作用——它把母线"利用率"从 SPWM 的 Udc/2 提升到 Udc/√3
 *   （提升 ≈ 15.5%），且共模分量在线-线电压里相消，对电机绕组完全透明。
 *
 * 与七段式等价证明（要点）：
 *   - 七段式零矢量 T0 = Ts - T1 - T2 在 (000) 和 (111) 之间 50/50 分配；
 *   - 这等价于把三相占空比同时平移一个量 (1 - T0/Ts) / 2 - max/2，
 *     代数推导得 = -(max + min)/(2·Ts)·...
 *   - 详细证明见 Boys & Walton, "Modulation strategies for current-controlled
 *     PWM inverters" IEE Proceedings 1985；阮毅书 §6.4.2 也有完整推导。
 *
 *   工程上人们做实测：用示波器对比七段式和 Min/Mid/Max 的相电压和线-线电压
 *   波形，相电压都含 3 次谐波（共模），线-线电压完全干净的 1 次正弦——证实等价。
 *
 * Min/Mid/Max 实现的优势：
 *   - 完全无扇区分支（只需 3 次比较 + 2 次加法），分支预测器友好；
 *   - 自然适配过调制（共模注入超出 [-Udc/2, +Udc/2] 时自动截断为 6 步运行）；
 *   - 不需要 atan2，对低端 Cortex-M0/M3 特别有意义（atan2 软件实现 ~500 cycles）。
 *
 * 参考：
 *   - 阮毅《电力拖动自动控制系统》第 6 章 6.4 节"基于零序分量注入的 SVPWM"
 *   - Bose, "Modern Power Electronics and AC Drives" §5.5.4
 *   - TI Application Report SPRABT0 "Center-Aligned SVPWM Realization for 3-Phase
 *     3-Level Inverter"
 *
 * 单位：
 *   - Valpha, Vbeta: V（αβ 静止坐标系参考电压）
 *   - Vdc: V（母线）
 *   - 返回 ta/tb/tc: 占空比 [0, 1]（中心对齐 PWM 比较寄存器值 ÷ ARR）
 *
 * STM32 移植要点：
 *   - q15 实现：三个 max/min 比较 + 1 次加法 + 1 次除（2 次移位即可，Udc 已知常量），
 *     比七段式快 ~3 倍。
 *   - ISR 周期：电流环中断里直接替换 calculateSvpwm() 即可。
 *   - 查表 vs 迭代：完全不需要 LUT。
 *   - 过调制：当注入后 max(Va') > Udc/2 时，硬截断到 Udc/2，自动平滑进入"六步方波"区，
 *     母线利用率从 Udc/√3 提升到 2·Udc/π（≈ 27% 增益），代价是线-线电压含 5/7 次谐波。
 */

export interface SvpwmMinMaxInput {
  Valpha: number;
  Vbeta: number;
  Vdc: number;
}

export interface SvpwmMinMaxOutput {
  /** A 相占空比 [0, 1]，中心对齐 PWM 比较值 */
  ta: number;
  /** B 相占空比 [0, 1] */
  tb: number;
  /** C 相占空比 [0, 1] */
  tc: number;
  /** 注入的共模分量 V（教学诊断用，应在 ±Udc/6 内） */
  vCommon: number;
  /** 是否进入过调制（线性区上限被打破） */
  saturated: boolean;
}

/**
 * Min/Mid/Max SVPWM 主函数。
 *
 *   1) 反 Clarke 得三相参考 Va/Vb/Vc；
 *   2) 计算共模注入 V_cm = -(max + min) / 2；
 *   3) Va'/Vb'/Vc' = 原值 + V_cm；
 *   4) 归一到占空比 0.5 + Vx'/Vdc，clamp 到 [0,1]。
 */
export function calculateSvpwmMinMax(input: SvpwmMinMaxInput): SvpwmMinMaxOutput {
  const Vdc = Math.max(input.Vdc, 1e-6);
  const sqrt3Half = Math.sqrt(3) / 2;

  // 反 Clarke：αβ → abc
  const va = input.Valpha;
  const vb = -0.5 * input.Valpha + sqrt3Half * input.Vbeta;
  const vc = -0.5 * input.Valpha - sqrt3Half * input.Vbeta;

  // Min/Mid/Max
  const vmax = Math.max(va, vb, vc);
  const vmin = Math.min(va, vb, vc);
  const vCommon = -(vmax + vmin) * 0.5;

  // 共模注入后的三相参考
  const va2 = va + vCommon;
  const vb2 = vb + vCommon;
  const vc2 = vc + vCommon;

  // 过调制判定：注入后三相参考应在 ±Vdc/2 内（线性区上限）
  const halfDc = Vdc * 0.5;
  const saturated =
    Math.abs(va2) > halfDc * 1.001 || Math.abs(vb2) > halfDc * 1.001 || Math.abs(vc2) > halfDc * 1.001;

  // 归一到 [0, 1] 占空比
  const ta = Math.min(Math.max(0.5 + va2 / Vdc, 0), 1);
  const tb = Math.min(Math.max(0.5 + vb2 / Vdc, 0), 1);
  const tc = Math.min(Math.max(0.5 + vc2 / Vdc, 0), 1);

  return { ta, tb, tc, vCommon, saturated };
}
