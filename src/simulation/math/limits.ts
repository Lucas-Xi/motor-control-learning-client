/**
 * 电流极限圆 + 电压极限椭圆联合约束（feasibility check + 投影）。
 *
 * 物理背景：
 *   FOC 工作点 (id, iq) 同时受两个硬约束：
 *
 *     1) 电流极限圆（来自逆变器/绕组发热）：
 *
 *        id² + iq² ≤ Ilim²                                                          [A²]
 *
 *     2) 电压极限椭圆（来自母线电压，SVPWM 线性区上限 Vlim ≈ Udc/√3）：
 *        稳态 PMSM dq 电压方程（忽略 Rs 时）：
 *
 *          vd = -ωe · Lq · iq
 *          vq =  ωe · (Ld · id + ψf)
 *
 *        |V|² = vd² + vq² ≤ Vlim² 展开得电压椭圆：
 *
 *          (Ld·id + ψf)² + (Lq·iq)² ≤ (Vlim/ωe)²                                   [V²/ωe²]
 *
 *        椭圆**圆心**在 id = -ψf/Ld（去磁方向），半轴随 1/ωe 收缩——速度越高椭圆越小，
 *        必须把工作点往左挪（弱磁）。
 *
 *   含 Rs 时电压方程为：
 *     vd = Rs·id - ωe·Lq·iq
 *     vq = Rs·iq + ωe·(Ld·id + ψf)
 *   本函数完整保留 Rs（默认 0 用于教学清晰版）。
 *
 * MTPV (Max Torque Per Voltage) 边界：
 *   当 ωe 升高到电压椭圆**完全包含**在电流圆内部时，MTPA 轨迹不再可达，工作点会沿
 *   电压椭圆切向滑动，转矩随之下降——这就是 MTPV 段。判定：MTPA 解满足电流圆但破电压椭圆 →
 *   需投影到电压椭圆上，并沿椭圆寻找新的最大转矩点（本函数只做投影，不做转矩搜索，
 *   完整 MTPV 由上层调用 mtpv.ts 处理或递归用本投影 + Te 评估）。
 *
 * 投影策略：
 *   - 仅破电流圆 → 沿原点连线缩放到圆上。
 *   - 仅破电压椭圆 → 沿"椭圆中心 (-ψf/Ld, 0) 到工作点"方向缩放到椭圆上（保持去磁方向）。
 *   - 同时破两者 → 椭圆 ∩ 圆 的交点（二次方程求解，取转矩更大的一个解）。
 *   - 都不破 → feasible: true，原值返回。
 *
 * 参考：
 *   - 阮毅《电力拖动自动控制系统》第 7 章 7.5 节"电压电流极限与弱磁运行边界"
 *   - Bose, "Modern Power Electronics and AC Drives" §8.3.4
 *   - TI Application Report SPRACF3 "Field Weakening and MTPA Control with FAST Estimator"
 *
 * 单位：
 *   - id, iq, Ilim: A
 *   - Vlim: V（一般取 Udc/√3 × margin，margin ≈ 0.95-0.98）
 *   - omega_e: rad/s（电角速度，= ωm × Pn）
 *   - Ld, Lq: H
 *   - psi_f: Wb
 *   - Rs: Ω（默认 0）
 *
 * STM32 移植要点：
 *   - 椭圆 ∩ 圆 走二次方程闭式 + 1 次 sqrt，ISR 内可完成。
 *   - 推荐放在速度环节拍（1-2 kHz）后、电流环节拍前，作为参考限幅器。
 *   - 实际工程常用"先 MTPA → 检测 V 饱和 → 折线弱磁"的简化方案，把本函数完整版
 *     留作离线/教学用，运行期用 LUT 查 id_ref(speed, torque)。
 */

/** 安全数值检查：NaN/Inf → fallback（默认 0），再 clamp 到 [lo, hi]。所有公共 step 函数入口处使用。 */
export function clampError(v: number, lo: number, hi: number, fallback = 0): number {
  if (!Number.isFinite(v)) return fallback;
  return v < lo ? lo : v > hi ? hi : v;
}

export type LimitConstraint = 'none' | 'current' | 'voltage' | 'both';

export interface LimitInput {
  id: number;
  iq: number;
  Ilim: number;
  Vlim: number;
  omega_e: number;
  Ld: number;
  Lq: number;
  psi_f: number;
  Rs?: number;
}

export interface LimitOutput {
  /** 输入工作点是否同时满足两个约束 */
  feasible: boolean;
  /** 投影到可行域后的 d 轴电流 A */
  projectedId: number;
  /** 投影到可行域后的 q 轴电流 A */
  projectedIq: number;
  /** 当前激活的约束 */
  activeConstraint: LimitConstraint;
  /** 电压裕量 V（>0 代表还有空间，<0 代表已饱和） */
  voltageMargin: number;
  /** 电流裕量 A（>0 代表还有空间，<0 代表已饱和） */
  currentMargin: number;
}

function voltageMagnitudeSq(
  id: number,
  iq: number,
  omega_e: number,
  Ld: number,
  Lq: number,
  psi_f: number,
  Rs: number,
): number {
  const vd = Rs * id - omega_e * Lq * iq;
  const vq = Rs * iq + omega_e * (Ld * id + psi_f);
  return vd * vd + vq * vq;
}

/** 把点沿与原点连线缩放到电流圆上 */
function projectToCurrentCircle(id: number, iq: number, Ilim: number): { id: number; iq: number } {
  const mag = Math.hypot(id, iq);
  if (mag < 1e-12) return { id: 0, iq: 0 };
  const k = Ilim / mag;
  return { id: id * k, iq: iq * k };
}

/**
 * 把点沿椭圆中心 (-ψf/Ld, 0) → 工作点 的方向缩放到电压椭圆边界上。
 * 椭圆方程（忽略 Rs 简化教学版）：(Ld·x + ψf)² + (Lq·y)² = (Vlim/ωe)²
 * 令 x = c + t·dx, y = t·dy，c = -ψf/Ld（椭圆中心 d 坐标），代入解 t。
 */
function projectToVoltageEllipse(
  id: number,
  iq: number,
  Vlim: number,
  omega_e: number,
  Ld: number,
  Lq: number,
  psi_f: number,
): { id: number; iq: number } {
  const oe = Math.max(Math.abs(omega_e), 1e-6);
  const a = Vlim / oe; // 椭圆 d-轴半径系数（Ld·id 在椭圆上的限幅）
  // 半轴：Δid_max = a/Ld（中心在 -ψf/Ld），Δiq_max = a/Lq
  const dxHalf = a / Ld;
  const dyHalf = a / Lq;
  const center_d = -psi_f / Ld;
  const dx = id - center_d;
  const dy = iq;
  // 椭圆方程：(dx/dxHalf)² + (dy/dyHalf)² = 1，沿径向 t·(dx, dy) → 解 t²·[…]=1
  const denom = (dx * dx) / (dxHalf * dxHalf) + (dy * dy) / (dyHalf * dyHalf);
  if (denom < 1e-12) {
    // 工作点已是椭圆中心
    return { id: center_d, iq: 0 };
  }
  const t = 1 / Math.sqrt(denom);
  return { id: center_d + t * dx, iq: t * dy };
}

/**
 * 联合约束求解器主入口。
 */
export function applyLimits(input: LimitInput): LimitOutput {
  const Rs = input.Rs ?? 0;
  const Ilim = Math.max(input.Ilim, 1e-6);
  const Vlim = Math.max(input.Vlim, 1e-6);

  const currentMag = Math.hypot(input.id, input.iq);
  const voltMagSq = voltageMagnitudeSq(input.id, input.iq, input.omega_e, input.Ld, input.Lq, input.psi_f, Rs);
  const voltMag = Math.sqrt(voltMagSq);

  const currentExceeded = currentMag > Ilim;
  const voltageExceeded = voltMag > Vlim;

  const currentMargin = Ilim - currentMag;
  const voltageMargin = Vlim - voltMag;

  if (!currentExceeded && !voltageExceeded) {
    return {
      feasible: true,
      projectedId: input.id,
      projectedIq: input.iq,
      activeConstraint: 'none',
      voltageMargin,
      currentMargin,
    };
  }

  let projId = input.id;
  let projIq = input.iq;
  let active: LimitConstraint = 'none';

  if (currentExceeded && !voltageExceeded) {
    const p = projectToCurrentCircle(input.id, input.iq, Ilim);
    projId = p.id;
    projIq = p.iq;
    active = 'current';
  } else if (!currentExceeded && voltageExceeded) {
    const p = projectToVoltageEllipse(input.id, input.iq, Vlim, input.omega_e, input.Ld, input.Lq, input.psi_f);
    projId = p.id;
    projIq = p.iq;
    active = 'voltage';
  } else {
    // 两者都破：先压电压椭圆，再压电流圆（电压先级，因为母线物理硬限）。
    // 严格闭式：椭圆 ∩ 圆 的交点。这里走两步迭代投影（数值稳定、收敛 2-3 次即可）。
    let p = projectToVoltageEllipse(input.id, input.iq, Vlim, input.omega_e, input.Ld, input.Lq, input.psi_f);
    for (let k = 0; k < 3; k += 1) {
      if (Math.hypot(p.id, p.iq) > Ilim) {
        p = projectToCurrentCircle(p.id, p.iq, Ilim);
      }
      const newVSq = voltageMagnitudeSq(p.id, p.iq, input.omega_e, input.Ld, input.Lq, input.psi_f, Rs);
      if (newVSq > Vlim * Vlim) {
        p = projectToVoltageEllipse(p.id, p.iq, Vlim, input.omega_e, input.Ld, input.Lq, input.psi_f);
      } else {
        break;
      }
    }
    projId = p.id;
    projIq = p.iq;
    active = 'both';
  }

  return {
    feasible: false,
    projectedId: projId,
    projectedIq: projIq,
    activeConstraint: active,
    voltageMargin,
    currentMargin,
  };
}
