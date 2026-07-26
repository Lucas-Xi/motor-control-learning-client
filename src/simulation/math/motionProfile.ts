/**
 * S 曲线加减速轨迹规划（7 段加加速度限制型）
 *
 * 7 段 profile:
 *   T1: 加加速（jerk > 0）
 *   T2: 匀加速（a = 常数）
 *   T3: 减加速（jerk < 0）
 *   T4: 匀速
 *   T5: 加减速（jerk < 0）
 *   T6: 匀减速（a = 常数）
 *   T7: 减减速（jerk > 0）
 *
 * 规划策略：给定起始位置、速度、目标位置、最大速度、最大加速度、最大加加速度，
 * 生成时间-位置/速度/加速度/加加速度的轨迹点。
 *
 * 参考：S 曲线是伺服系统最常用的运动规划方法，比梯形曲线更平滑，
 * 避免加速度突变造成的机械冲击和振动。
 */

export interface SCurveInput {
  /** 起始位置 */
  p0: number;
  /** 起始速度 */
  v0: number;
  /** 结束位置 */
  p1: number;
  /** 结束速度（通常为 0） */
  v1: number;
  /** 最大速度限制 */
  vMax: number;
  /** 最大加速度限制 */
  aMax: number;
  /** 最大加加速度限制（越大越接近梯形，越小越平滑） */
  jMax: number;
  /** 采样周期（s），默认 0.001 */
  dt?: number;
}

export interface SCurveSegment {
  type: 'jerk_up' | 'accel' | 'jerk_down' | 'cruise' | 'jerk_up_dec' | 'decel' | 'jerk_down_dec';
  tStart: number;
  tEnd: number;
  /** 本段结束时位置 */
  pEnd: number;
  /** 本段结束时速度 */
  vEnd: number;
}

export interface SCurveResult {
  /** 各段时间段定义 */
  segments: SCurveSegment[];
  /** 总时长（s） */
  totalTime: number;
  /** 离散轨迹点 */
  trajectory: Array<{
    t: number;
    p: number;
    v: number;
    a: number;
    j: number;
  }>;
  /** 是否可达（vMax/aMax/jMax 是否满足距离约束） */
  feasible: boolean;
  /** 如不可达，最大可达速度 */
  achievedVMax: number;
}

/**
 * 计算单段加加速时间（加速度从 0 到 aMax）
 *
 * t_acc = aMax / jMax
 */
/**
 * 计算加加速段（T1）或减加速段（T3）的位移变化
 * 从速度 va 开始，加/减加速度 j 持续 t 秒。
 *
 * a(t) = j·t + a0
 * v(t) = ½·j·t² + a0·t + v0
 * p(t) = ⅙·j·t³ + ½·a0·t² + v0·t + p0
 */
function jerkSegmentDelta(v0: number, a0: number, j: number, t: number): { dv: number; dp: number; aEnd: number; vEnd: number } {
  const aEnd = a0 + j * t;
  const vEnd = v0 + a0 * t + 0.5 * j * t * t;
  const dp = v0 * t + 0.5 * a0 * t * t + (1 / 6) * j * t * t * t;
  return { dv: vEnd - v0, dp, aEnd, vEnd };
}

/**
 * 规划单轴 S 曲线轨迹。
 *
 * 算法：
 * 1. 计算总位移 D = p1 - p0
 * 2. 根据 D、vMax、aMax、jMax 判断是否可达
 * 3. 分配 T1-T7 段时间
 * 4. 按 dt 采样生成轨迹
 */
export function planSCurve(input: SCurveInput): SCurveResult {
  const {
    p0, v0, p1, vMax, aMax, jMax, dt = 0.001,
  } = input;

  const D = p1 - p0;
  const sign = D >= 0 ? 1 : -1;
  const absD = Math.abs(D);
  const absVMax = Math.abs(vMax);
  const absAMax = Math.abs(aMax);
  const absJMax = Math.abs(jMax);

  // 加加速段时间（从 0 到 aMax）
  const T1_full = absAMax / Math.max(absJMax, 1e-12);
  const vAfterT1_full = 0.5 * absJMax * T1_full * T1_full;
  const needTriangle = vAfterT1_full >= absVMax;

  // 实际能达到的 vMax/aMax/jMax
  let actualVMax: number;
  let actualAMax: number;
  let actualJMax: number;

  if (needTriangle) {
    const T1_tri = Math.sqrt(2 * absVMax / absJMax);
    actualAMax = absJMax * T1_tri;
    actualVMax = absVMax;
    actualJMax = absJMax;
  } else {
    actualVMax = absVMax;
    actualAMax = absAMax;
    actualJMax = absJMax;
  }

  // 计算加速段总位移（T1 + T2 + T3）
  const T1 = actualAMax / Math.max(actualJMax, 1e-12);
  const vAfterT1 = 0.5 * actualJMax * T1 * T1;
  const vRemaining = actualVMax - 2 * vAfterT1;
  const T2 = vRemaining > 1e-12 ? vRemaining / actualAMax : 0;
  const T3 = T1;

  // 加速段总位移
  // T1: ½·j·t³/3? 实际 p = ⅙·j·t³（从 a=0, v=0 开始）
  const pJerkSeg = actualJMax * T1 * T1 * T1 / 6;
  const pAccelSeg = vAfterT1 * T2 + 0.5 * actualAMax * T2 * T2;
  const pDeJerkSeg = (vAfterT1 + actualAMax * T2) * T3 + 0.5 * actualAMax * T3 * T3 - actualJMax * T3 * T3 * T3 / 6;
  const pAccelTotal = pJerkSeg + pAccelSeg + pDeJerkSeg;
  const minDist = 2 * pAccelTotal;

  // 如果距离不足，递归降低 vMax
  if (absD < minDist) {
    const speedScale = Math.sqrt(absD / Math.max(minDist, 1e-12));
    const adjustedVMax = Math.max(actualVMax * speedScale, 1e-6);
    return planSCurve({ ...input, vMax: adjustedVMax, dt });
  }

  // 匀速段 T4
  const T4 = (absD - 2 * pAccelTotal) / Math.max(actualVMax, 1e-12);

  // 减速段对称于加速段
  const T5 = T3;
  const T6 = T2;
  const T7 = T1;

  const totalTime = T1 + T2 + T3 + T4 + T5 + T6 + T7;

  // 生成离散轨迹
  const trajectory: Array<{ t: number; p: number; v: number; a: number; j: number }> = [];

  const segTimes = [T1, T2, T3, T4, T5, T6, T7];
  const segJerk = [actualJMax, 0, -actualJMax, 0, -actualJMax, 0, actualJMax];

  let p = 0;
  let v = v0 * Math.sign(D);
  let a = 0;

  const segments: SCurveSegment[] = [];
  const segTypes: Array<SCurveSegment['type']> = [
    'jerk_up', 'accel', 'jerk_down',
    'cruise',
    'jerk_up_dec', 'decel', 'jerk_down_dec',
  ];

  let tCursor = 0;
  for (let s = 0; s < 7; s++) {
    const segT = segTimes[s];
    const j = segJerk[s] * sign;
    const tStartTemp = tCursor;

    if (segT > 1e-12) {
      // 子步长采样
      const subSteps = Math.max(1, Math.ceil(segT / dt));
      for (let k = 0; k <= subSteps; k++) {
        const tau = k * segT / subSteps;
        const aHere = a + j * tau;
        const vHere = v + a * tau + 0.5 * j * tau * tau;
        const pHere = p + v * tau + 0.5 * a * tau * tau + (1 / 6) * j * tau * tau * tau;
        trajectory.push({
          t: tCursor + tau,
          p: p0 + pHere * sign,
          v: vHere * sign,
          a: aHere * sign,
          j: j * sign,
        });
      }

      const end = jerkSegmentDelta(v, a, j, segT);
      v = end.vEnd;
      a = end.aEnd;
      p += end.dp;
    }

    tCursor += segT;
    segments.push({
      type: segTypes[s],
      tStart: tStartTemp,
      tEnd: tCursor,
      pEnd: p0 + p * sign,
      vEnd: v * sign,
    });
  }

  return {
    segments,
    totalTime,
    trajectory,
    feasible: true,
    achievedVMax: actualVMax * sign,
  };
}

/**
 * 位置前馈量计算。
 *
 * 给定 S 曲线轨迹，前馈速度 = 规划速度 × 速度前馈增益，
 * 前馈加速度 = 规划加速度 × 加速度前馈增益。
 *
 * 位置前馈可以显著减小位置跟踪误差。
 */
export function computePositionFeedforward(
  profile: SCurveResult,
  time: number,
  kvff = 1.0,
  kaff = 0.0,
): { vFeedForward: number; aFeedForward: number } {
  // 在轨迹中查找对应时间的点
  const pt = profile.trajectory.find((p, i) =>
    p.t >= time || i === profile.trajectory.length - 1,
  ) ?? profile.trajectory[profile.trajectory.length - 1];

  return {
    vFeedForward: pt.v * kvff,
    aFeedForward: pt.a * kaff,
  };
}

export interface SCurveMetrics {
  /** 总移动时间（s） */
  totalTime: number;
  /** 最大速度（实际达到的） */
  peakVelocity: number;
  /** 最大加速度（实际达到的） */
  peakAccel: number;
  /** 最大加加速度（实际达到的） */
  peakJerk: number;
  /** 平均速度（m/s） */
  avgVelocity: number;
  /** S 曲线 vs 梯形曲线的理论时间节省比（S曲线/梯形），<1 表示梯形更快 */
  timeRatioToTrapezoid: number;
}

/**
 * 计算 S 曲线轨迹的压缩指标。
 */
export function computeSCurveMetrics(result: SCurveResult): SCurveMetrics {
  const peakVelocity = Math.max(...result.trajectory.map((p) => Math.abs(p.v)));
  const peakAccel = Math.max(...result.trajectory.map((p) => Math.abs(p.a)));
  const peakJerk = Math.max(...result.trajectory.map((p) => Math.abs(p.j)));
  const totalDist = Math.abs(
    result.trajectory[result.trajectory.length - 1].p - result.trajectory[0].p,
  );
  const avgVelocity = totalDist / Math.max(result.totalTime, 1e-12);

  // 梯形时间估计：t_trap = D/vMax + vMax/aMax（忽略 jerk）
  const vMax = peakVelocity;
  const aMax = peakAccel;
  const trapTime = vMax > 1e-12 && aMax > 1e-12
    ? totalDist / vMax + vMax / aMax
    : result.totalTime;

  return {
    totalTime: result.totalTime,
    peakVelocity,
    peakAccel,
    peakJerk,
    avgVelocity,
    timeRatioToTrapezoid: result.totalTime / Math.max(trapTime, 1e-12),
  };
}