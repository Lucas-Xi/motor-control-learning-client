import type { ModuleWalkthrough } from './types';

/**
 * 08 三相逆变器 —— 把"6 个开关 + 死区 + 中心对齐 PWM + 硬件保护"这套硬件抽象讲透。
 *
 * 教学路径：拓扑 → 占空比到相电压代数 → 上下管互补的物理必要性 → 死区数值 + 方向 →
 * 自举电容设计 → BKIN 硬件保护 → 相 vs 线电压 → 中心对齐 PWM 与 ADC 同步。
 *
 * 工业绑定：家用 1.5 HP 空调外机（IPM 智能功率模块 Sanken SCM1241MF / Onsemi NFAM5065L4B），
 * 母线 310 V，PWM 8-16 kHz，IGBT/MOS 上桥臂自举电容 + 死区 1-3 μs；工业泵和 EV 主驱
 * 同拓扑放大到 600-800 V SiC MOSFET。本模块所有 C 片段以 STM32G4/F4 + HRTIM/TIM1 为底。
 */
export const inverterWalkthrough: ModuleWalkthrough = {
  moduleId: 'inverter',
  bigPicture: '6 个开关 + 3 桥臂 + 死区 + 中心对齐 PWM + BKIN 硬件保护 = 把 Vd/Vq 安全落到电机绕组上。',
  successCriteria: [
    '能画出三相桥拓扑，并说明上下管为什么必须互补、为什么必须做硬件死区不能只靠软件 if',
    '能算出占空比 → 相电压 → 线电压（相电压差 √3 倍），并知道电机铭牌 380V 是线电压有效值不是峰值',
    '能在 Sanken/Onsemi IPM datasheet 上查 t_d(off) 和 Q_g，反算合理死区和自举电容容值',
    '理解死区误差幅值 ΔV = t_d·f_pwm·Udc 与极性 sign(I_phase)，知道为什么过零附近补偿要禁用',
    '能用 TIM1 BDTR.MOE + BKIN 硬件关断把过流响应控制在 < 200 ns，而不是软件中断的 5-10 μs',
    '理解中心对齐 PWM + TIM1 update 事件触发 ADC = 采样窗精准对齐"电流纹波谷底"',
  ],
  steps: [
    {
      id: 'topology',
      title: '看拓扑',
      goal: '在 3D 拓扑上认全 6 个开关 + 3 桥臂 + 母线电容 + 续流二极管',
      action: '观察左侧 Inverter3D：上排 Q1/Q3/Q5（高侧管），下排 Q2/Q4/Q6（低侧管）；每对上下管的中点接电机一相绕组（U/V/W）；每个 MOSFET/IGBT 内部都有反并联续流二极管（IGBT 外置、SiC MOSFET 集成体二极管）。',
      observe: '直流母线 Udc 通过 6 个开关三对桥臂斩成三相交流；每相中点电位在 +Udc/2 和 -Udc/2 之间跳。',
      whyMatters: '这就是 IGBT/MOSFET 三相桥的全部硬件。家用 1.5 HP 空调外机几乎都是 IPM 集成模块（Sanken SCM1241MF 15A/600V、Onsemi NFAM5065L4B 15A/650V）一次封死六管 + 三相栅极驱动 + 短路保护 + 温度反馈，PCB 上只需要外加母线电容 + 自举电容。EV 主驱量级 600A 时上 SiC 分立模块；工业级 100 kW 风机用 IGBT 模块 + 独立驱动板。',
      quiz: {
        q: 'IPM 模块（如 SCM1241MF）相比"6 个分立 MOSFET + 独立栅驱"的最大工程价值是？',
        options: [
          '电流容量更大（其实分立可以并联拿到更大电流）',
          '集成栅驱、电平转换、短路保护、温度反馈，缩短设计周期且 EMC 容易过',
          '价格更便宜（实际 IPM 单价比同等分立方案贵 30-50%）',
          '损耗更小（其实分立优化得当损耗反而低）',
        ],
        correct: 1,
        hint: 'IPM 的"集成度"是核心价值：高侧自举驱动 + 隔离、UVLO、OCP、温度报警全在一个模块里，外围只需母线电容 + 自举电容；EMC 调试时间从分立方案的几周缩到几天。代价是单价贵、定制化弱、坏一颗换整模块。家电量产场景这笔账是划算的。',
      },
    },
    {
      id: 'duty-to-voltage',
      title: '占空比 → 相电压',
      goal: '把"占空比"和"相电压"在脑子里直接打通，并知道相 vs 线电压差 √3',
      action: '把 dutyA 从 0.5 调到 0.75，dutyB / dutyC 保持 0.5，观察右上 Va / Vb / Vc 数值和 Vab 波形。',
      observe: 'Va = (0.75 − 0.5)·Udc = 0.25·Udc；Vb = Vc ≈ 0；Vab = Va − Vb = 0.25·Udc 出现非零线电压。三相平衡正弦时线电压幅值 = 相电压幅值 × √3。',
      whyMatters: '"占空比 − 0.5"就是相对母线中点的归一化平均电压。所有 dq 控制器输出的 Vd/Vq 经反 Park + SVPWM 都会落到这三个占空比上，STM32 上就是写 TIM1->CCR1/CCR2/CCR3 三个寄存器。电机铭牌"380V AC"通常是线电压有效值 → 峰值 = 380·√2 ≈ 537V → 折算相电压峰值 = 537/√3 ≈ 310V → 母线 Udc 至少要 310V·√3 ≈ 537V 才能在 SVPWM 线性区跑满铭牌——这就是工业 380V 设备母线整流到 540V 左右的原因。家用 220V/110V 系统按比例缩。',
    },
    {
      id: 'complementary',
      title: '上下互补 + 直通',
      goal: '直观体会为什么同一桥臂的上下管必须互补，且必须硬件互锁',
      action: '想象极端情况：Q1 (A 相上管) 和 Q2 (A 相下管) 同时导通会发生什么？回到 PWMChart 观察当前的互补关系。',
      observe: '上下管同时开 → 母线 +Udc 经 Q1 → 中点 → Q2 → 地，瞬间形成直通短路；电流上升斜率 di/dt = Udc/Lσ（寄生电感几十 nH），微秒内就到上千安。',
      whyMatters: '直通是 IGBT/MOSFET 烧毁的头号杀手。STM32 TIM1 互补 PWM (CCxE + CCxNE) 在硬件层强制 OC 和 OCN 反相，配合 BDTR.DTG 强制死区；IPM 内部驱动 IC 再加一道"双管同时高电平闭锁"。这件事不能交给软件 if 判断——一旦中断丢失或被高优先级抢占，软件互锁就失效，毫秒级延迟下管子已经爆了。最小代码示例：TIM1->BDTR |= TIM_BDTR_MOE; TIM1->BDTR = (TIM1->BDTR & ~TIM_BDTR_DTG_Msk) | (DEAD_TIME_TICKS & TIM_BDTR_DTG_Msk); — 设完后硬件自动保证 OC/OCN 永远不同时高电平。',
      quiz: {
        q: '为什么不能用一个 STM32 GPIO 输出 PWM 直接驱动一对上下管的栅极？',
        options: [
          '电流不够大（栅驱大多 < 2A 已够）',
          '速度太慢（STM32 GPIO 高速模式 100 MHz 时上升沿 < 10 ns）',
          '高侧 MOSFET 源极电位在 0~Udc 之间跳，需要相对源极抬升 10-15V 才能开通，必须用浮地栅驱',
          'GPIO 不能输出 PWM（其实 TIM 接 GPIO 是标准做法）',
        ],
        correct: 2,
        hint: '高侧 MOSFET/IGBT 的源极/发射极 = 桥中点，电位随 PWM 跳变。栅极电压必须始终相对源极抬升 V_GS_th 以上（Si MOS 10-15V、SiC 18-20V）。所以高侧用自举电容 + 高侧驱动 IC（IR2110/UCC27xxx 等），低侧才能直接共地。选项 A/B 物理上能驱动但电平转换实现不了。',
      },
    },
    {
      id: 'deadtime',
      title: '死区时间数值',
      goal: '理解死区为什么必要、怎么按 IPM datasheet 选合理值',
      action: '右侧把"死区时间"从 1μs 拉到 4μs，再降到 0.5μs，观察相电压波形顶部凹槽深度和"死区损失"百分比。',
      observe: '4μs：相电压顶部明显凹槽，死区损失百分数升高；0.5μs：波形干净，但接近实际 IGBT 关断时间，有直通风险。',
      whyMatters: '死区 = 上管关断到下管打开之间的"空窗期"，让上管退出导通避免直通。典型选型流程：① 查 IPM datasheet 拿 t_d(off,max)（Sanken SCM1241MF 是 0.95 μs）+ t_r(rise time) + 温度漂移系数；② 死区 ≥ 1.5·t_d(off,max) + 安全余量（防 EMI 抖动），SCM1241MF 推荐 1.5-2 μs；③ STM32 TIM1 BDTR.DTG 寄存器实现：DTG[7:5]=000 时 DTG[4:0]·t_DTS = 死区，t_DTS = 1/f_clock。t_d 太小 → 直通烧管；t_d 太大 → 低速波形畸变啸叫、转矩纹波大。压缩机量产前必跑"宽温域死区扫描测试"（-20°C 到 105°C），高温下 IPM t_d(off) 会拉长 30%。',
      quiz: {
        q: 'PWM 频率 = 16 kHz，母线 Udc = 310V，把死区从 1 μs 加到 2 μs。一个 PWM 周期里损失的相电压百分比从多少变到多少？',
        options: [
          '从 0.8% 到 1.6%（死区时间占周期比例直接乘以 Udc）',
          '从 1.6% 到 3.2%',
          '从 8% 到 16%',
          '与死区时间无关，由 Udc 决定',
        ],
        correct: 1,
        hint: 'T_pwm = 1/16000 = 62.5 μs。死区损失比例 ≈ t_d/T_pwm，但每个周期上下管各有一次死区 → 实际是 2·t_d/T_pwm。1μs → 3.2%，2μs → 6.4%。注意题目"一个 PWM 周期里"在严格意义上应算上下两次切换的总损失。选项 B 是按"两次死区"的精确算法，选项 A 是"一次死区"近似——工业级估算更接近 B。',
      },
    },
    {
      id: 'deadtime-direction',
      title: '死区方向 + 补偿',
      goal: '抓住"死区电压误差方向 = sign(I_phase)"，理解为什么过零附近补偿要禁用',
      action: '想象 A 相电流 Ia > 0（流入电机）的瞬间：上管 Q1 占空比 Da，死区期间上下管都关，电流靠下管反并联续流二极管 D2 续流 → 相当于 Q1 "少导通" t_d；再想 Ia < 0（流出电机）时，死区期间电流靠 D1 续流 → 相当于 Q2 "少导通" t_d。',
      observe: '同样的 Da，Ia>0 时实际相电压比命令值低 t_d·f_pwm·Udc；Ia<0 时实际相电压比命令值高 t_d·f_pwm·Udc。误差是带 sign(Ia) 的方波。',
      whyMatters: '这就是死区补偿算法的根：在 PWM 命令上叠加 ΔV·sign(I_phase)。基础实现：' +
        ' float delta_v = DEAD_TIME * PWM_FREQ * V_DC;' +
        ' v_a_cmd += delta_v * sign(i_a);' +
        ' v_b_cmd += delta_v * sign(i_b);' +
        ' v_c_cmd += delta_v * sign(i_c); — 但电流过零附近（|I_phase| < I_thresh，典型 0.5-1A）极性翻转敏感，sign() 函数本身就在抖；如果不带死区让 sign 直接乘 ΔV，过零瞬间相电压跳 2·ΔV，电流环 PI 看到"假阶跃"开始振荡。生产代码必须加"电流死区"：if (fabs(i_phase) < I_DEAD_BAND) delta_v_phase = 0; — 牺牲过零附近的补偿精度换稳定性。压缩机低速 50-200 rpm 段（电流过零频繁）这条护栏决定是否啸叫。',
      quiz: {
        q: 'Da=0.6、Udc=48V、t_d=2μs、f_pwm=16kHz，A 相电流 Ia 从 +5A 跳到 -5A（电流过零），命令值不变时实际相电压瞬时跳变约多少？',
        options: [
          '不变（PI 自动补偿）',
          '约 ±1.5V（仅一次死区误差）',
          '约 3V 跳变（误差从 −1.5V 翻成 +1.5V，总跳变 2 倍）',
          '直接归零（电流过零电压跟着归零）',
        ],
        correct: 2,
        hint: 'ΔV = t_d·f_pwm·Udc = 2e-6·16000·48 ≈ 1.54V。Ia>0 时实际电压偏低 1.54V；Ia<0 时偏高 1.54V；过零瞬间总跳变 ≈ 3.08V。这就是低速过零抖动的物理根源——电流环 PI 看到不存在的"3V 阶跃"开始追，电流跟着抖。配电流死区禁用补偿 + 适当降速度环带宽是工业修法。',
      },
    },
    {
      id: 'bootstrap-cap',
      title: '自举电容容量',
      goal: '会按 IPM/驱动 IC datasheet 估算高侧自举电容，避免高 duty 下脱栅',
      action: '想象 IPM 高侧驱动用 +15V 自举：下管开通时通过自举二极管给 C_boot 充电到 ~14V（扣 1V 二极管压降）；上管开通期间靠 C_boot 维持栅极电压。C_boot 太小 → 上管开通时间一长，C_boot 电压跌到 UVLO 阈值（典型 10-11V）→ 高侧驱动锁死。',
      observe: '极端 duty（如 0.99）时下管几乎不导通，C_boot 几乎不充电；只要超过几个 PWM 周期就脱栅。生产 IPM 数据手册都会给"最小 C_boot"和"最大上管单次导通时间"。',
      whyMatters: '工程估算：C_boot ≥ Q_g / ΔV_boot，其中 Q_g 是上管栅极总电荷（datasheet 给，IGBT 典型 100 nC），ΔV_boot 是允许的电压跌落（典型 1V）。Sanken SCM1241MF 推荐 C_boot ≥ 4.7 μF，实际量产用 10 μF 钽电容留余量。另一条护栏：duty 必须强制 limit 到 [0.02, 0.98] — 即使 SVPWM 算出 0.995 也截到 0.98，让下管每个 PWM 周期至少导通 1.25 μs（@16 kHz）保证 C_boot 充电。这条 limit 写在 update_pwm_duty() 里，一旦漏写，高 duty 工况下随机脱栅，故障无法复现极难定位。',
    },
    {
      id: 'hw-protection',
      title: 'BKIN 硬件保护',
      goal: '理解为什么过流必须走 BKIN 硬件路径而不是软件中断',
      action: '回顾 STM32 TIM1 BKIN 路径：外部比较器（COMP1 或 LM393）输出接 TIM1_BKIN 引脚 → 触发时 BDTR.MOE 硬件清零 → 所有 PWM 输出强制低（OSSI 配置） → 全过程 < 200 ns 硬件级。',
      observe: '相比"过流 ADC 中断 → 软件判断 → 软件关 TIM1 EN"路径（典型 5-10 μs），BKIN 快 25-50 倍。IGBT 短路承受时间 t_sc 典型 < 10 μs，软件路径根本来不及。',
      whyMatters: '配置示例：' +
        ' TIM1->BDTR |= TIM_BDTR_BKE | TIM_BDTR_AOE | TIM_BDTR_BKP;' +
        ' /* BKE=1 使能 BKIN, BKP=1 高电平有效, AOE=0 故障后必须软件 ack 才恢复 */' +
        ' TIM1->BDTR &= ~TIM_BDTR_OSSI_Msk; /* 故障时所有 PWM 强制低 */' +
        ' TIM1->AF1 |= TIM1_AF1_BKINE; /* BKIN 引脚使能 */' +
        ' 中断响应里只做日志记录 + 状态机置 FAULT，不做关 PWM（已由硬件做完）：' +
        ' void TIM1_BRK_IRQHandler(void) { log_fault(OCP_TRIP, get_phase_currents()); state = FAULT; TIM1->SR &= ~TIM_SR_BIF; } ' +
        ' AOE=0 让故障锁存，必须人为 ack 后才能恢复 PWM——比"自动恢复"安全，避免间歇短路反复点火烧管。压缩机 IPM 通常还把内部短路标志接到另一路 BKIN2，双路保护。',
      quiz: {
        q: 'IGBT 短路承受时间 t_sc = 10 μs，PWM 频率 = 16 kHz。如果只用 ADC 中断（响应 5 μs + 软件关 PWM 3 μs）保护过流，最坏情况下管子能否保住？',
        options: [
          '能（5+3=8 μs < 10 μs）',
          '不能（ADC 触发本身要等到下一个采样点，平均延迟 31 μs >> t_sc）',
          '能（PWM 频率高所以采样快）',
          '不能（IGBT 必须用 BKIN 硬件路径）',
        ],
        correct: 1,
        hint: 'ADC 采样间隔 = T_PWM = 62.5 μs（注入触发在 PWM 中点）。短路发生后平均要等 T_PWM/2 ≈ 31 μs 才采到一次数据，加 5 μs ISR 进入 + 3 μs 软件关——总延迟 ~40 μs >> 10 μs t_sc，IGBT 已经爆了。BKIN 硬件路径 < 200 ns 才能赶上。选项 D 结论对但理由错（不是"IGBT 必须"，而是"软件路径来不及"）。',
      },
    },
    {
      id: 'center-vs-edge',
      title: '中心对齐 PWM',
      goal: '搞懂为什么电机控制几乎都用中心对齐 + ADC 触发在 update 事件',
      action: '回顾 STM32 TIM1 配置：CMS=01（中心对齐 mode 1）vs CMS=00（边沿对齐）。中心对齐时 ARR 计数器先升到 ARR 再降到 0，PWM 占空比对称分布在周期中点两侧。',
      observe: '中心对齐：三相 PWM 上升/下降沿不在同一时刻，开关瞬态错开，共模噪声小；周期中点（三相 PWM 全开或全关瞬间）电流纹波最小，是 ADC 采样的"零纹波点"。边沿对齐：三相 PWM 同时拉高 → 共模 EMI 集中爆发。',
      whyMatters: 'ADC 同步配置（关键三行）：' +
        ' TIM1->CR2 |= (4 << TIM_CR2_MMS_Pos); /* MMS=100, TRGO = update event */' +
        ' ADC1->CFGR |= (9 << ADC_CFGR_EXTSEL_Pos); /* EXT9 = TIM1_TRGO */' +
        ' ADC1->CFGR |= (1 << ADC_CFGR_EXTEN_Pos); /* 上升沿触发 */ ' +
        ' 这样每次 TIM1 计数到 ARR（PWM 中点）就自动启动 ADC 注入序列。注入序列优先级高于规则通道，会抢占采集 3 个相电流，14 个 ADC clock = ~1 μs 内完成。ADC 转换完成中断（JEOS）即为 FOC ISR 入口——电流采样、Clarke、Park、PI、反 Park、SVPWM 全部在这一个 ISR 里 4-6 μs 跑完。这就是 STM32 FOC 工程的标准时序骨架。',
    },
    {
      id: 'recap',
      title: '回到全局',
      goal: '把逆变器接回 FOC 全链路 + 故障安全栈',
      action: '回顾：FOC 算法链上一步是 SVPWM 输出三相占空比，下一步是 ADC 采到的 Ia/Ib 算 Iq 误差。逆变器在中间承担什么？',
      observe: '答：① 把三相占空比物理实现为相电压；② 提供 ADC 采样时序窗口（中心对齐 + 周期中点）；③ 通过死区/BKIN/IPM 内置 SC 三层保护抵御故障；④ 死区误差需靠死区补偿或电流环带宽吸收掉；⑤ 自举电容 + duty 限制保证高 duty 下不脱栅。',
      whyMatters: '把逆变器调好（PWM 互补 + 死区合理 + ADC 同步 + 硬件保护齐全 + 自举裕量），才能给上层电流环一个"干净的电压执行器"。生产中量产前必须过的逆变器测试：① 短路保护测试（电感性短路 + 阻性短路）② 宽温域死区扫描 ③ 高 duty 自举电容寿命测试（90%+ duty 持续 1 小时）④ EMC 辐射测试（中心对齐能过 Class B，边沿对齐基本过不了）。下一模块进入三闭环级联，看电流环 / 速度环 / 位置环如何分工协作给这个执行器下命令。',
    },
  ],
  pitfalls: [
    {
      id: 'deadtime-too-large',
      label: '试错：拍脑袋给死区 5 μs',
      symptom: '低速波形顶部凹槽严重，电机有明显啸叫和转矩纹波；测得 THD > 8%',
      why: 'ΔV = t_d·f_pwm·Udc，5 μs 在 16 kHz 下占 8% 周期，低速小电流时死区损失主导 → 相电压严重失真。生产中"低速啸叫"投诉过半都是这个。正确做法：按 IPM datasheet 的 t_d(off,max) × 1.5 + 100 ns 余量定，SCM1241MF 用 1.5 μs，NFAM5065L4B 用 1.5 μs，工业 IGBT 模块（Infineon FF600R12ME4）用 3-4 μs。不要"一律给 5 μs 保险"——这是新人最常见的过度保守。',
    },
    {
      id: 'deadtime-direction-wrong',
      label: '试错：死区补偿用 sign(占空比 - 0.5) 而不是 sign(I_phase)',
      symptom: '加了补偿后电机过零更抖、低速直接堵转',
      why: '死区误差方向 = sign(I_phase)，与占空比无关。新人最常见踩坑：sign(duty - 0.5) 在小电流时跟 sign(I_phase) 不一致 → 补偿方向反 → 把误差放大一倍。修复必须用滤波后的相电流取符号，过零窗口（|I| < I_dead_band）内禁用补偿。压缩机低速 100-300 rpm 段表现最明显：补偿对了流畅平滑，补偿反了听得到金属敲击。',
    },
    {
      id: 'no-hw-protection',
      label: '试错：只靠 ADC 软件中断处理过流',
      symptom: '过流瞬间还没等 ISR 响应，IPM 内部 SC 已先报警，但 STM32 没及时关 PWM → 下次开机 IPM 已废',
      why: 'IGBT/MOS 短路承受时间 t_sc < 10 μs，软件路径含 ADC 采样延迟 + ISR 入栈 + 判断 + 关 PWM 总耗 30-50 μs，差一个数量级。BKIN 硬件路径 < 200 ns，必须用。配置要点：BKE=1 使能、BKP 正确极性（IPM SC 通常是高电平触发）、AOE=0 锁存（必须人 ack）、OSSI 配低让故障时所有 PWM 拉低。这套配齐才有"过流保险丝"的效果。',
    },
    {
      id: 'no-duty-limit',
      label: '试错：duty 不强制截到 [0.02, 0.98]',
      symptom: '高速 + 高负载时随机出现"上管脱栅"现象，电流莫名飞掉触发 BKIN；故障无法复现、调参数没用',
      why: '极端 duty（>0.98）让下管几乎不导通，自举电容 C_boot 持续放电；几个 PWM 周期后 C_boot 跌破 UVLO 阈值 → 高侧驱动锁死 → 上管脱栅 → 桥臂"半通"状态电流失控 → BKIN 跳闸。修复：在 update_pwm_duty() 最后一行强制 ccr_a = clamp(ccr_a, 0.02*ARR, 0.98*ARR);  这一条限制看似牺牲 4% 调制比，实际"过调制" SVPWM 早就有别的优雅处理（圆内限幅），这里损失可忽略。漏写这一行是高速段最隐蔽的 bug 之一，能耗几个月才被发现。',
    },
  ],
  nextModuleHook: '现在你能让逆变器安全地把任意 Vd/Vq 落到电机上了，并且知道死区补偿、自举电容、BKIN 保护、ADC 同步四道硬件坎。下一步：09 控制回路看电流环 / 速度环 / 位置环三层级联怎么给这个执行器下命令，以及"为什么内环必须比外环快 5-10 倍"。',
};
