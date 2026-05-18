/**
 * 术语表条目。
 *
 * `term` / `definition` 永远保留中文（仓库默认语种）。
 * `termEn` / `definitionEn` 可选，当 UI 切到 en-US 时优先采用；
 * 缺失时由 UI 回退中文并附加 sr-only "(zh fallback)" 提示。
 */
export interface GlossaryEntry {
  term: string;
  definition: string;
  termEn?: string;
  definitionEn?: string;
}

export const glossary: GlossaryEntry[] = [
  {
    term: 'FOC',
    definition: 'Field Oriented Control，磁场定向控制，把电流分解为励磁 Id 和转矩 Iq。',
    termEn: 'FOC',
    definitionEn: 'Field-Oriented Control: decomposes the stator current into magnetising Id and torque Iq components in the rotor dq frame.',
  },
  {
    term: 'SVPWM',
    definition: 'Space Vector PWM，用空间电压矢量合成三相逆变器占空比。',
    termEn: 'SVPWM',
    definitionEn: 'Space-Vector PWM — synthesises the three-phase inverter duty cycles by combining adjacent voltage vectors and the zero vector inside each switching period.',
  },
  {
    term: '电角度',
    definition: '电磁场周期对应的角度，等于机械角度乘以极对数。',
    termEn: 'Electrical angle',
    definitionEn: 'The angle of the rotating electromagnetic field, equal to the mechanical angle multiplied by the number of pole pairs (θe = p·θm).',
  },
  {
    term: 'Id',
    definition: 'd 轴电流，通常对应磁链方向；弱磁时常为负。',
    termEn: 'Id',
    definitionEn: 'Direct-axis current — aligned with the rotor flux; usually driven negative during field-weakening.',
  },
  {
    term: 'Iq',
    definition: 'q 轴电流，主要产生电磁转矩。',
    termEn: 'Iq',
    definitionEn: 'Quadrature-axis current — the dominant source of electromagnetic torque.',
  },
  {
    term: 'PLL',
    definition: '锁相环，用相位误差估算并平滑角度/速度。',
    termEn: 'PLL',
    definitionEn: 'Phase-Locked Loop — estimates and smooths angle / speed from a phase-error signal.',
  },
  {
    term: 'JSQR',
    definition: 'STM32 ADC 注入通道序列寄存器；JEXTSEL 选 TIM1 TRGO/CC4 作为触发源，让 ADC 在 PWM 中点自动采样。',
    termEn: 'JSQR',
    definitionEn: 'STM32 ADC Injected Sequence Register; JEXTSEL selects TIM1 TRGO/CC4 as the trigger so the ADC samples automatically at the PWM midpoint.',
  },
  {
    term: 'BDTR',
    definition: 'STM32 高级定时器（TIM1/TIM8）的死区与刹车寄存器；DTG 字段编码死区时间，MOE 是主输出使能。',
    termEn: 'BDTR',
    definitionEn: 'Break and Dead-Time Register on STM32 advanced timers (TIM1/TIM8). The DTG field encodes dead-time; MOE is the main output enable.',
  },
  {
    term: 'OCP',
    definition: 'Over-Current Protection 过流保护；硬件比较器 (COMP+TIM1 BKIN) 触发为快速 OCP，软件累积 I²t 触发为慢速 OCP。',
    termEn: 'OCP',
    definitionEn: 'Over-Current Protection. Fast OCP comes from a hardware comparator (COMP + TIM1 BKIN); slow OCP comes from accumulated I²t in software.',
  },
  {
    term: 'I²t',
    definition: '电流平方对时间积分，用来等价模拟绕组温升；超过预设阈值即报"长时过流"，区别于瞬时过流。',
    termEn: 'I²t',
    definitionEn: 'Time integral of squared current — approximates winding temperature rise. Crossing the threshold reports long-duration over-current, distinct from instantaneous OC.',
  },
  {
    term: 'Z 信号',
    definition: '增量编码器每圈一次的索引脉冲，用来周期性复位累计计数器漂移；接 TIM 输入捕获中断。',
    termEn: 'Z signal',
    definitionEn: 'Once-per-revolution index pulse from an incremental encoder; used to periodically reset accumulated counter drift. Typically wired to a TIM input-capture channel.',
  },
  {
    term: 'CCR',
    definition: 'Capture / Compare Register；写入 TIMx->CCR1/2/3 决定三相 PWM 占空比，预装载使能后下一周期生效。',
    termEn: 'CCR',
    definitionEn: 'Capture/Compare Register on STM32 timers. Writing TIMx->CCR1/2/3 sets the three-phase PWM duty cycles; with preload enabled, the new value takes effect on the next period.',
  },
  {
    term: '反液击',
    definition: '压缩机启动时限制加速斜坡（典型 300~800 rpm/s），让液态制冷剂有时间气化避免阀片碎裂。',
    termEn: 'Anti-slugging',
    definitionEn: 'Limiting the compressor start-up acceleration ramp (typically 300–800 rpm/s) so liquid refrigerant can vapourise and avoid valve-reed damage.',
  },
  {
    term: 'APF',
    definition: 'Annual Performance Factor 全年能效比，按 GB 21455 加权多工况点；变频机靠部分负荷高 COP 拉高 APF。',
    termEn: 'APF',
    definitionEn: 'Annual Performance Factor — weighted multi-condition energy-efficiency metric (GB 21455). Inverter machines raise APF through high part-load COP.',
  },
  {
    term: 'V/f',
    definition: '电压频率比开环拖动；启动初段 BEMF 太小观测不到时使用，按 V_min + k·f 给定电压矢量"硬拖"转子。',
    termEn: 'V/f',
    definitionEn: 'Volts-per-hertz open-loop drive. Used during early start-up when the BEMF is too small to observe; the voltage reference follows V_min + k·f to drag the rotor.',
  },
  {
    term: '抗积分饱和',
    definition: 'Anti-Windup；PI 输出撞限时停止 / 反算 (Back-Calc) 积分累加，避免 windup 大超调。',
    termEn: 'Anti-Windup',
    definitionEn: 'Stops or back-calculates the PI integrator when the output saturates, preventing the wind-up overshoot.',
  },
  {
    term: 'MTPA',
    definition: 'Maximum Torque Per Ampere，同电流幅值下最大转矩的工作点轨迹；IPM 上 MTPA 天然带负 Id。',
    termEn: 'MTPA',
    definitionEn: 'Maximum Torque Per Ampere — the operating-point locus that yields the most torque for a given current magnitude. On IPM motors MTPA naturally carries a slightly negative Id.',
  },
  {
    term: 'MTPV',
    definition: 'Maximum Torque Per Voltage，同电压下最大转矩的工作点；深度弱磁的边界，越过则功率反而下降。',
    termEn: 'MTPV',
    definitionEn: 'Maximum Torque Per Voltage — the operating point that yields the most torque for a given voltage. Marks the deep-field-weakening boundary; crossing it lowers power.',
  },
  {
    term: '电压椭圆',
    definition: 'Id-Iq 平面上 √(Vd²+Vq²)≤V_max 的几何边界；中心 (−ψf/Ld, 0)，半径 ∝ 1/ωe，转速越高椭圆越小。',
    termEn: 'Voltage ellipse',
    definitionEn: 'The geometric boundary √(Vd²+Vq²) ≤ V_max on the Id-Iq plane. Centred at (−ψf/Ld, 0); the radius scales as 1/ωe, so the ellipse shrinks as speed rises.',
  },
  {
    term: '退磁阈值',
    definition: '永磁体反向磁场 H_d 越过 BH 曲线"膝点"后发生不可逆退磁；高温下阈值降低 (NdFeB ≈ 0.6%/℃)。',
    termEn: 'Demagnetisation threshold',
    definitionEn: 'Once the reverse field H_d crosses the knee of the BH curve, the permanent magnet suffers irreversible demagnetisation. The threshold drops with temperature (NdFeB ≈ 0.6%/°C).',
  },
  {
    term: 'EEV',
    definition: 'Electronic Expansion Valve 电子膨胀阀；步进电机驱动的针阀，按 SH 闭环 PI 控制冷媒流量。',
    termEn: 'EEV',
    definitionEn: 'Electronic Expansion Valve — a stepper-driven needle valve that meters refrigerant flow under closed-loop superheat (SH) PI control.',
  },
  {
    term: 'SH',
    definition: '吸气过热度 = T_suct − T_sat(P_s)；EEV PI 的反馈量。SH<3K 液击预警，>15K 缺氟预警。',
    termEn: 'SH (Superheat)',
    definitionEn: 'Suction superheat = T_suct − T_sat(P_s); the feedback signal for the EEV PI. SH < 3 K warns of liquid slug; SH > 15 K warns of refrigerant shortage.',
  },
  {
    term: 'SC',
    definition: '冷凝过冷度 = T_sat(P_d) − T_liquid；保证节流前 100% 液态，<2K 时 EEV 流量会被闪发气泡扰乱。',
    termEn: 'SC (Subcooling)',
    definitionEn: 'Condenser subcooling = T_sat(P_d) − T_liquid; ensures the refrigerant is fully liquid before throttling. Below 2 K, flash gas disturbs the EEV flow.',
  },
  {
    term: 'P-h 图',
    definition: '焓压图；蒸气压缩循环 4 状态点 (吸气/排气/过冷液/两相) 在图上构成的多边形是制冷工艺路线图。',
    termEn: 'P-h diagram',
    definitionEn: 'Pressure-enthalpy diagram. The four state points of the vapour-compression cycle (suction / discharge / subcooled liquid / two-phase) form the process polygon of the refrigeration cycle.',
  },
  {
    term: '压缩机包线',
    definition: '(rpm, 压比) 或 (T_e, T_c) 平面上的机械寿命安全运行区；超出 → 排气温度/油循环/阀片寿命任何一项报废。',
    termEn: 'Compressor envelope',
    definitionEn: 'The safe-operation region on the (rpm, pressure-ratio) or (T_e, T_c) plane. Operating outside the envelope sacrifices discharge temperature, oil circulation or valve-reed life.',
  },
];
