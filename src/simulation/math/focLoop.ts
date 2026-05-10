import { clamp } from '../../utils/clamp';
import type { FOCParams } from '../engine/types';

/**
 * 单点的 FOC 电流环时域响应。
 *
 * 模型（教学级简化、非物理级真实）：
 *   - 电机 dq 等效电感 Ld=Lq=L=1.2 mH，电阻 R=0.55 Ω
 *   - 电频率 ω = 2π × electricalFreq；ω 项产生 dq 之间的交叉耦合（vd 含 -ωLq·iq、vq 含 ωLd·id+ωψf）
 *   - 控制器：标准 dq 解耦 PI（不做完整前馈，看见交叉串扰是教学的一部分）
 *   - 角度误差 thetaErrorDeg：实际电机 dq 与控制器 dq 之间相差 Δθ，造成串扰
 *   - 采样延迟 samplingDelaySamples：控制器看到的 id/iq 来自 N 个 PWM 周期之前
 *   - 输出限幅 voltageLimit：模拟 SVPWM 线性区
 *
 * 输出：[{t, idRef, iqRef, id, iq, vd, vq}, ...]
 */
export interface FocLoopSample {
  t: number;        // ms
  idRef: number;
  iqRef: number;
  id: number;
  iq: number;
  vd: number;
  vq: number;
}

const R = 0.55;          // Ω 相电阻
const L = 1.2e-3;        // H dq 等效电感
const PSI_F = 0.045;     // Wb 永磁磁链
const PWM_FREQ = 16000;  // Hz PWM 频率，等同采样频率
const DT = 1 / PWM_FREQ; // s 单步
const TOTAL = 0.06;      // s 总仿真时长 60 ms（足以观察阶跃响应）

export function simulateFocCurrentLoop(params: FOCParams): FocLoopSample[] {
  const omega = 2 * Math.PI * params.electricalFreq;
  const dThetaErr = (params.thetaErrorDeg * Math.PI) / 180;
  // 测量旋转矩阵：[cos Δθ, sin Δθ; -sin Δθ, cos Δθ]
  // 实际 dq → 测量 dq 的旋转
  const cosE = Math.cos(dThetaErr);
  const sinE = Math.sin(dThetaErr);

  let id = 0, iq = 0;            // 真实 dq 电流
  let intD = 0, intQ = 0;        // PI 积分器
  // 延迟环节（采样反馈）：环形缓冲
  const delayN = Math.max(0, Math.floor(params.samplingDelaySamples));
  const idBuf: number[] = new Array(delayN + 1).fill(0);
  const iqBuf: number[] = new Array(delayN + 1).fill(0);
  let bufHead = 0;

  const samples: FocLoopSample[] = [];

  const totalSteps = Math.round(TOTAL / DT);
  for (let step = 0; step <= totalSteps; step++) {
    // 1) 写入测量缓冲（采样发生在控制器看见之前的 N 个周期）
    //    控制器读到的 id/iq 还要旋转一个角度误差
    const idMeasReal = idBuf[bufHead];
    const iqMeasReal = iqBuf[bufHead];
    const idMeas = idMeasReal * cosE + iqMeasReal * sinE;
    const iqMeas = -idMeasReal * sinE + iqMeasReal * cosE;

    // 2) PI 控制（在控制器视角的 dq）
    const ed = params.idRef - idMeas;
    const eq = params.iqRef - iqMeas;
    intD = clamp(intD + ed * DT, -200, 200);
    intQ = clamp(intQ + eq * DT, -200, 200);
    let vdCmd = params.kp * ed + params.ki * intD;
    let vqCmd = params.kp * eq + params.ki * intQ;
    // 限幅（圆形限幅，更接近 SVPWM 线性区）
    const vMag = Math.hypot(vdCmd, vqCmd);
    if (vMag > params.voltageLimit) {
      vdCmd = (vdCmd / vMag) * params.voltageLimit;
      vqCmd = (vqCmd / vMag) * params.voltageLimit;
    }

    // 3) 把控制器命令变换回真实 dq（反向旋转角度误差）
    const vdReal = vdCmd * cosE - vqCmd * sinE;
    const vqReal = vdCmd * sinE + vqCmd * cosE;

    // 4) PMSM dq 电流方程一阶离散
    //    vd = R id + L did/dt - ω L iq
    //    vq = R iq + L diq/dt + ω L id + ω ψf
    const didDt = (vdReal - R * id + omega * L * iq) / L;
    const diqDt = (vqReal - R * iq - omega * L * id - omega * PSI_F) / L;
    id += didDt * DT;
    iq += diqDt * DT;

    // 5) 把"真实 dq"写入采样缓冲（下一步控制器读到，延迟 N 步）
    bufHead = (bufHead + 1) % (delayN + 1);
    idBuf[bufHead] = id;
    iqBuf[bufHead] = iq;

    // 6) 每隔若干步输出一个样本（chart 不需要 16k pts）
    if (step % 8 === 0) {
      samples.push({
        t: step * DT * 1000,
        idRef: params.idRef,
        iqRef: params.iqRef,
        id,
        iq,
        vd: vdReal,
        vq: vqReal,
      });
    }
  }

  return samples;
}

export interface FocLoopMetrics {
  iqRiseTimeMs: number | null;     // 上升到 90% 时间
  iqOvershootPct: number;           // 超调百分比
  iqSteadyError: number;            // 稳态误差
  idCrossTalkPeak: number;          // Id 串扰峰值（理论应为 0）
}

export function evaluateFocLoop(samples: FocLoopSample[], iqRef: number): FocLoopMetrics {
  if (samples.length === 0) {
    return { iqRiseTimeMs: null, iqOvershootPct: 0, iqSteadyError: 0, idCrossTalkPeak: 0 };
  }
  let iqRiseTimeMs: number | null = null;
  let iqMax = -Infinity;
  let idCrossTalkPeak = 0;
  for (const s of samples) {
    if (iqRiseTimeMs === null && Math.abs(s.iq) >= Math.abs(iqRef) * 0.9 && Math.abs(iqRef) > 1e-3) {
      iqRiseTimeMs = s.t;
    }
    if (s.iq > iqMax) iqMax = s.iq;
    idCrossTalkPeak = Math.max(idCrossTalkPeak, Math.abs(s.id - samples[0].id));
  }
  const last = samples[samples.length - 1];
  const iqOvershootPct = iqRef > 1e-3 ? Math.max(0, ((iqMax - iqRef) / iqRef) * 100) : 0;
  const iqSteadyError = iqRef - last.iq;
  return { iqRiseTimeMs, iqOvershootPct, iqSteadyError, idCrossTalkPeak };
}
