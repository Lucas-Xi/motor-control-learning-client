import type { ModuleWalkthrough } from './types';

/**
 * 07 SVPWM —— 把 FOC 流水线最后一段"αβ 电压指令 → 三相占空比"讲透到生产实现。
 *
 * 教学重点（生产级深度）：
 *   ① 8 个开关状态的物理来源（三相两电平桥臂 2³ = 8）；
 *   ② 扇区判断的几何 + atan2 边界陷阱；
 *   ③ T1/T2/T0 时间分配 = 矢量加法 = 线性组合；
 *   ④ min-max 算法（中性点偏置）= 三次谐波注入 = 工业标准实现；
 *   ⑤ 七段式对称序列 = 中心对齐 PWM 自然产物 = 开关次数最小 + 纹波最小；
 *   ⑥ 死区时间 dt 必须放在 TIM1 BDTR 的 DTG 字段编码；
 *   ⑦ 自举电容 duty 边界 [0.02, 0.98]；
 *   ⑧ 过调制的圆内限幅 vs 六步运行切换。
 *
 * 工业绑定：空调压缩机 16 kHz IGBT 模块 + 3 μs 死区、洗衣机 8 kHz 省功耗 + 1.5 μs 死区、
 * EV 主驱 10 kHz SiC + 500 ns 死区（SiC 关断比 IGBT 快 10 倍）、
 * 工业伺服 STM32 H7 HRTIM 184 ps 分辨率 + 100 kHz PWM。
 */
export const svpwmWalkthrough: ModuleWalkthrough = {
  moduleId: 'svpwm',
  bigPicture: '把目标电压矢量按时间分给六边形里相邻两个基本矢量 + 零矢量；调色板只有 8 种颜色，靠"时间比例"调出任意色 + 多榨 15.5% 母线。',
  bigPictureEn: 'Time-share the target voltage vector across the two adjacent basic vectors + zero vectors of the hexagon; only 8 palette colors, but "time ratio" mixes any color and squeezes 15.5% more out of the bus.',
  successCriteria: [
    '能列举 8 种开关状态及其对应矢量（V0/V7 零矢量，V1-V6 六个非零矢量及其上桥臂二进制码）',
    '能口算 atan2(Uβ, Uα) → 扇区号，知道 [-π, π] → [0, 2π] 归一化的边界陷阱',
    '能解释 SVPWM 比 SPWM 多 15.5% 利用率的原因（min-max 偏置 = 三次谐波注入 = 零序不影响线电压）',
    '能识别过调制（m > 1.0）的现象、硬件后果与两种处置（圆内限幅 / 六步切换）',
    '知道为什么"七段式"对称序列是嵌入式实现的事实标准 + 它如何天然让 ADC 采样落在电流纹波谷',
    '会配 STM32 TIM1 BDTR / DTG 设死区，懂 duty 必须钳到 [0.02, 0.98] 给自举电容充电',
  ],
  successCriteriaEn: [
    'List 8 switch states and their vectors (V0/V7 zero vectors, V1–V6 nonzero vectors with their high-side binary codes).',
    'Mentally compute atan2(Uβ, Uα) → sector number and handle the [−π, π] → [0, 2π] normalization edge case.',
    'Explain why SVPWM gains 15.5% utilization over SPWM (min-max bias = 3rd-harmonic injection = zero sequence does not affect line voltage).',
    'Identify over-modulation (m > 1.0) phenomena, hardware consequences, and two handling options (in-circle limiting / six-step switching).',
    'Know why the seven-segment symmetric sequence is the de-facto embedded standard and how it naturally places ADC sampling at the current ripple valley.',
    'Configure STM32 TIM1 BDTR / DTG for dead time, and clamp duty to [0.02, 0.98] for bootstrap-capacitor charging.',
  ],
  steps: [
    {
      id: 'eight-states',
      title: '8 个状态',
      goal: '建立"三相桥臂 8 种开关组合 = 8 个电压矢量"的认知',
      goalEn: 'Build the mental model that "8 switch combinations of the three-phase bridge legs = 8 voltage vectors".',
      action: '观察左侧空间矢量六边形：6 个顶点是 V1(100) / V2(110) / V3(010) / V4(011) / V5(001) / V6(101)；中心两个零矢量 V0(000) 和 V7(111)。括号里的三位数表示 A/B/C 三相上桥臂状态（1 = 上管开通）。',
      observe: '六个非零矢量等长（幅值 = 2Udc/3），互相间隔 60°；构成正六边形。零矢量在原点。',
      observeEn: 'The six nonzero vectors have equal length (magnitude = 2Udc/3) and are spaced 60° apart, forming a regular hexagon. The zero vectors sit at the origin.',
      whyMatters: '三相两电平逆变器物理上只能输出这 8 种瞬时电压组合——这是硬件给定的"调色板"。SVPWM 的任务就是用"时间加权平均"在这有限调色板上合成出连续旋转的目标矢量。理解这一点，电机控制软件 / 硬件之间的语法就通了。注意 V0(000) 和 V7(111) 都是零矢量但开关状态不同——七段式实现里两者交替用，让 IGBT 开关次数减半（每相每周期开关 1 次），这是省功耗 + 降发热的硬件设计依据。',
      whyMattersEn: 'A three-phase two-level inverter can physically output only these 8 instantaneous voltage combinations — a hardware-given "palette". The job of SVPWM is to synthesize a continuously rotating target vector on this finite palette via "time-weighted averaging". Once this clicks, the syntax between motor-control software and hardware is unlocked. Note that V0(000) and V7(111) are both zero vectors but with different switch states — the seven-segment scheme alternates between them so IGBT switching count is halved (each leg switches only once per period), the hardware-design basis for lower losses and heat.',
      presetId: 'svpwm-sector',
    },
    {
      id: 'sector-decide',
      title: '判扇区',
      goal: '掌握 atan2(Uβ, Uα) → 扇区号的几何与代码',
      goalEn: 'Master the geometry and code for atan2(Uβ, Uα) → sector number.',
      action: '加载预设后，慢慢拖动电压矢量端点（或调 Uα/Uβ）让矢量绕一圈，从 0° → 60° → 120° → 180° → 240° → 300° → 360°。',
      observe: '六边形扇区按 1 → 2 → 3 → 4 → 5 → 6 → 1 依次高亮；探针里"扇区"数字同步切换。',
      observeEn: 'The hexagon sectors light up in sequence 1 → 2 → 3 → 4 → 5 → 6 → 1, and the "sector" number on the probe switches in sync.',
      whyMatters: '扇区号决定用哪两个相邻基矢量去合成目标。代码就是 `sector = floor(angle / 60°) + 1`，配合 atan2 的 [-π, π] → [0, 2π] 归一化。这一步算错（特别是 0° / 360° 边界），后面 T1/T2 全错，PWM 输出畸形。工业实现里有一个更巧的"无三角函数"判扇区法（min-max 算法直接给三相 duty），下一步会展开。',
      whyMattersEn: 'The sector number decides which two adjacent basic vectors are used to synthesize the target. The code is just `sector = floor(angle / 60°) + 1`, with atan2 normalized from [−π, π] → [0, 2π]. Get this wrong (especially at the 0° / 360° edge) and T1/T2 are all wrong, producing a distorted PWM output. Industrial implementations use a cleverer "trig-free" sector decision (the min-max algorithm gives three-phase duty directly), covered in the next step.',
      quiz: {
        q: 'Uα = -100、Uβ = +100，目标矢量落在第几扇区？',
        options: ['1', '2', '3', '4'],
        correct: 1,
        hint: 'atan2(100, -100) = 135°，落在 [120°, 180°) → 扇区 3。注意 atan2 参数顺序是 (y, x) = (Uβ, Uα)；写反 (Uα, Uβ) 会让扇区号顺序反转（矢量沿 x 轴镜像 → 旋转方向反），电机反转或卡死，是 SVPWM 实现最高发的 bug。',
        qEn: 'With Uα = −100 and Uβ = +100, in which sector does the target vector lie?',
        optionsEn: ['1', '2', '3', '4'],
        hintEn: 'atan2(100, −100) = 135°, falls in [120°, 180°) → sector 3. Note the atan2 argument order is (y, x) = (Uβ, Uα); reversing to (Uα, Uβ) flips the sector order (vector mirrored about the x axis → reversed rotation direction), causing the motor to reverse or stall. This is one of the most frequent bugs in SVPWM implementation.',
      },
    },
    {
      id: 't1-t2-t0',
      title: 'T1/T2/T0',
      goal: '理解时间分配是"线性组合"的本质',
      action: '保持矢量在扇区 1 内（如 Uα = 100、Uβ = 60），看右侧 T1 / T2 / T0 三条进度条的长度。把矢量幅值拉大（同时拉大 Uα/Uβ），观察 T0 怎么缩短。',
      observe: '矢量越长 T0 越短；当矢量幅值接近线性区边界时 T0 几乎为 0；继续增大就进入过调制（红色饱和徽标）。',
      whyMatters: 'T1·V1 + T2·V2 + T0·V0 = Ts·Uref。这是矢量加法：用 V1 在 T1 时间 + V2 在 T2 时间，剩下 T0 用零矢量"补足周期"。零矢量不贡献电压但贡献时间。T0 < 0 在物理上不可能（时间不能负），代码必须钳到 0——这就是过调制的硬件根源。扇区 1 内 T1/T2 的精确公式（用 Uα/Uβ 表达）：T1 = Ts·(√3·Uα − Uβ) / (2·Udc/√3) · 简化；T2 = Ts·Uβ/(Udc/√3)。各扇区有 6 套对偶公式——但下一步的 min-max 算法可以完全绕开。',
    },
    {
      id: 'modulation-index',
      title: '调制比',
      goal: '量化 m = √3·|Uref|/Udc 与线性区边界',
      action: '把 Uα、Uβ 拖到使 √(Uα² + Uβ²) ≈ Udc/√3 ≈ 179 V（默认 Udc = 310 V）。观察探针里"m"值。',
      observe: 'm 接近 1.0 时 T0 几乎为 0；m > 1.0 时饱和徽标变红，三相 duty 撞 [0, 1] 边界。',
      whyMatters: 'SVPWM 线性区上限 m = 1，对应相电压峰值 Udc/√3 ≈ 0.577·Udc。SPWM 线性区上限对应 0.5·Udc。两者比值 = 0.577 / 0.5 = 1.155 → SVPWM 多 15.5% 母线利用率。同样 310 V 母线，SVPWM 能输出更高线电压 → 电机能转更快或在高速段还有 PI 余量。这 15.5% 不是"小聪明"——它直接决定了空调压缩机能不能从 6000 rpm 拉到 7200 rpm（一级能效门槛），决定了 EV 主驱铭牌最大转速，决定了同样电机能省多少弱磁电流。',
      quiz: {
        q: '母线 Udc = 310 V，SVPWM 线性区最大相电压峰值是？',
        options: ['155 V', '179 V (Udc/√3)', '310 V', '220 V'],
        correct: 1,
        hint: 'SVPWM 最大相电压峰 = Udc/√3 ≈ 0.577 × Udc ≈ 179 V；SPWM 最大相电压峰 = Udc/2 = 155 V。这是 15.5% 利用率优势的几何来源。310 V 母线时 SVPWM 比 SPWM 多 24 V 可用电压——直接换算到最高转速可以多 13%。',
      },
    },
    {
      id: 'min-max-trick',
      title: 'min-max 算法',
      goal: '理解工程实现里的 min-max 偏置 = 三次谐波注入 + 零序不动线电压',
      action: '看下方"PWM 占空比"图：三相 duty 在一个 Ts 内是"鞍形波"——A 高、B 中、C 低。读对应的 min-max C 实现。',
      observe: '没有 sin/cos 表、没有扇区 if-else，单次调用 < 1 μs。扇区号只在最后顺手算出来用于诊断。',
      whyMatters: '这是工业级实现的"标准答案"。数学上等价于 SPWM + 注入三次谐波（频率 3 倍的零序分量）。三次谐波在三相中是同相的（零序），加进每相的占空比不影响线电压（线电压做差时零序抵消），但能把中性点电压"压下去"，让相电压有更大可用空间——这正是 15.5% 利用率优势的代数表达。STM32 上的最小骨架（< 1 μs @ 168 MHz）：' +
        ' /* 输入 vα, vβ, Udc；输出 duty_a/b/c ∈ [0, 1] */' +
        ' static inline void svpwm_minmax(float valpha, float vbeta, float udc,' +
        '                                  float *duty_a, float *duty_b, float *duty_c) {' +
        '   /* 反 Clarke：αβ → abc */' +
        '   float va = valpha;' +
        '   float vb = -0.5f * valpha + 0.8660254f * vbeta;  /* −0.5·vα + √3/2·vβ */' +
        '   float vc = -0.5f * valpha - 0.8660254f * vbeta;' +
        '   /* min-max 偏置：注入零序让三相居中 */' +
        '   float vmax = fmaxf(va, fmaxf(vb, vc));' +
        '   float vmin = fminf(va, fminf(vb, vc));' +
        '   float voff = -0.5f * (vmax + vmin);' +
        '   /* 归一化到 [0, 1] 占空比 */' +
        '   float scale = 1.0f / udc;' +
        '   *duty_a = 0.5f + (va + voff) * scale;' +
        '   *duty_b = 0.5f + (vb + voff) * scale;' +
        '   *duty_c = 0.5f + (vc + voff) * scale;' +
        '   /* 硬限位（自举电容 + 死区余量），见下一步 */' +
        '   *duty_a = fmaxf(0.02f, fminf(0.98f, *duty_a));' +
        '   *duty_b = fmaxf(0.02f, fminf(0.98f, *duty_b));' +
        '   *duty_c = fmaxf(0.02f, fminf(0.98f, *duty_c));' +
        ' }' +
        ' /* 调用方式：写 CCR */' +
        ' TIM1->CCR1 = (uint32_t)(duty_a * TIM1->ARR);' +
        ' TIM1->CCR2 = (uint32_t)(duty_b * TIM1->ARR);' +
        ' TIM1->CCR3 = (uint32_t)(duty_c * TIM1->ARR);' +
        ' 这是 TI Motor SDK / ST FOC SDK 完全一致的实现——没有 atan2、没有扇区 if-else、6 次乘加完成。所有"判扇区→查表 → 算 T1/T2/T0 → 拼七段"的教科书写法在工程上都被 min-max 取代。',
      quiz: {
        q: 'SVPWM 用 min-max 偏置 offset = -(vmax + vmin)/2 注入到三相 duty，对线电压有何影响？',
        options: [
          '线电压被削顶',
          '没影响——三相加同样偏置（零序分量），线电压做差时偏置抵消',
          '线电压翻倍',
          '相位被旋转 30°',
        ],
        correct: 1,
        hint: 'V_AB = V_A − V_B；若 V_A 和 V_B 加同样的 offset，做差时直接消掉。这是"中点平移不影响线电压"的本质，也是为什么可以白白拿到 15.5% 的母线利用率。注意：相电压（相对中性点）会变胖到鞍形波，但电机看的是线电压，鞍形 vs 正弦在电机内部完全等价。',
      },
    },
    {
      id: 'seven-segment',
      title: '七段式 + 中心对齐 PWM',
      goal: '理解嵌入式 PWM 寄存器层面的"对称插入"',
      action: '看 PWM 占空比图（右下 PWMChart）：扇区 1 内三相 duty 在一个 Ts 内是"鞍形波"——A 高、B 中、C 低，且开关序列对称。',
      observe: '一个 Ts 内序列：000 → 100 → 110 → 111 → 110 → 100 → 000（七段，关于 Ts/2 对称）。',
      whyMatters: '中心对齐 PWM 天然实现七段式：CCR 值决定开关切换时刻，对称布置让一个 Ts 内零矢量被劈成两半（前 T0/2 用 V0=000，后 T0/2 用 V7=111），开关次数最少（每相每周期开关 1 次）+ 电流纹波最小 + 谐波低。ADC 注入点放在 Ts/2 处（计数到 ARR），此时所有桥臂处于稳态 111 或 000，电流处于纹波谷——这就是上一模块 FOC 流水线"采样点 = PWM 中点"的硬件依据。STM32 配置：' +
        ' LL_TIM_SetCounterMode(TIM1, LL_TIM_COUNTERMODE_CENTER_UP_DOWN);' +
        ' LL_TIM_OC_SetMode(TIM1, LL_TIM_CHANNEL_CH1, LL_TIM_OCMODE_PWM1);' +
        ' LL_TIM_OC_EnablePreload(TIM1, LL_TIM_CHANNEL_CH1);  /* CCR 预装载：下周期生效 */' +
        ' LL_TIM_EnableARRPreload(TIM1);  /* ARR 也预装载 */' +
        ' /* 一次写 CCR1/2/3 后等 update 事件统一锁存，三相同步切换 */',
    },
    {
      id: 'deadtime-bdtr',
      title: '死区 + 自举电容',
      goal: '把 SVPWM 输出真正接到硬件（TIM1 BDTR/DTG + duty 钳位）',
      action: '想象目标：IGBT 模块要求 3 μs 死区（关断 + 余量），自举电容驱动上桥要求 duty ≤ 0.98。',
      observe: 'STM32 TIM1 168 MHz 时钟，DTG = 3 μs × 168 MHz = 504，按 BDTR DTG 编码规则查表填 0xFD（DTG[7:5]=111, DTG[4:0]=10101 = 21 → 死区 = (64+21)·16/168M ≈ 8 μs，要查表选最接近的）。',
      whyMatters: 'STM32 BDTR/DTG 死区配置完整骨架（生产代码必抄）：' +
        ' /* TIM1 BDTR 配置死区 3 μs（典型 IGBT） */' +
        ' /* DTG[7:0] 编码规则：见 RM0440 第 1547 页 */' +
        ' /* 0xxxxxxx：DT = DTG·tDTS，tDTS = 1/168M = 5.95 ns，最大 760 ns */' +
        ' /* 10xxxxxx：DT = (64+DTG[5:0])·2·tDTS，最大 1.52 μs */' +
        ' /* 110xxxxx：DT = (32+DTG[4:0])·8·tDTS，最大 3.05 μs */' +
        ' /* 111xxxxx：DT = (32+DTG[4:0])·16·tDTS，最大 6.10 μs */' +
        ' uint32_t dtg = 0xE0 | 31;  /* 111 11111 → (32+31)·16·5.95ns ≈ 6.0 μs，按 datasheet 选最接近 3 μs 的值 */' +
        ' /* 实际 3 μs：tDTS=5.95ns → 504 个 tDTS，落在 110xxxxx 区段（DTG=(504/8)-32=31）→ 0xDF */' +
        ' LL_TIM_OC_SetDeadTime(TIM1, dtg);  /* 写入 BDTR DTG[7:0] */' +
        ' LL_TIM_SetBreakPolarity(TIM1, LL_TIM_BREAK_POLARITY_HIGH);' +
        ' LL_TIM_EnableBRK(TIM1);  /* 启用刹车输入（接 OCP COMP 输出） */' +
        ' LL_TIM_EnableAllOutputs(TIM1);  /* MOE = 1，主输出使能 */' +
        ' /* 注意 duty 钳位：自举电容需要下管周期性导通充电 */' +
        ' duty = fmaxf(0.02f, fminf(0.98f, duty));  /* 给自举电容留 2% 周期 */' +
        ' 三个工程数字必须记：① IGBT 关断时间 ~1-2 μs，死区取关断时间 × 1.5-2，典型 3 μs；② SiC MOSFET 关断 ~100 ns，死区 500 ns 够；③ 自举电容典型 1 μF 自举 + 100 nF 退耦，duty 上限 0.98 留 2% 充电窗口。压缩机产线"出厂正常、客户家三个月后烧管子"几乎都是死区不够 + 上下管短时直通导致 IGBT 内部硅片缓慢退化的累积故障。',
    },
    {
      id: 'overmodulation',
      title: '过调制 + 圆内限幅',
      goal: '看清 m > 1 时的现象与硬件后果',
      action: '把 Uα 拉到 200 V、Uβ 拉到 120 V（合成幅值 ~233 V > 179 V 线性区）。',
      observe: '红色饱和警告出现；三相 duty 之一撞到 0 或 1；T0 进度条归零；输出电压频谱出现 5 / 7 / 11 次谐波。',
      whyMatters: '过调制 = T0 < 0 钳位到 0；输出失真，电流谐波激增，转矩抖动加大。两种工业处置：① **软件层"圆内限幅"** —— 把 PI 输出 (vd, vq) 按比例缩到 |v| ≤ Udc/√3·0.95，让 SVPWM 永远工作在线性区，THD 干净但牺牲 5% 母线利用率；② **切换到"六步运行"** —— 纯方波驱动（每 60° 切一次扇区，T0=0），THD 高但能榨干所有母线电压（峰值利用率 0.637·Udc，比线性区多 10%）。空调压缩机加速段允许短时过调制（甚至六步）以加快启动；稳态运行禁止——THD 高 → 转矩脉动 → 振动加大 → 阀片疲劳。EV 主驱用六步弱磁挤最后几 % 转速，工业伺服永远在线性区跑高精度。',
    },
  ],
  pitfalls: [
    {
      id: 'atan2-order',
      label: '试错：atan2 参数写成 (Uα, Uβ)',
      symptom: '扇区号顺序错乱（变成 2 → 1 → 6 → 5 → 4 → 3）；电压矢量"反向旋转"，电机反转或卡死',
      why: 'atan2(y, x) 第一个参数是 y。Uβ 是 y 轴、Uα 是 x 轴，正确写法是 atan2(Uβ, Uα)。参数颠倒等价于把矢量沿 x 轴镜像 → 旋转方向反了。这是 SVPWM 实现里数一数二的高发 bug，特别是从论文公式直接抄代码时。修复 + 预防：用 min-max 算法直接绕开 atan2（上面 svpwm_minmax 函数没有任何三角函数调用），是工程上回避此坑的根本方法。',
    },
    {
      id: 'no-t0-clamp',
      label: '试错：T0 < 0 不钳位继续输出',
      symptom: '三相 duty 出现负值或 > 1，CCR 写入异常；电流环输出震荡，PWM 频谱出现亚谐波',
      why: 'T0 < 0 物理不存在。如果代码直接用算出的 T1/T2 而不检查 T1 + T2 ≤ Ts，等价于"借未来时间"——硬件不会借给你，CCR 寄存器会按截断后的奇怪值工作。正确做法：if (T1 + T2 > Ts) { float k = Ts/(T1+T2); T1 *= k; T2 *= k; T0 = 0; } 这就是"过调制圆内限幅"。或者直接用 min-max 算法 + duty 钳位 [0.02, 0.98]，由硬件 PWM 寄存器自动处理上下限。',
    },
    {
      id: 'duty-edge',
      label: '试错：duty 不限到 [0.02, 0.98]',
      symptom: '极端 duty（如 0.005 或 0.995）时 PWM 比较器吃不到边沿，自举电容来不及充电，上桥臂驱动失效；或死区无效造成上下管短时直通',
      why: 'IGBT/MOS 上桥臂驱动通常用自举电路，需要下桥臂周期性导通给自举电容充电。duty = 1（永远上管开）时下管永不导通，自举电容放完电后栅极电压塌陷，上管脱栅 → 高边电流断流 → 电流环失控。另一端 duty = 0 时上管永不开，T1 + dt > Ts 时死区生成器会"吃掉"实际开通时间。生产代码必须强制 duty ∈ [0.02, 0.98]（具体边界看驱动芯片 datasheet 的最小脉冲宽度，IR2110 类 0.5 μs，UCC27200 类 0.2 μs）。',
    },
    {
      id: 'deadtime-too-short',
      label: '试错：死区设太短（IGBT 模块 3 μs 关断却用 1 μs 死区）',
      symptom: '上电正常，半小时后母线电压偶发跌落 10-20 V，IGBT 模块温度异常高；出厂稳定，3-6 个月后客户家烧模块',
      why: '死区 < IGBT 关断时间 → 上下管在死区内短时同导（直通），瞬态电流上百安培但持续时间几百纳秒，OCP 来不及响应。能量虽小但累积让 IGBT 硅片缓慢退化（动态闩锁效应），最终突发性失效。修复：① 查 IGBT datasheet "turn-off delay + fall time" 取 1.5-2 倍做死区下限；② STM32 BDTR/DTG 准确编码（见上面 deadtime-bdtr 步骤的查表方法）；③ 死区补偿（FOC 算法层根据 sign(I_phase) 加 ΔV_dt 偏置 Vα/Vβ），抵消死区导致的相电压畸变。',
    },
  ],
  nextModuleHook: '现在你能从 (vα, vβ) 算出三相 duty + 配置死区 + 钳 duty 边界了。下一模块（08 逆变器）讲这 6 个 IGBT/MOS 怎么真正翻译成相电压：死区时间的电压损失补偿、母线电压跌落、共模电压、电流过零畸变——把"软件层完美的 duty"对接到"硬件层真实的相电压波形"。',
  nextModuleHookEn: 'You can now compute three-phase duty from (vα, vβ), configure dead time, and clamp duty bounds. Module 08 (inverter) explains how these 6 IGBT/MOSFETs are actually translated into phase voltages: dead-time voltage-loss compensation, DC-link sag, common-mode voltage, zero-crossing distortion — bridging "software-perfect duty" to "hardware-real phase voltage waveforms".',
};
