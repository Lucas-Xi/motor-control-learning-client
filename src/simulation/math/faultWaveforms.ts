import type { FaultType } from '../engine/types';

export interface FaultWaveSample {
  t: number;          // % of window
  ia: number;
  ib: number;
  ic: number;
  speed: number;
  voltage: number;
}

/**
 * 按故障类型合成的特征波形（教学示意）。
 *
 * 这里不是物理仿真，但形态做到"定性正确"：
 *   - 三相型故障（过流/堵转/液击/缺相）三相同时响应，不只画一相；
 *   - 满足 KCL 约束（如 Ib=0 时 Ic=-Ia）；
 *   - 速度/母线电压的因果方向与实际一致。
 *
 * 严重度 0 时所有故障都退化为正常三相正弦，用于让滑块从 0 拉到 1 时观察形态如何"变化"。
 */
export function createFaultWaveform(type: FaultType, severity: number, points = 180): FaultWaveSample[] {
  const sev = Math.max(0, Math.min(1, severity));
  const Ibase = 4;
  const speedNom = 1200;
  const udcNom = 310;
  const TWO_PI_THIRDS = (Math.PI * 2) / 3;
  const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

  return Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    const omega = t * Math.PI * 8;
    const phaseA = Math.sin(omega);
    const phaseB = Math.sin(omega - TWO_PI_THIRDS);
    const phaseC = Math.sin(omega + TWO_PI_THIRDS);

    let ia = phaseA * Ibase;
    let ib = phaseB * Ibase;
    let ic = phaseC * Ibase;
    let speed = speedNom;
    let voltage = udcNom;

    switch (type) {
      case 'over-current': {
        // 三相同时攀升 → 在 t≈0.45 触及 OCP 阈值 → 硬件切断后电流被快速截止
        if (sev > 0) {
          if (t >= 0.30 && t < 0.45) {
            const ramp = (t - 0.30) / 0.15;
            const k = 1 + sev * 1.8 * ramp;
            ia *= k; ib *= k; ic *= k;
          } else if (t >= 0.45 && t < 0.55) {
            const cut = Math.max(0, 1 - (t - 0.45) / 0.10);
            const peak = 1 + sev * 1.8;
            ia = phaseA * Ibase * peak * cut;
            ib = phaseB * Ibase * peak * cut;
            ic = phaseC * Ibase * peak * cut;
          } else if (t >= 0.55) {
            ia = ib = ic = 0;
            speed = speedNom * (1 - sev * 0.5);
          }
        }
        break;
      }
      case 'phase-loss': {
        // t=0.30 起 B 相断开：Ib→0，Ia/Ic 由 KCL 互为反相承担同样电流，幅值约 √3 倍上升
        if (t >= 0.30) {
          const ramp = Math.min(1, (t - 0.30) / 0.05) * sev;
          const ialost = phaseA * Ibase * 1.732;
          const iblost = 0;
          const iclost = -ialost;
          ia = lerp(ia, ialost, ramp);
          ib = lerp(ib, iblost, ramp);
          ic = lerp(ic, iclost, ramp);
          speed = lerp(speed, speedNom * 0.55, ramp);
        }
        break;
      }
      case 'locked-rotor': {
        // 反电动势=0，三相为电频率正弦但幅值×(1+4·sev)；速度在 ~50ms 内归零
        // 使用 (1-sev)² 让高严重度场景的速度更接近 0（卡死越深 → 残速越小）
        const k = 1 + sev * 4;
        ia *= k; ib *= k; ic *= k;
        const remainder = (1 - sev) * (1 - sev);
        const decay = Math.min(1, t / 0.05);
        const lockSpeedFactor = 1 - decay * (1 - remainder);
        speed = speedNom * lockSpeedFactor;
        break;
      }
      case 'phase-order': {
        // A 相与 C 相互换通道
        const iaSwap = ic;
        const icSwap = ia;
        ia = lerp(ia, iaSwap, sev);
        ic = lerp(ic, icSwap, sev);
        speed = lerp(speedNom, speedNom * (-0.4) + Math.sin(t * Math.PI * 6) * 200, sev);
        break;
      }
      case 'liquid-slugging': {
        // 机械冲击 → 三相同步浪涌 + 母线短暂回灌（再生）后跌 + 转速凹陷
        const env = Math.exp(-Math.pow((t - 0.25) / 0.025, 2)) * sev * 5;
        ia = phaseA * (Ibase + env);
        ib = phaseB * (Ibase + env);
        ic = phaseC * (Ibase + env);
        if (t > 0.21 && t < 0.27) voltage += sev * 25 * Math.exp(-Math.pow((t - 0.24) / 0.02, 2));
        else if (t >= 0.27 && t < 0.42) voltage -= sev * 18 * Math.exp(-Math.pow((t - 0.30) / 0.04, 2));
        speed = speedNom - Math.exp(-Math.pow((t - 0.27) / 0.05, 2)) * sev * 350;
        break;
      }
      case 'oil-low': {
        // 状态位告警：电气波形无可见特征。保持正常运行波形不变。
        break;
      }
      case 'current-offset': {
        // ADC 偏置 → 控制器反向补偿 → 三相 DC 之和守恒（物理相电流必须 KCL=0）
        // 控制器误判后产生与电频率同步的转矩脉动
        ia += sev * 1.8;
        ib -= sev * 0.9;
        ic -= sev * 0.9;
        speed = speedNom + Math.sin(omega) * sev * 80;
        break;
      }
      case 'encoder-angle': {
        // dq 解耦失败 → 三相幅值整体增大 + 整体相位偏移
        const k = 1 + sev * 0.6;
        const phi = sev * 0.8;
        ia = Math.sin(omega + phi) * Ibase * k;
        ib = Math.sin(omega + phi - TWO_PI_THIRDS) * Ibase * k;
        ic = Math.sin(omega + phi + TWO_PI_THIRDS) * Ibase * k;
        speed = speedNom * (1 - sev * 0.2) + Math.sin(t * Math.PI * 18) * sev * 60;
        break;
      }
      case 'speed-oscillation': {
        // 速度环增益过大 → 速度大幅振荡，反映在三相幅值上的低频包络
        const env = 1 + Math.sin(t * Math.PI * 14) * sev * 0.35;
        ia *= env; ib *= env; ic *= env;
        speed = speedNom + Math.sin(t * Math.PI * 14) * sev * 420;
        break;
      }
      case 'voltage-saturation': {
        // 调制度饱和（V_ref 超出 SVPWM 内切圆）→ 实际相电流幅值下降 + 出现负序 5/7 次谐波
        // 这里舍弃"削顶卡通图"（那是线电压不是相电流的特征），改成更接近实际的 KCL 守恒形态
        const reductionK = 1 - sev * 0.4;
        const h5 = sev * 0.18;
        const h7 = sev * 0.08;
        // 5/7 次谐波在三相中分别相位旋转 ±120°×n，sum 仍为 0（保持 KCL）
        const a5 = Math.sin(omega * 5);
        const b5 = Math.sin(omega * 5 + TWO_PI_THIRDS);
        const c5 = Math.sin(omega * 5 - TWO_PI_THIRDS);
        const a7 = Math.sin(omega * 7);
        const b7 = Math.sin(omega * 7 - TWO_PI_THIRDS);
        const c7 = Math.sin(omega * 7 + TWO_PI_THIRDS);
        ia = (phaseA + a5 * h5 + a7 * h7) * Ibase * reductionK;
        ib = (phaseB + b5 * h5 + b7 * h7) * Ibase * reductionK;
        ic = (phaseC + c5 * h5 + c7 * h7) * Ibase * reductionK;
        speed = speedNom * (1 - sev * 0.15);
        break;
      }
      case 'startup-fail': {
        // 启动失败：开环段三相高频抖动，速度始终爬不起来；后段被故障保护截断
        if (t < 0.55) {
          const wob = Math.sin(t * Math.PI * 42) * sev * 1.5;
          ia = phaseA * Ibase + wob;
          ib = phaseB * Ibase - wob * 0.5;
          ic = phaseC * Ibase - wob * 0.5;
          speed = speedNom * (1 - sev * 0.7) + Math.sin(t * Math.PI * 30) * sev * 100;
        } else {
          // 故障保护切断后电流归零、电机自由滑行；高严重度下残速接近零
          const cut = (1 - sev) * (1 - sev);
          ia *= cut; ib *= cut; ic *= cut;
          speed = speedNom * cut;
        }
        break;
      }
      case 'dc-undervolt': {
        // 母线下跌 → 调制度饱和 → 三相略升后出现高频毛刺；毛刺分布满足 KCL=0
        voltage = udcNom - sev * 90 - (t > 0.5 ? sev * 30 : 0);
        const k = 1 + sev * 0.5;
        const distort = t > 0.5 ? Math.sin(t * Math.PI * 40) * sev * 1.0 : 0;
        ia = phaseA * Ibase * k + distort;
        ib = phaseB * Ibase * k - distort * 0.5;
        ic = phaseC * Ibase * k - distort * 0.5;
        speed = speedNom * (1 - sev * 0.4 * Math.max(0, t - 0.3));
        break;
      }
      case 'over-temp': {
        // 热保护降额：电流幅值与转速随 t 单调下降
        const k = 1 - sev * t * 0.5;
        ia *= k; ib *= k; ic *= k;
        speed = speedNom * k;
        break;
      }
      case 'vibration': {
        // 28Hz 机械振动 → 三相幅值同步调制 + 速度同频脉动
        const env = 1 + Math.sin(t * Math.PI * 28) * sev * 0.3;
        ia *= env; ib *= env; ic *= env;
        speed = speedNom + Math.sin(t * Math.PI * 28) * sev * 180;
        break;
      }
    }

    return { t: t * 100, ia, ib, ic, speed, voltage };
  });
}

/** 状态位类故障：电气量无可见特征，UI 应显示文字告警卡而不是波形图。 */
export function isStatusOnlyFault(type: FaultType): boolean {
  return type === 'oil-low';
}
