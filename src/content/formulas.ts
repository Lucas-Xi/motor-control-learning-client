/**
 * 公式速查（30 条）。所有 entry 双语：
 *   - name / explanation 保留中文（缺省）
 *   - nameEn / explanationEn 在 locale==='en-US' 时优先采用
 *   - expression 是数学公式本身，不翻译
 *
 * UI 消费见 src/components/lab/* 与 GuidedExperimentBar / ConceptNotes：
 *   读 useI18n().locale，en-US 时取 nameEn / explanationEn，缺失自动回退中文。
 */
export interface FormulaEntry {
  key: string;
  name: string;
  nameEn?: string;
  expression: string;
  /** 中文解释（口诀 / 单位 / 工程量级），可选；UI 显示在表达式下方。 */
  explanation?: string;
  /** 英文解释；缺失时回退 explanation。 */
  explanationEn?: string;
}

export const formulaIndex: FormulaEntry[] = [
  {
    key: 'clarke',
    name: 'Clarke 变换',
    nameEn: 'Clarke transform',
    expression: 'Iα = Ia, Iβ = (Ia + 2Ib) / √3',
    explanation: '把三个 120° 错开的标量压成 αβ 平面二维矢量；幅值不变形式 (TI/ST FOC SDK 缺省)。',
    explanationEn: 'Compress three 120°-shifted scalars into a 2-D αβ vector. Amplitude-invariant form (default in TI/ST FOC SDKs).',
  },
  {
    key: 'park',
    name: 'Park 变换',
    nameEn: 'Park transform',
    expression: 'Id = Iα cosθ + Iβ sinθ, Iq = -Iα sinθ + Iβ cosθ',
    explanation: '跳到与磁场同步旋转的 dq 坐标系，AC 矢量变成 DC，PI 可以零稳态误差跟踪。',
    explanationEn: 'Rotate into the dq frame synchronous with the field. AC vector becomes DC, so PI can track with zero steady-state error.',
  },
  {
    key: 'torque',
    name: 'PMSM 转矩',
    nameEn: 'PMSM torque equation',
    expression: 'Te = 1.5 p [ψf Iq + (Ld - Lq) Id Iq]',
    explanation: '第一项永磁转矩 (SPM/IPM 共有)，第二项磁阻转矩 (仅 IPM)。MTPA 偏负 Id 把第二项压榨出来。',
    explanationEn: 'First term: permanent-magnet torque (SPM/IPM). Second term: reluctance torque (IPM only). MTPA biases Id negative to harvest it.',
  },
  {
    key: 'svpwm',
    name: 'SVPWM 调制比',
    nameEn: 'SVPWM modulation index',
    expression: 'm = √3 |Uref| / Udc',
    explanation: '线性区上限 m=1，对应 |Uref| = Udc/√3 ≈ 0.577·Udc，比 SPWM 多 15% 母线利用率。',
    explanationEn: 'Linear region tops out at m=1, i.e. |Uref| = Udc/√3 ≈ 0.577·Udc — 15 % more DC-bus utilisation than SPWM.',
  },
  {
    key: 'voltage-limit',
    name: '电压极限',
    nameEn: 'Voltage limit',
    expression: '√(Vd² + Vq²) ≤ Udc / √3',
    explanation: 'SVPWM 线性区外圆；撞顶后必须弱磁 (负 Id) 或限速。',
    explanationEn: 'Outer circle of SVPWM linear region. Once you hit it, field-weakening (negative Id) or speed-limiting is mandatory.',
  },
  {
    key: 'electrical-freq',
    name: '电频率',
    nameEn: 'Electrical frequency',
    expression: 'fe = (rpm / 60) × polePairs',
    explanation: '6 极对压缩机 6000 rpm → fe=600 Hz；PWM 选 ≥30×fe 才能给电流环留带宽。',
    explanationEn: 'A 6-pole-pair compressor at 6000 rpm → fe=600 Hz. Pick PWM ≥30×fe to leave headroom for the current loop.',
  },
  {
    key: 'bemf',
    name: '反电动势',
    nameEn: 'Back-EMF',
    expression: 'BEMF = Ke × ω_e × polePairs = ψf × ω_e',
    explanation: '高速段 BEMF 撞母线即"基速"——必须弱磁削等效磁链才能继续升速。',
    explanationEn: 'When BEMF reaches the bus at high speed you have hit the "base speed". Weakening flux is the only way to push higher.',
  },
  {
    key: 'pi-bandwidth',
    name: '电流环带宽整定',
    nameEn: 'Current-loop bandwidth tuning',
    expression: 'Kp = ω_bw × L,  Ki = ω_bw × R  (零极点对消)',
    explanation: '把 PI 零点放在电机电气极点上，闭环成一阶低通；典型 ω_bw=2π·1000 rad/s。',
    explanationEn: 'Place the PI zero on the motor electrical pole so the closed loop becomes first-order. Typical ω_bw=2π·1000 rad/s.',
  },
  {
    key: 'antiwindup-bc',
    name: '抗积分饱和 (Back-Calc)',
    nameEn: 'Anti-windup (back-calc)',
    expression: 'I_term += Kt × (u_sat - u_unsat) × Ts,  Kt ≈ Ki / Kp',
    explanation: '输出撞限时把"被吃掉的差"反扣回积分器，避免下次反向需大幅卸饱和。',
    explanationEn: 'When the output saturates, subtract the clipped portion back from the integrator so the next reversal does not have to dump excess wind-up.',
  },
  {
    key: 'deadtime-loss',
    name: '死区电压损失',
    nameEn: 'Dead-time voltage loss',
    expression: 'ΔV_dt = (t_dead / Ts) × Udc × sign(I_phase)',
    explanation: '过零附近 sign 函数抖动会让补偿适得其反；工程上 |I|<0.3A 设"过零禁区"不补偿。',
    explanationEn: 'Near zero-crossing the sign function jitters and compensation backfires. In practice use a |I|<0.3 A "dead zone" with no compensation.',
  },
  {
    key: 'ocp-i2t',
    name: 'I²t 过流积分',
    nameEn: 'I²t over-current integral',
    expression: 'I²t = ∫ I² dt  (累积到阈值即报 FAULT_OC_I2T)',
    explanation: '允许短时大电流但限制累积能量；比"瞬时硬过流"更贴合绕组热模型。',
    explanationEn: 'Allows short transient over-current but caps cumulative energy. Matches the winding thermal model better than an instantaneous trip.',
  },
  {
    key: 'vf-ratio',
    name: 'V/f 启动比例',
    nameEn: 'V/f start-up ratio',
    expression: 'V_cmd = V_min + (V_rated - V_min) × (fe / fe_rated)',
    explanation: '无感低速段开环拖动；V_min 留磁阻压降，避免堵转启动失败。',
    explanationEn: 'Open-loop drag in the sensor-less low-speed band. V_min covers the resistive drop so the motor does not stall at start-up.',
  },
  {
    key: 'ramp-rate',
    name: '反液击斜坡',
    nameEn: 'Anti-slug ramp rate',
    expression: 'dω/dt ≤ rampRpmS;  压缩机典型 300~800 rpm/s',
    explanation: '太陡会把缸内残液瞬间汽化撞阀片；太缓启动时间长。',
    explanationEn: 'Too steep ramps flash residual liquid into vapour and hammer the valve plate; too gentle drags out the start-up time.',
  },
  {
    key: 'clarke-q15',
    name: 'Clarke q15 整数实现',
    nameEn: 'Clarke q15 fixed-point implementation',
    expression: 'Iβ = (Ia + 2·Ib) × 18919 >> 15  (18919 ≈ 32768/√3)',
    explanation: '无 FPU 的 Cortex-M0/M3 上 100 ns 完成一次 Clarke，比软浮点快 10×。',
    explanationEn: 'On FPU-less Cortex-M0/M3 cores this runs Clarke in ~100 ns, 10× faster than soft-float.',
  },
  {
    key: 'kcl-residual',
    name: 'KCL 残差自检',
    nameEn: 'KCL-residual self-check',
    expression: '|I0| = |Ia + Ib + Ic|/3;  健康 < 1% Imax，> 5% 触发偏置/缺相告警',
    explanation: '免费的硬件健康度听诊器——一行 if 在 FOC ISR 末尾就能跑。',
    explanationEn: 'A free hardware health stethoscope — one if-statement at the end of the FOC ISR is enough.',
  },
  {
    key: 'dq-decoupling',
    name: 'dq 解耦前馈',
    nameEn: 'dq decoupling feed-forward',
    expression: 'vd_ff = −ω·Lq·iq;  vq_ff = ω·(Ld·id + ψf)  (高速段必加)',
    explanation: '抵消旋转电机模型里 d↔q 的交叉耦合，让 Id/Iq 像独立 SISO 一样调。',
    explanationEn: 'Cancels the d↔q cross-coupling in the rotating motor model so Id and Iq behave like independent SISO loops.',
  },
  {
    key: 'svpwm-minmax',
    name: 'SVPWM min-max 零序注入',
    nameEn: 'SVPWM min–max zero-sequence injection',
    expression: 'voff = −(vmax + vmin)/2;  duty = 0.5 + (v + voff)/Udc',
    explanation: '比传统扇区判断 + T1/T2 公式快 3×；产线代码主流写法。',
    explanationEn: 'Roughly 3× faster than the classical sector / T1-T2 formulation. Mainstream choice for production code.',
  },
  {
    key: 'hfi-gain',
    name: 'HFI 凸极信号增益',
    nameEn: 'HFI saliency signal gain',
    expression: 'gain = (r − 1)/(r + 1),  r = Lq/Ld;  r=1.5 → 0.20, r=2.5 → 0.43',
    explanation: 'IPM 凸极比越大信号越强；SPM (r≈1) HFI 失效，必须用 BEMF 观测器。',
    explanationEn: 'The bigger the IPM saliency, the stronger the signal. On SPM (r≈1) HFI breaks down and you must fall back to a BEMF observer.',
  },
  {
    key: 'hfi-demod',
    name: 'HFI 解调误差',
    nameEn: 'HFI demodulation error',
    expression: 'i_response × cos(ωh·t) → LPF → ≈ 0.5·sin(2·Δθ)',
    explanation: '解调后的 sin(2·Δθ) 喂 PLL 把角度误差驱到 0；2× 倍频本质决定初始极性需另判。',
    explanationEn: 'The sin(2·Δθ) component drives a PLL that nulls the angle error. The 2× factor is why initial polarity still needs a separate check.',
  },
  {
    key: 'pfc-boost',
    name: 'Boost PFC 升压关系',
    nameEn: 'Boost-PFC voltage ratio',
    expression: 'Udc = Vrect / (1 − D);  D=0.4 + 220V AC → Udc ≈ 520V (工程限 D≤0.5)',
    explanation: '占空比上限 0.5 留磁复位余量；> 0.6 后电感饱和、效率崩。',
    explanationEn: 'Cap the duty cycle at 0.5 to leave inductor reset margin. Beyond 0.6 the core saturates and efficiency collapses.',
  },
  {
    key: 'pfc-cap-ripple',
    name: 'PFC 母线电容纹波',
    nameEn: 'PFC bus-capacitor ripple',
    expression: 'ΔUdc ≈ I_load / (2·ω_line·C);  按目标纹波 % 反推 C',
    explanation: '50 Hz 电网二次纹波 100 Hz；空调 5 % 纹波 + 1.5 kW 负载 → ≈ 470 μF/600 V。',
    explanationEn: 'On a 50 Hz grid the second-harmonic ripple is 100 Hz; for an air-conditioner with 5 % ripple and 1.5 kW load this lands around 470 μF / 600 V.',
  },
  {
    key: 'foc-total-delay',
    name: 'FOC 总采样-生效延迟',
    nameEn: 'FOC end-to-end actuation delay',
    expression: 't_delay ≈ 1.5·Ts (ADC 中点 + CCR 预装载);  电流环带宽上限 ≈ 1/(2π·1.5·Ts)',
    explanation: '16 kHz PWM (Ts=62.5 μs) → 带宽上限 ≈ 1.7 kHz；要更高带宽就只能升 PWM。',
    explanationEn: 'At 16 kHz PWM (Ts=62.5 μs) the bandwidth ceiling is ~1.7 kHz; the only way higher is to raise PWM.',
  },
  {
    key: 'fw-base-speed',
    name: '弱磁基速',
    nameEn: 'Field-weakening base speed',
    expression: 'ω_base = V_max / ψf;  V_max = Udc/√3 (SVPWM 线性区)',
    explanation: '基速以下 Id*=0；基速以上必须负 Id 削等效磁链。',
    explanationEn: 'Below base speed keep Id*=0. Above it you must apply negative Id to weaken the effective flux.',
  },
  {
    key: 'fw-id-feedforward',
    name: '弱磁 Id 前馈解析',
    nameEn: 'Field-weakening Id feed-forward (analytical)',
    expression: 'Id* = √(V_max² − (ωe·Lq·Iq)²) / (ωe·Ld) − ψf/Ld',
    explanation: '电压椭圆守恒解出最优 Id*；模块 11 与 FW 控制器直接套用。',
    explanationEn: 'Comes from the voltage-ellipse constraint — used directly as the Id* feed-forward in the field-weakening controller (module 11).',
  },
  {
    key: 'mtpa-ipm',
    name: 'IPM MTPA 解析解',
    nameEn: 'IPM MTPA analytic solution',
    expression: 'Id* = (ψf − √(ψf² + 8(Ld−Lq)²·Iq²)) / (4(Ld−Lq))',
    explanation: '每个 Iq 对应一条最优 Id*；查表化或在线计算都很常见。',
    explanationEn: 'Each Iq maps to an optimal Id*. Either tabulate the curve off-line or compute it live.',
  },
  {
    key: 'voltage-ellipse',
    name: '电压椭圆',
    nameEn: 'Voltage ellipse',
    expression: '(ψf + Ld·Id)² + (Lq·Iq)² ≤ (V_max/ωe)²;  中心 (−ψf/Ld, 0)',
    explanation: '随转速增大椭圆缩小；MTPA、MTPV、电流圆三条曲线在 Id-Iq 平面交织。',
    explanationEn: 'The ellipse shrinks as speed rises. MTPA, MTPV and the current circle weave together in the Id-Iq plane.',
  },
  {
    key: 'cop',
    name: '制冷 COP',
    nameEn: 'Refrigeration COP',
    expression: 'COP = q_c / w = (h₁ − h₄) / (h₂ − h₁)',
    explanation: '一级能效空调 COP > 4.0；变频器 + EEV 优化的目标函数就是它。',
    explanationEn: 'Grade-1 efficiency room ACs require COP > 4.0. The whole inverter + EEV optimisation chases this number.',
  },
  {
    key: 'superheat',
    name: '吸气过热度 SH',
    nameEn: 'Suction superheat (SH)',
    expression: 'SH = T_suct − T_sat(P_s);  EEV PI 反馈量，目标 5–10K',
    explanation: 'SH 过低液击风险；SH 过高蒸发器面积浪费、COP 掉。',
    explanationEn: 'Low SH risks liquid slugging; high SH wastes evaporator area and drops COP.',
  },
  {
    key: 'subcool',
    name: '冷凝过冷度 SC',
    nameEn: 'Condenser subcool (SC)',
    expression: 'SC = T_sat(P_d) − T_liquid;  目标 3–7K，<2K 节流闪发气泡',
    explanation: 'SC 不足时 EEV 入口出现两相流，节流能力打折，COP 下降。',
    explanationEn: 'Without enough subcool the EEV inlet becomes two-phase, throttling capability drops and COP suffers.',
  },
  {
    key: 'comp-torque-from-cycle',
    name: '压缩机负载转矩',
    nameEn: 'Compressor load torque',
    expression: 'τ_load = W_comp / ω_m = (m_dot·w) / (2π·rpm/60)',
    explanation: '把热力学循环功率反算回机械负载——FOC 速度环看到的就是这个 τ_load。',
    explanationEn: 'Convert the thermodynamic cycle power back to mechanical load — this is the τ_load the FOC speed loop sees.',
  },
];
