import type { ModuleWalkthrough } from './types';

/**
 * 01 电机基础 —— 让"极对数 / 电角度 / 转矩公式 / BEMF"四个原始量真正落到压缩机数字上。
 *
 * 教学路径：先认结构 → 量极对数 → θe = polePairs·θm 实测对照 → 转矩公式三段
 *           → BEMF 撞顶 → 编码器分辨率反推量化噪声 → Rs/Ld/Lq/ψf 参数辨识口诀
 *           → STM32 编码器接口 (TIM2 ABZ 4 倍频 + Z 输入捕获) 代码骨架。
 *
 * 工业绑定：家用空调外机 4-6 极对滚动转子压缩机（海立、松下、三菱）、洗衣机
 * 8-10 极对直驱外转子、伺服关节 5-7 极对 IPM、EV 主驱 4 极对 IPM。
 */
export const motorBasicsWalkthrough: ModuleWalkthrough = {
  moduleId: 'motor-basics',
  bigPicture: '极对数 + 电角度 + 转矩公式 + BEMF —— 把电机铭牌翻译成 FOC 第一行 C 代码用得到的四个数。',
  bigPictureEn: 'Pole pairs + electrical angle + torque equation + back-EMF — translate the motor nameplate into the four numbers the first line of FOC C code actually needs.',
  successCriteria: [
    '能区分"极数 vs 极对数"，并从铭牌"8 极 3000 rpm 220V"反算出额定电频率 200 Hz',
    '能口算 θe = polePairs × θm、fe = rpm/60 × polePairs，并解释为什么 6 极对压缩机 PWM 选 16 kHz 而不是 4 kHz',
    '理解 PMSM 转矩公式 τ = 1.5·p·[ψf·Iq + (Ld−Lq)·Id·Iq] 三段含义，区分 SPM 和 IPM 工程含义',
    '能用 BEMF = ψf·ω_e 反算"6000 rpm 6 极对 ψf=0.05 Wb"时的反电动势峰值并解释为什么需要弱磁',
    '掌握"上电四件套"标定流程：极对数 → 编码器零位 → Rs（直流注入）→ Ld/Lq（高频注入）',
    '会用 STM32 编码器接口 (TIM2 TI1/TI2 4 倍频 + Z 输入捕获) 把机械角度变成电角度',
  ],
  successCriteriaEn: [
    'Distinguish "pole count vs pole pairs" and derive the 200 Hz rated electrical frequency from an "8-pole, 3000 rpm, 220 V" nameplate.',
    'Mentally compute θe = polePairs × θm and fe = rpm/60 × polePairs, and explain why a 6-pole-pair compressor uses 16 kHz PWM rather than 4 kHz.',
    'Understand the three terms of the PMSM torque equation τ = 1.5·p·[ψf·Iq + (Ld−Lq)·Id·Iq] and the engineering meaning of SPM vs IPM.',
    'Use BEMF = ψf·ω_e to compute the peak back-EMF at "6000 rpm, 6 pole pairs, ψf = 0.05 Wb" and explain why field weakening is required.',
    'Master the four-step bring-up calibration: pole pairs → encoder zero → Rs (DC injection) → Ld/Lq (high-frequency injection).',
    'Use the STM32 encoder interface (TIM2 TI1/TI2 ×4 + Z input capture) to turn mechanical angle into electrical angle.',
  ],
  steps: [
    {
      id: 'anatomy-counted',
      title: '数极对数',
      goal: '从转子永磁体几何上"数出"极对数，区分极数与极对数',
      goalEn: 'Count pole pairs from the rotor magnet geometry and distinguish pole count from pole pairs.',
      action: '观察定子截面：默认极对数 = 4，转子表面贴 8 块永磁体（N/S 交替）。把"极对数"滑块拖到 3、5、6 分别看。',
      observe: '极对数 = p 时永磁体块数 = 2p。海立 BSA325CV 标称 4 极对 → 8 块磁体；松下变频电机常见 6 极对 → 12 块磁体。',
      observeEn: 'When pole pairs = p, the magnet count = 2p. The Highly BSA325CV is rated at 4 pole pairs → 8 magnets; a common Panasonic VFD motor at 6 pole pairs → 12 magnets.',
      whyMatters: '铭牌写"8 极"的电机，FOC 里 polePairs 必须填 4，不是 8——这是上电不转最常见 bug。POLE_PAIRS 这个宏要在 motor_config.h 里散布到 Park、SVPWM、速度环、BEMF 观测器、HFI 等十余处。一处填错就连锁错——所以工程上的规矩是：用 #define MOTOR_POLE_PAIRS 4U 一处定义，绝不允许散落字面量。',
      whyMattersEn: 'For a nameplate "8-pole" motor, polePairs in FOC must be 4, not 8 — the most common "motor will not spin at first boot" bug. The POLE_PAIRS macro is referenced in Park, SVPWM, the speed loop, the BEMF observer, HFI, and a dozen other places. One wrong entry cascades — so the engineering rule is `#define MOTOR_POLE_PAIRS 4U` exactly once, with no stray literals allowed.',
    },
    {
      id: 'mech-vs-elec',
      title: 'θm vs θe',
      goal: '用 polePairs=4 实测 θe = 4·θm 的几何根',
      goalEn: 'Verify the geometric basis of θe = 4·θm with polePairs = 4.',
      action: '保持极对数 = 4。把机械角度滑块从 0° 慢慢推到 90°，盯紧蓝色 θm 圆环和 mint 色 θe 圆环。',
      observe: 'θm 走 0°→90° 一次；θe 走 0°→360° 整整一圈。机械每转 1/4 圈 = 电场转 1 圈。机械 90° → θe 360° = 0°（mod 2π 后归零）。',
      observeEn: 'θm sweeps 0°→90° once; θe sweeps 0°→360° a full revolution. A quarter mechanical turn = one full electrical turn. At θm = 90°, θe = 360° = 0° (after mod 2π).',
      whyMatters: '编码器读到的是 θm（机械域），但 Park / 反 Park 矩阵需要的是 θe（电域）。STM32 上的标准做法：encoder ISR 内 theta_e_q31 = (uint32_t)((uint64_t)theta_m_q31 * POLE_PAIRS)（q31 整数表示 0~2π，溢出 = 自然归一）。压缩机 6 极对时 θm 走 1° 对应 θe 走 6°，编码器分辨率不够会直接打到 Park 上变成肉眼可见的力矩纹波。',
      whyMattersEn: 'The encoder reads θm (mechanical domain), but Park / inverse Park need θe (electrical). Standard STM32 practice in the encoder ISR: `theta_e_q31 = (uint32_t)((uint64_t)theta_m_q31 * POLE_PAIRS)` (q31 maps 0..2π, overflow = natural wrap). On a 6 pole-pair compressor, 1° of θm = 6° of θe — insufficient encoder resolution propagates straight into Park as visible torque ripple.',
      quiz: {
        q: '一台铭牌"8 极、额定 1500 rpm"的洗衣机直驱电机，控制器代码里 POLE_PAIRS 该填几？额定电频率多少？',
        options: [
          'POLE_PAIRS=8，fe=200 Hz（极数 = 极对数）',
          'POLE_PAIRS=4，fe=100 Hz（fe = rpm/60·p）',
          'POLE_PAIRS=4，fe=50 Hz（fe 就是电网 50 Hz）',
          'POLE_PAIRS=8，fe=12.5 Hz（rpm/极对数 才是电频率）',
        ],
        correct: 1,
        hint: '"8 极"意思是 N+S 共 8 个磁极，极对数 p = 4；fe = (1500/60)·4 = 100 Hz。选项 A 把极数当极对数，是国内技术文档里最高发的口误。选项 C 把电网频率混进来——电机本身的 fe 与电网完全无关。选项 D 公式记反了。',
        qEn: 'For a washing-machine direct-drive motor rated "8 poles, 1500 rpm", what should POLE_PAIRS be in the controller code, and what is the rated electrical frequency?',
        optionsEn: [
          'POLE_PAIRS = 8, fe = 200 Hz (poles = pole pairs)',
          'POLE_PAIRS = 4, fe = 100 Hz (fe = rpm/60·p)',
          'POLE_PAIRS = 4, fe = 50 Hz (fe is the 50 Hz grid frequency)',
          'POLE_PAIRS = 8, fe = 12.5 Hz (rpm/pole pairs gives fe)',
        ],
        hintEn: '"8 poles" means 8 magnetic poles (N+S), so pole pairs p = 4; fe = (1500/60)·4 = 100 Hz. Option A confuses poles with pole pairs — the most frequent slip in Chinese technical docs. Option C drags in the grid frequency, which is unrelated to the motor itself. Option D inverts the formula.',
      },
    },
    {
      id: 'electrical-freq',
      title: '电频率 → PWM 选频',
      goal: '把 fe 反推到 PWM 载波频率下限',
      goalEn: 'Derive the minimum PWM carrier frequency from fe.',
      action: '把极对数固定为 6，转速从 1500 拖到 6000 rpm（空调压缩机最大档）。读取右侧 fe 数字。',
      observe: '1500 rpm 6p → fe=150 Hz；3000 rpm → fe=300 Hz；6000 rpm → fe=600 Hz。PWM 载波 fc 至少要 30~50 倍 fe 才能做精细矢量合成。',
      observeEn: '1500 rpm at 6 pole pairs → fe = 150 Hz; 3000 rpm → 300 Hz; 6000 rpm → 600 Hz. PWM carrier fc must be at least 30–50× fe to allow fine vector synthesis.',
      whyMatters: 'fc/fe < 20 时 SVPWM 一个电周期内只有十几个采样点，dq 量呈阶梯状，电流环带宽就被采样定理上限锁死。压缩机 6000 rpm × 6 极对 = 600 Hz fe，所以 PWM 至少 12 kHz，工程上选 16 kHz 既能给电流环留 1.5 kHz 带宽又能避开人耳最敏感的 2~4 kHz 段。EV 主驱 4 极对 × 18000 rpm = 1200 Hz fe，PWM 必须上 20 kHz 才行——这就是 SiC 模块在 EV 上取代 Si IGBT 的根本原因。',
      whyMattersEn: 'When fc/fe < 20, SVPWM gets only a dozen samples per electrical cycle, dq quantities become staircased, and current-loop bandwidth is capped by the sampling theorem. A compressor at 6000 rpm × 6 pole pairs = 600 Hz fe, so PWM must be ≥ 12 kHz; 16 kHz in practice leaves 1.5 kHz of current-loop bandwidth while avoiding the 2–4 kHz band where human hearing is most sensitive. An EV traction motor at 4 pole pairs × 18000 rpm = 1200 Hz fe forces PWM ≥ 20 kHz — the fundamental reason SiC modules are replacing Si IGBTs in EVs.',
      quiz: {
        q: '某 6 极对压缩机变频器 PWM 设为 4 kHz，运行到 4000 rpm 时听到"嗞嗞"啸叫且 Iq 阶跃响应肉眼可见拖泥带水。最优先该改什么？',
        options: [
          '加大电流环 Kp 加快响应',
          'PWM 升到 16 kHz（fc/fe 从 10 升到 40，给电流环留出 ≥30 倍载波余量）',
          '降低转速避开共振',
          '加大母线电容滤啸叫',
        ],
        correct: 1,
        hint: 'fe = 4000/60·6 = 400 Hz；fc/fe = 4000/400 = 10，太低。每电周期才 10 个 SVPWM 采样点，DSP 算出的 dq 量是阶梯波，PI 控不住。升 PWM 是几何性修复。选 A/C/D 都是治标不治本。',
        qEn: 'A 6 pole-pair compressor drive runs PWM at 4 kHz. At 4000 rpm it produces an audible buzz and the Iq step response is visibly sluggish. What is the top-priority fix?',
        optionsEn: [
          'Raise current-loop Kp for a faster response',
          'Raise PWM to 16 kHz (fc/fe goes from 10 to 40, giving the current loop ≥30× carrier headroom)',
          'Reduce speed to dodge the resonance',
          'Add bus capacitance to filter the buzz',
        ],
        hintEn: 'fe = 4000/60·6 = 400 Hz; fc/fe = 4000/400 = 10, far too low. Only ten SVPWM samples per electrical cycle means the dq signals are staircased and the PI cannot regulate them. Raising PWM is the geometric fix. Options A/C/D address symptoms only.',
      },
    },
    {
      id: 'torque-equation',
      title: '转矩公式三段',
      goal: '把 τ = 1.5p·[ψf·Iq + (Ld−Lq)·Id·Iq] 三段意义吃透',
      goalEn: 'Internalize the three terms of τ = 1.5·p·[ψf·Iq + (Ld−Lq)·Id·Iq].',
      action: '把额定电流 Iq 调到 8A、Id 调到 0，记下"额定转矩"显示值；再把 Id 调到 −3A 看转矩怎么变。',
      observe: 'SPM (Ld=Lq) 模型下 Id 改了转矩几乎不动——只有第一项 ψf·Iq 贡献。在 IPM (Ld<Lq) 上 Id<0 时第二项 (Ld−Lq)·Id·Iq > 0（因 Ld−Lq<0、Id<0 同号），转矩反而上升——这就是"磁阻转矩"。',
      observeEn: 'On an SPM (Ld = Lq) model, changing Id barely affects torque — only ψf·Iq contributes. On an IPM (Ld < Lq) with Id < 0, the second term (Ld−Lq)·Id·Iq becomes positive (both factors negative), and torque rises — this is reluctance torque.',
      whyMatters: '空调压缩机 / 洗衣机直驱 / EV 主驱 90% 都是 IPM，靠"永磁转矩 + 磁阻转矩"双管齐下：高转速段永磁部分被 BEMF 限制不能再加 Iq，但 (Ld−Lq) 项还能再榨出 15-25% 转矩——这是 MTPA 工作点偏向 −Id 的物理根源，也是模块 11 弱磁要讲的事。SPM 表贴电机只有第一项，结构简单成本低但效率天花板更早撞顶——常见于小电扇、风扇等低端场合。',
      whyMattersEn: 'About 90% of HVAC compressors, washing-machine direct drives, and EV traction motors are IPM, leveraging both PM torque and reluctance torque. At high speed, BEMF caps further Iq increases, but the (Ld−Lq) term can still extract an extra 15–25% torque — the physical root of why the MTPA operating point shifts toward −Id, the subject of Module 11. SPM motors have only the first term: simpler, cheaper, but with a lower efficiency ceiling, typical in low-end applications like small fans.',
      quiz: {
        q: '一台 IPM 压缩机 Ld=1 mH、Lq=2 mH、p=6、ψf=0.05 Wb。给 Iq=10A、Id=0 vs Iq=10A、Id=−5A，哪种转矩大？',
        options: [
          'Id=0 大，因为 Iq 全部用来产生永磁转矩',
          'Id=−5A 大约多 10%（磁阻项 (Ld−Lq)·Id·Iq 贡献正转矩）',
          '一样大，磁阻项在表贴/凸极上没差别',
          'Id=−5A 小，因为负 Id 削磁',
        ],
        correct: 1,
        hint: 'τ_perm=1.5·6·0.05·10=4.5 Nm；τ_rel=1.5·6·(1e-3−2e-3)·(−5)·10=0.45 Nm（负负得正）。τ_total: 4.5 vs 4.95，多约 10%。选项 D 把"负 Id 削磁"和"磁阻转矩贡献"混淆——前者发生在高速弱磁段、后者发生在恒转矩段且 IPM 上是正贡献。',
        qEn: 'For an IPM compressor with Ld = 1 mH, Lq = 2 mH, p = 6, ψf = 0.05 Wb, compare Iq = 10 A, Id = 0 against Iq = 10 A, Id = −5 A. Which case has higher torque?',
        optionsEn: [
          'Id = 0 is larger, because all Iq goes into PM torque',
          'Id = −5 A is about 10% larger (reluctance term (Ld−Lq)·Id·Iq is positive)',
          'They are equal — reluctance torque does not matter on surface/salient motors',
          'Id = −5 A is smaller because negative Id weakens the field',
        ],
        hintEn: 'τ_perm = 1.5·6·0.05·10 = 4.5 N·m; τ_rel = 1.5·6·(1e-3 − 2e-3)·(−5)·10 = 0.45 N·m (negative × negative = positive). Total 4.5 vs 4.95, about 10% more. Option D confuses "negative Id weakens flux" (true in field weakening) with "reluctance torque contribution" (positive in the constant-torque region on IPM).',
      },
    },
    {
      id: 'bemf-cap',
      title: 'BEMF 撞顶',
      goal: '量化"BEMF = ψf·ωe 撞母线"——弱磁需求的物理来源',
      goalEn: 'Quantify "BEMF = ψf·ωe hits the bus" — the physical origin of the need for field weakening.',
      action: '极对数=6、ψf=0.05 Wb（默认值附近），转速从 1500 → 6000 rpm 推。每个挡位算：BEMF_peak = ψf · 2π·rpm·p/60。',
      observe: '1500 rpm: BEMF_peak = 0.05·2π·150 ≈ 47 V；3000 rpm: 94 V；6000 rpm: 188 V。310 V 母线下 SVPWM 线性区峰值是 Udc/√3 ≈ 179 V——所以 6000 rpm 时 BEMF 已经撞顶，必须靠负 Id 削减等效磁链才能继续升速。',
      observeEn: 'At 1500 rpm: BEMF_peak = 0.05·2π·150 ≈ 47 V; 3000 rpm → 94 V; 6000 rpm → 188 V. With a 310 V DC link, the SVPWM linear-region peak is Udc/√3 ≈ 179 V — so at 6000 rpm BEMF already hits the ceiling, and only a negative Id (reducing the effective flux) can extend the speed range.',
      whyMatters: '这就是模块 11 弱磁的存在理由——不是控制工程师"为了凉快加个功能"，而是物理上不弱磁就跑不到铭牌转速。空调一级能效要在 7200 rpm 跑 COP 测试，6000 rpm 起步弱磁是出厂硬指标。EV 主驱 18000 rpm 时 BEMF 能到母线 5 倍，弱磁深度 −Id 可达额定电流 70%——一旦温升让永磁退磁阈值降低，就有不可逆退磁风险。',
      whyMattersEn: 'This is the reason Module 11 (field weakening) exists — not a "nice-to-have" the control engineer added, but a physical necessity to reach nameplate speed. Class-1 efficiency HVAC certification runs COP tests at 7200 rpm, so triggering field weakening at 6000 rpm is a hard factory spec. EV traction at 18000 rpm sees BEMF up to 5× the bus, with field-weakening depth |−Id| reaching 70% of rated current — once temperature rise lowers the demagnetization threshold, irreversible demagnetization becomes a real risk.',
    },
    {
      id: 'encoder-resolution',
      title: '编码器分辨率',
      goal: '反算"编码器 PPR + 极对数 = θe 量化步长"',
      goalEn: 'Derive the θe quantization step from encoder PPR × pole pairs.',
      action: '想象 ① 2500 PPR 增量编码器 A/B 正交 4 倍频 → 10000 计数/机械圈；② 6 极对压缩机。算 θe 单位计数 = 360°·polePairs/10000 = 0.216°。换 1024 PPR 同样配置 → θe 单位 = 0.528°。',
      observe: '在 dq 坐标里量化误差 Δθ=0.5° 让 Iq 漏 sin(0.5°)·100% ≈ 0.87% 到 Id。叠加 ADC 噪声 + Z 校准漂移 + 中断抖动 → 实际 Δθ_total 可能到 2-3° → Id 串扰可达 5%。',
      observeEn: 'In dq coordinates, a quantization error of Δθ = 0.5° leaks sin(0.5°) ≈ 0.87% of Iq into Id. Combined with ADC noise, Z-pulse drift, and ISR jitter, the actual Δθ_total can reach 2–3°, with Id crosstalk up to 5%.',
      whyMatters: '编码器选型够不够看 polePairs：① 风扇 1 极对、低速：1024 PPR 已绰绰有余；② 空调压缩机 4-6 极对、6000 rpm：2500 PPR 起步、4096 PPR 更安全；③ 伺服关节 5 极对、要求 ±0.01° 重复定位：必须 17/23 位绝对值编码器（130k+ PPR）。压缩机用 1024 PPR 不是"省钱"——出厂时还能转，三个月后 Z 校准漂移 + 温升让量化噪声成倍放大 → 售后退机。',
      whyMattersEn: 'Encoder sizing depends on pole pairs: (1) a 1 pole-pair fan at low speed: 1024 PPR is plenty; (2) a 4–6 pole-pair HVAC compressor at 6000 rpm: 2500 PPR minimum, 4096 PPR safer; (3) a 5 pole-pair servo joint requiring ±0.01° repeatability: must use a 17–23 bit absolute encoder (130k+ PPR). Using 1024 PPR on a compressor is not "cost saving" — it runs at the factory, but three months later Z-pulse drift + temperature rise multiply quantization noise into field returns.',
      quiz: {
        q: 'STM32 用 TIM2 接 2500 PPR 编码器 + Z 输入捕获，硬件 4 倍频后单圈 10000 计数。配 8 极对压缩机，θe 量化分辨率是？',
        options: [
          '0.036° (单纯机械分辨率)',
          '0.288° (机械 0.036° × 极对数 8)',
          '0.144° (机械 / 极对数)',
          '0.018° (硬件 8 倍频)',
        ],
        correct: 1,
        hint: 'θe = polePairs × θm，所以 θe 分辨率 = θm 分辨率 × polePairs。0.036° × 8 = 0.288°——在压缩机 8000 rpm 工况下叠加 ADC 噪声会让 Iq 阶跃响应肉眼可见抖动。选项 C 把方向搞反了——极对数放大量化误差不会缩小它。',
        qEn: 'STM32 TIM2 reads a 2500 PPR encoder with Z input capture; hardware ×4 gives 10000 counts per mechanical revolution. With an 8 pole-pair compressor, what is the θe quantization resolution?',
        optionsEn: [
          '0.036° (just the mechanical resolution)',
          '0.288° (mechanical 0.036° × 8 pole pairs)',
          '0.144° (mechanical / pole pairs)',
          '0.018° (hardware ×8 decoding)',
        ],
        hintEn: 'θe = polePairs × θm, so the θe resolution = θm resolution × polePairs. 0.036° × 8 = 0.288° — at 8000 rpm with ADC noise, Iq step response becomes visibly jittery. Option C reverses the direction — pole pairs amplify quantization error, not shrink it.',
      },
    },
    {
      id: 'param-id-cookbook',
      title: '四件套参数辨识',
      goal: '掌握上电就能跑的 Rs / Ld / Lq / ψf 离线辨识口诀',
      goalEn: 'Learn the offline identification recipe for Rs / Ld / Lq / ψf that runs right at power-up.',
      action: '回顾标定流程：① 极对数（数永磁体或者手转一圈数编码器圈数）② Rs（堵转下注入 1A 直流测电压 U/I=Rs）③ Ld/Lq（堵转下 d 轴注入小幅 1 kHz 正弦 → Ld；q 轴同步 → Lq）④ ψf（无负载惯性拖到额定转速测 BEMF_rms，ψf = BEMF_rms / (√2·ωe)）。',
      observe: 'STM32 实现：四步用 ADC 注入 + TIM 触发 PWM 即可完成，不需要外加仪器；辨识结果存 Flash 上电时读取。',
      observeEn: 'STM32 implementation: all four steps run on ADC-injected sampling + TIM-triggered PWM — no external instruments required; results are stored in Flash and reloaded at boot.',
      whyMatters: '这四个数全 FOC 算法都用：① Rs 用在 BEMF 观测器和电流环 PI（Ki=ω_bw·R）；② Ld/Lq 用在 PI 整定（Kp=ω_bw·L）和 dq 解耦前馈（ω_e·Lq·iq）；③ ψf 用在 BEMF 估算、转矩反推、弱磁电压椭圆。压缩机出厂前每台都要跑一次 self-id，把这四个数写进自己的 Flash —— 因为生产公差让标称值有 ±15% 散差，光用铭牌额定值跑 FOC 在边角工况一定不稳。Rs 辨识 STM32 HAL 风格骨架（堵转 + d 轴注入直流）：' +
        ' /* Rs identification: inject DC on d-axis, measure voltage */' +
        ' float Rs_identify(float i_inject_A) {' +
        '   FOC_set_id_ref(i_inject_A); FOC_set_iq_ref(0);' +
        '   HAL_Delay(500);  /* let current settle */' +
        '   float vd_avg = FOC_get_vd_filtered();  /* 100-pt moving avg */' +
        '   return vd_avg / i_inject_A;  /* Rs = Vd / Id (堵转 di/dt=0) */' +
        ' }' +
        ' /* 测出来 Rs 通常 0.1-0.5 Ω，写进 motor_params.rs，电流环 PI 用 Ki=2π·1000·Rs */',
      whyMattersEn: 'All four numbers feed every FOC algorithm: (1) Rs is used in the BEMF observer and current-loop PI (Ki = ω_bw·R); (2) Ld/Lq are used in PI tuning (Kp = ω_bw·L) and dq decoupling feed-forward (ω_e·Lq·iq); (3) ψf is used in BEMF estimation, torque back-computation, and the field-weakening voltage ellipse. Every compressor runs self-ID on the production line and writes these four numbers into its own Flash — production tolerance gives ±15% spread on nameplate values, so running FOC on nameplate alone is guaranteed to be unstable at corner cases. A simple Rs identification skeleton (stall + d-axis DC injection): inject a DC current on the d-axis, wait 500 ms for settling, average Vd over 100 samples, then Rs = Vd / Iinject (di/dt = 0 at stall). Typical Rs comes out at 0.1–0.5 Ω; write it into motor_params.rs and set the current-loop Ki = 2π·1000·Rs.',
    },
    {
      id: 'stm32-encoder-skeleton',
      title: 'STM32 编码器接口',
      goal: '把"θm → θe"接到具体的 STM32 寄存器配置',
      goalEn: 'Wire "θm → θe" all the way down to concrete STM32 register configuration.',
      action: '看下面 STM32 LL 风格代码：TIM2 配 Encoder Mode TI1/TI2 自动 4 倍频；TIM2_CH3 输入捕获接 Z 信号每圈复位。',
      observe: 'theta_e_q31 = (uint32_t)((uint64_t)TIM2->CNT * (UINT32_MAX / ENC_CPR) * POLE_PAIRS) —— 一行算出 θe q31 整数，自动 mod 2π。',
      observeEn: 'theta_e_q31 = (uint32_t)((uint64_t)TIM2->CNT * (UINT32_MAX / ENC_CPR) * POLE_PAIRS) — one line computes θe as a q31 integer with automatic mod 2π via overflow.',
      whyMatters: 'STM32 LL Encoder Interface 代码片段（生产骨架，TIM2 接 ABZ 增量编码器）：' +
        ' /* TIM2 Encoder mode 3 (TI1+TI2 both edges → x4) */' +
        ' LL_TIM_SetEncoderMode(TIM2, LL_TIM_ENCODERMODE_X4_TI12);' +
        ' LL_TIM_IC_SetActiveInput(TIM2, LL_TIM_CHANNEL_CH1, LL_TIM_ACTIVEINPUT_DIRECTTI);' +
        ' LL_TIM_IC_SetActiveInput(TIM2, LL_TIM_CHANNEL_CH2, LL_TIM_ACTIVEINPUT_DIRECTTI);' +
        ' LL_TIM_SetAutoReload(TIM2, ENC_CPR - 1);  /* 10000-1 for 2500 PPR */' +
        ' /* TIM2 CH3 Input Capture on Z pulse rising edge */' +
        ' LL_TIM_IC_SetActiveInput(TIM2, LL_TIM_CHANNEL_CH3, LL_TIM_ACTIVEINPUT_DIRECTTI);' +
        ' LL_TIM_EnableIT_CC3(TIM2);' +
        ' LL_TIM_EnableCounter(TIM2);' +
        ' /* In FOC ISR: read θm, scale to θe */' +
        ' uint32_t cnt = LL_TIM_GetCounter(TIM2);' +
        ' uint32_t theta_e_q31 = (uint32_t)((uint64_t)cnt * (UINT32_MAX / ENC_CPR) * POLE_PAIRS);' +
        ' /* Z callback: 校准漂移 */' +
        ' void HAL_TIM_IC_CaptureCallback(TIM_HandleTypeDef *htim) {' +
        '   if (htim->Instance == TIM2 && htim->Channel == HAL_TIM_ACTIVE_CHANNEL_3)' +
        '     LL_TIM_SetCounter(TIM2, Z_OFFSET);  /* Z 偏移由对齐流程标定 */' +
        ' }' +
        ' 这套骨架已经包含了 4 倍频解码、自动溢出归一、Z 信号长期校准三件事——压缩机控制器编码器接入的工程标准答案。',
      whyMattersEn: 'STM32 LL encoder-interface snippet (production skeleton for TIM2 + ABZ incremental encoder): set TIM2 to Encoder Mode 3 (TI1+TI2 both edges → ×4); configure both CH1/CH2 active input as direct TI; set auto-reload to ENC_CPR − 1 (e.g. 10000 − 1 for 2500 PPR); set TIM2 CH3 to direct-TI input capture on the Z rising edge and enable its CC3 interrupt; start the counter. In the FOC ISR read TIM2->CNT and scale to θe via `theta_e_q31 = (uint32_t)((uint64_t)cnt * (UINT32_MAX / ENC_CPR) * POLE_PAIRS)`. In the Z capture callback, set the counter to Z_OFFSET (calibrated during alignment) to clear long-term drift. The skeleton already covers ×4 decoding, auto-wrap, and long-term Z calibration — the standard engineering answer for connecting an encoder to a compressor controller.',
    },
  ],
  pitfalls: [
    {
      id: 'pole-as-poles',
      label: '试错：极对数填成极数（POLE_PAIRS=8 当 4）',
      labelEn: 'Mis-step: enter pole count instead of pole pairs (POLE_PAIRS = 8 instead of 4)',
      symptom: '上电瞬间电机抖动 / 卡转 / 反方向旋转；Iq 命令 = 5A 但电流环输出 Vq 撞限保护跳闸',
      symptomEn: 'At power-up the motor shudders, stalls, or spins backward; Iq command = 5 A but the current-loop Vq output hits the saturation limit and trips protection.',
      why: 'θe = polePairs · θm。POLE_PAIRS 填成 2 倍正确值 → θe 跑得快 2 倍 → Park 把 Iq 命令投到错误旋转的 d-q 平面 → 力矩方向随 t 周期性翻转 → 电机像被反复推拉，外面看就是"原地抖"。修复：在 motor_config.h 里 #define MOTOR_POLE_PAIRS 4U 一处定义，所有调用全部宏化，禁止散落字面量。出厂前 self-test 脚本：低压 + 开环 V/f 慢转一圈，数编码器走多少计数算极对数自动核对。',
      whyEn: 'θe = polePairs · θm. Setting POLE_PAIRS to 2× correct makes θe spin 2× too fast → Park projects Iq into a wrong-rotating dq plane → torque direction flips periodically with t → the motor is pushed and pulled in place, externally appearing as "shuddering on the spot". Fix: `#define MOTOR_POLE_PAIRS 4U` in motor_config.h once and reference via the macro everywhere — no stray literals. The factory self-test script runs low-voltage open-loop V/f for one slow turn and counts encoder counts to verify pole pairs automatically.',
    },
    {
      id: 'no-z-calibration',
      label: '试错：忽略 Z 信号长期校准',
      labelEn: 'Mis-step: skip long-term Z-pulse calibration',
      symptom: '上电时 FOC 正常，运行 8 小时后效率下降 1-2%，电流均值变大但 Iq 命令没变；重启又好了',
      symptomEn: 'FOC is fine at power-up, but after 8 hours of operation efficiency drops 1–2%, mean current rises with no change in Iq command, and a restart "fixes" it.',
      why: '增量编码器 A/B 计数会因 EMI / 中断抢占 / 接触不良漏脉冲，θm 累积漂移；× polePairs 后 θe 漂移放大极对数倍。压缩机 24/7 运行 8 小时后 θe 偏 1-5° 是常见量级 → Iq 漏 sin(Δθ) 到 Id → 铜损上升、转矩下降。修复：Z 信号必接 + TIM_IC 每圈复位 + 上电做 d 轴对齐确定 Z_OFFSET。无 Z 的磁编码器必须配 BEMF 观测器做长期校准。',
      whyEn: 'Incremental encoder A/B counts lose pulses from EMI, ISR preemption, or poor contact; θm drifts and ×polePairs amplifies the drift in θe. For 24/7 compressor operation, 1–5° of θe drift after 8 hours is typical → sin(Δθ) of Iq leaks into Id → copper loss rises and torque drops. Fix: always wire the Z pulse + reset the counter on each Z capture + run a d-axis alignment at boot to determine Z_OFFSET. Magnetic encoders without Z must be paired with a BEMF observer for long-term calibration.',
    },
    {
      id: 'spm-mtpa-on-ipm',
      label: '试错：在 IPM 压缩机上用 SPM 的 MTPA（Id*=0 全程）',
      labelEn: 'Mis-step: apply SPM-style MTPA (Id* = 0 everywhere) on an IPM compressor',
      symptom: '低速看似正常但效率比同价位竞品低 8-12%；4000 rpm 以上电流偏大、温升明显',
      symptomEn: 'Low speed looks fine but efficiency is 8–12% below same-class competitors; above 4000 rpm current is high and temperature rise is noticeable.',
      why: 'IPM 转矩公式有 (Ld−Lq)·Id·Iq 磁阻项，最优工作点不在 Id=0 而在轻微 −Id 方向（MTPA 曲线偏负 Id）。忽略这项相当于扔掉 10-15% 转矩潜力 —— 同样转矩需求要更大 Iq → I²R 铜损上升。修复：用厂家给的 Ld/Lq 算 MTPA 离线表，按 Iq* 查 Id*；或在线 MTPA 跟踪算法 (Mostafa SignAccum 或 Bobek 注入法)。模块 11 详讲。',
      whyEn: 'The IPM torque equation has a reluctance term (Ld−Lq)·Id·Iq, so the optimum is not at Id = 0 but slightly into −Id (the MTPA curve bends negative). Ignoring this throws away 10–15% of torque potential — same torque demand needs more Iq, so I²R rises. Fix: compute an offline MTPA table from manufacturer Ld/Lq and look up Id* by Iq*, or use an online MTPA tracker (Mostafa SignAccum or Bobek injection). Detailed in Module 11.',
    },
    {
      id: 'low-res-encoder',
      label: '试错：1024 PPR 编码器 + 8 极对压缩机',
      labelEn: 'Mis-step: 1024 PPR encoder on an 8-pole-pair compressor',
      symptom: 'θe 跳变（非平滑过渡）；Id/Iq 在静止时也有 ±5% 抖动；高速段电流环必须降到 800 Hz 带宽才不振荡',
      symptomEn: 'θe jumps in discrete steps (not smooth); even at standstill Id/Iq jitter ±5%; at high speed the current loop must be detuned to 800 Hz bandwidth to avoid oscillation.',
      why: 'θe 量化步长 = 360°·polePairs/(4·PPR) = 360·8/4096 = 0.703°。Park 投影里 sin/cos 跳跃式取值 → dq 量阶梯化 → 反 Park 算出的 Vα/Vβ 带高频毛刺 → SVPWM 输出含 ADC 噪声放大版的死区谐波。修复有两条路：① 上 2500/4096 PPR 编码器（BOM 加 5-10 元）② 软件用低通 + 角度插值（增加 1-2 计数周期延迟，对高速影响大）。压缩机选 ② 是错误折中——5 年寿命周期内多换 2 块编码器钱都不止。',
      whyEn: 'θe quantization step = 360°·polePairs / (4·PPR) = 360·8/4096 = 0.703°. sin/cos in Park sample in steps → dq quantities staircase → Vα/Vβ from inverse Park carry HF glitches → SVPWM output contains an amplified-by-ADC-noise version of the dead-time harmonics. Two fixes: (1) move to a 2500/4096 PPR encoder (BOM up by 5–10 RMB); (2) software low-pass + angle interpolation (adds 1–2 count-period delay, significant impact at high speed). Choosing (2) on a compressor is the wrong trade-off — over a 5-year life cycle the cost of two extra encoder replacements far exceeds the saving.',
    },
  ],
  nextModuleHook: '你现在能从铭牌读出 polePairs / Rs / Ld / Lq / ψf 五个数，并把 θm 接成 θe 喂给 FOC 后段。下一模块 02 三相磁场：把三个 120° 错开的正弦电流"合成"出旋转磁场——这是 Clarke 变换为什么是矩阵而不是简单求平均的几何根。',
  nextModuleHookEn: 'You can now read polePairs / Rs / Ld / Lq / ψf off the nameplate and feed θm-derived θe into the rest of FOC. Module 02 (three-phase fields) synthesizes a rotating field from three 120°-offset sinusoidal currents — the geometric reason Clarke is a matrix, not a simple average.',
};
