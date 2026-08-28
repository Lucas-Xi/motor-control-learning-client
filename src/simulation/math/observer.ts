import { wrapAngleRad } from '../../utils/clamp';

export interface BemfObserverInput {
  vAlpha: number;
  vBeta: number;
  iAlpha: number;
  iBeta: number;
  prevIAlpha: number;
  prevIBeta: number;
  rs: number;
  ls: number;
  dt: number;
}

export interface BemfEstimate { eAlpha: number; eBeta: number; angle: number; speedElectrical: number; }

/**
 * 简化反电动势观测：e = v - R*i - L*di/dt。
 * 低速时反电动势幅值很小，噪声会淹没角度，这也是无感 FOC 启动困难的根源。
 *
 * 角度反推：PMSM 反电动势 e_α = -ψω·sinθ、e_β = +ψω·cosθ，
 * 所以 atan2(e_β, e_α) = atan2(ψω·cosθ, -ψω·sinθ) = θ + π/2，
 * 因此 θ = atan2(e_β, e_α) − π/2。
 * 历史上这里写成 `+π/2` 会把估算角偏 +π（即转子相位反向），导致 θ=0 实测得到 π。
 * 参考：Bose《Modern Power Electronics and AC Drives》第 8 章 PMSM Drive。
 */
export function estimateBackEmf(input: BemfObserverInput): BemfEstimate {
  const dt = Math.max(input.dt, 1e-6);
  const eAlpha = input.vAlpha - input.rs * input.iAlpha - input.ls * (input.iAlpha - input.prevIAlpha) / dt;
  const eBeta = input.vBeta - input.rs * input.iBeta - input.ls * (input.iBeta - input.prevIBeta) / dt;
  return { eAlpha, eBeta, angle: wrapAngleRad(Math.atan2(eBeta, eAlpha) - Math.PI / 2), speedElectrical: Math.hypot(eAlpha, eBeta) };
}

export interface PLLState { angle: number; omega: number; integral: number; }
export interface PLLGains { kp: number; ki: number; }

/**
 * 创建 PLL 初始状态。
 * angle 是当前估算角度，omega 是角速度估算，integral 负责消除稳态相位误差。
 */
export function createPllState(): PLLState {
  return { angle: 0, omega: 0, integral: 0 };
}

/**
 * PLL 角度跟踪：用相位误差推动角速度估计，工程上常用于 SMO/反电动势角度的平滑锁相。
 */
export function pllTrack(measuredAngle: number, state: PLLState, gains: PLLGains, dt: number): PLLState {
  const error = Math.atan2(Math.sin(measuredAngle - state.angle), Math.cos(measuredAngle - state.angle));
  const integral = state.integral + error * dt;
  const omega = gains.kp * error + gains.ki * integral;
  const angle = wrapAngleRad(state.angle + omega * dt);
  return { angle, omega, integral };
}

/**
 * HFI → BEMF 混合观测器。
 *
 * 在极低速（< 300 rpm）使用 HFI 角度（高频注入）；
 * 在中高速（> 600 rpm）使用 BEMF 角度（反电动势观测）；
 * 中间 300-600 rpm 线性融合，实现无感切换过渡。
 *
 * @param hfiAngle  高频注入估算角度（rad）
 * @param bemfAngle 反电动势估算角度（rad）
 * @param rpm       当前机械转速
 * @param transitionLow  融合起始转速（rpm），默认 300
 * @param transitionHigh 融合完成转速（rpm），默认 600
 * @returns 融合后的角度
 */
export function blendObserverAngle(
  hfiAngle: number,
  bemfAngle: number,
  rpm: number,
  transitionLow = 300,
  transitionHigh = 600,
): { angle: number; blendRatio: number } {
  if (rpm <= transitionLow) return { angle: hfiAngle, blendRatio: 0 };
  if (rpm >= transitionHigh) return { angle: bemfAngle, blendRatio: 1 };

  const t = (rpm - transitionLow) / (transitionHigh - transitionLow);
  // 从两个角度中选择最短路径的加权平均
  const diff = bemfAngle - hfiAngle;
  const wrappedDiff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const angle = wrapAngleRad(hfiAngle + t * wrappedDiff);
  return { angle, blendRatio: t };
}


/**
 * 硬切：低于 switchRpm 用 HFI，到达或超过则瞬间换成 BEMF。
 * 交接瞬间 θ 跳 Δθ = wrap(bemf − hfi)，电流环会吃一拳。
 * 工业压缩机无感启动必须用融合带，不能在一个转速点换人。
 */
export function hardCutObserverAngle(
  hfiAngle: number,
  bemfAngle: number,
  rpm: number,
  switchRpm = 450,
): { angle: number; source: 'hfi' | 'bemf' } {
  if (rpm < switchRpm) return { angle: hfiAngle, source: 'hfi' };
  return { angle: bemfAngle, source: 'bemf' };
}

export interface ObserverBlendSample {
  rpm: number;
  hfiDeg: number;
  bemfDeg: number;
  blendDeg: number;
  hardCutDeg: number;
  jumpDeg: number; // |hfi − bemf| 最短路径，硬切会在 switchRpm 一次性吃掉
  blendRatio: number; // 0=HFI, 1=BEMF
}

/** Wrap degrees to (−180, 180]. */
function wrapDeg(deg: number): number {
  const period = 360;
  let x = deg % period;
  if (x <= -180) x += period;
  if (x > 180) x -= period;
  return x;
}

/**
 * 扫转速：HFI 角带固定偏置+低速噪声，BEMF 角低速误差大、高速收敛。
 * 每点同时给出融合角与硬切角，对照“摊在转速上”和“一次跳完”。
 */
export function sweepObserverBlend(opts: {
  transitionLow?: number;
  transitionHigh?: number;
  hfiBiasDeg?: number;
  rpmMin?: number;
  rpmMax?: number;
  points?: number;
}): ObserverBlendSample[] {
  const transitionLow = opts.transitionLow ?? 300;
  const transitionHigh = Math.max(opts.transitionHigh ?? 600, transitionLow + 1);
  const hfiBiasDeg = opts.hfiBiasDeg ?? 0;
  const rpmMin = opts.rpmMin ?? 0;
  const rpmMax = opts.rpmMax ?? 1500;
  const points = Math.max(2, Math.round(opts.points ?? 41));
  const switchRpm = (transitionLow + transitionHigh) / 2;

  const samples: ObserverBlendSample[] = [];
  for (let i = 0; i < points; i++) {
    const frac = i / (points - 1);
    const rpm = rpmMin + frac * (rpmMax - rpmMin);
    // HFI 零速可用：误差几乎平坦（偏置 + 4°）
    const hfiDeg = wrapDeg(hfiBiasDeg + 4);
    // BEMF 零速淹死：~40°，1500 rpm 收敛到 ~2°
    const bemfDeg = wrapDeg(40 * Math.exp(-rpm / 220));
    const hfiRad = (hfiDeg * Math.PI) / 180;
    const bemfRad = (bemfDeg * Math.PI) / 180;
    const blended = blendObserverAngle(
      hfiRad,
      bemfRad,
      rpm,
      transitionLow,
      transitionHigh,
    );
    const hardCut = hardCutObserverAngle(hfiRad, bemfRad, rpm, switchRpm);
    samples.push({
      rpm,
      hfiDeg,
      bemfDeg,
      blendDeg: wrapDeg((blended.angle * 180) / Math.PI),
      hardCutDeg: wrapDeg((hardCut.angle * 180) / Math.PI),
      jumpDeg: Math.abs(wrapDeg(bemfDeg - hfiDeg)),
      blendRatio: blended.blendRatio,
    });
  }
  return samples;
}
