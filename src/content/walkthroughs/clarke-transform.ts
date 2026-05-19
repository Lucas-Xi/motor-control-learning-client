import type { ModuleWalkthrough } from './types';

/**
 * 03 Clarke 变换 —— 把"三个 120° 错开的标量"压成"二维平面的一个矢量"。
 */
export const clarkeTransformWalkthrough: ModuleWalkthrough = {
  moduleId: 'clarke-transform',
  bigPicture: 'Clarke = 把 3 维冗余三相投影成 2 维 αβ 平面矢量（丢零序），并把"KCL 残差"留作免费故障鉴别器。',
  bigPictureEn: 'Clarke = project the redundant 3-D three-phase set onto a 2-D αβ-plane vector (dropping zero-sequence), leaving the KCL residual as a free fault discriminator.',
  successCriteria: [
    '能口算 Iα = Ia 和 Iβ = (Ia + 2·Ib)/√3，知道这就是"幅值不变"形式 (TI / ST FOC SDK 缺省)',
    '能解释三相和 = 0 为什么是星型连接的几何约束、为什么三相三线电机 I0 物理上无回路',
    '能区分"幅值不变 (αβ 直读相电流)"与"功率不变 (Vd·Id+Vq·Iq=P)"两种 Clarke 的工程后果',
    '看到 |I0| / |Iαβ| > 5% 就能 30 秒鉴别：ADC 偏置 / 缺相 / 相阻不平衡 / 三角接错型',
    '理解为什么 Clarke 输出 αβ "跟着时间转"——它仍然是 AC，Park 才把 AC 变 DC',
    '会写 STM32 上 Clarke q15 整数版（避免 /√3 浮点除法，用 18919 / 32768 ≈ 0.57735 乘加）',
  ],
  successCriteriaEn: [
    'Mentally apply Iα = Ia and Iβ = (Ia + 2·Ib)/√3 and recognize this as the amplitude-invariant form (default in TI / ST FOC SDK).',
    'Explain why the three-phase sum = 0 is a geometric constraint of the wye connection, and why a three-wire motor has no physical return for I0.',
    'Distinguish the engineering consequences of amplitude-invariant (αβ reads phase current directly) vs power-invariant (Vd·Id + Vq·Iq = P).',
    'In 30 seconds, when |I0|/|Iαβ| > 5%, discriminate between ADC offset / lost phase / phase-resistance imbalance / mistaken delta connection.',
    'Understand why Clarke\'s αβ output "keeps rotating with time" — it is still AC; only Park turns AC into DC.',
    'Write a q15 integer Clarke for STM32 (avoiding /√3 floating divide, using 18919/32768 ≈ 0.57735 with multiply-add).',
  ],
  steps: [
    {
      id: 'static-input',
      title: '手算一遍',
      goal: '用静态三相数字逐位验证 Clarke 矩阵',
      goalEn: 'Verify the Clarke matrix digit-by-digit using static three-phase numbers.',
      action: '右侧切到"手动 Ia/Ib/Ic"输入模式，把 Ia=5、Ib=−2.5、Ic=−2.5。',
      observe: '左侧 αβ 矢量端点跑到 (α=5, β=0)，刚好沿 α 轴正方向；右下"变换矩阵"卡片显示 I0 = (5−2.5−2.5)/3 = 0。',
      observeEn: 'The αβ vector tip lands at (α = 5, β = 0), exactly along +α; the transform-matrix card shows I0 = (5 − 2.5 − 2.5)/3 = 0.',
      whyMatters: '这是 Clarke 的"教科书例题"：三相和为零、Ia 占满、Ib/Ic 对称分担一半反向。结果是 αβ 矢量精准对齐 A 相绕组方向。这条对应关系（"Ia=正峰" → "αβ 矢量指向 α 正方向"）是整个 FOC 控制器认知"d 轴在哪里"的几何起点。压缩机出厂自检脚本里就是用这个静态向量验证 ADC 三路通道 + Clarke 矩阵是否同向——硬件相序对错可以在 0 转速下就排查掉。',
      whyMattersEn: 'This is the textbook Clarke example: three-phase sum zero, Ia full, Ib/Ic symmetric half each in reverse. The αβ vector lines up precisely with the A-phase winding. This mapping ("Ia at positive peak" → "αβ vector along +α") is the geometric starting point for the FOC controller to recognize where the d axis lies. Factory self-test scripts use this static vector to verify the three ADC channels and the Clarke matrix point the same way — hardware phase-order errors can be caught at zero speed.',
      presetId: 'clarke-projection',
    },
    {
      id: 'beta-axis',
      title: '试 β 轴',
      goal: '验证 Ib 主导时矢量为什么指向 β 方向',
      goalEn: 'Verify why the vector points in the β direction when Ib dominates.',
      action: '把 Ia=0、Ib=4.33、Ic=−4.33（这是把上一步的 5A 旋转 90° 电角度等价的三相数）。',
      observe: 'αβ 端点跑到 α≈0、β≈5 的位置——矢量完全指向 β 轴正方向；I0 仍为 0（三相和=0）。',
      observeEn: 'The αβ tip lands at α ≈ 0, β ≈ 5 — the vector points fully along +β; I0 remains 0 (three-phase sum = 0).',
      whyMatters: '让"三相组合"产生"沿 β 轴方向的矢量"，需要的不是单独激活 B 相，而是 B/C 两相反向对称。这就是为什么 Clarke 矩阵第二行写成 (1/√3)·(Ia + 2·Ib) 而不是简单地 Iβ=Ib——三相轴本身是空间 120° 错开的，必须做几何投影，不能直接对应。压缩机调试时手动喂这两个例题数据是验证"硬件 U/V/W 接线 + 软件相序枚举 + Clarke 矩阵符号"三者一致的最直接办法。',
      whyMattersEn: 'Producing a vector along β does not mean activating B alone — it requires B and C symmetric and opposite. That is why row 2 of Clarke is (1/√3)·(Ia + 2·Ib) and not simply Iβ = Ib — the three phase axes are spatially offset by 120°, requiring geometric projection. Feeding these two examples manually during compressor bring-up is the most direct way to verify that hardware U/V/W wiring, software phase-order enum, and Clarke matrix signs all agree.',
      quiz: {
        q: 'Clarke 变换（幅值不变形式）中 Iβ 的标准公式是哪个？',
        options: [
          'Iβ = Ib',
          'Iβ = (Ia + 2·Ib) / √3',
          'Iβ = Ib − Ic',
          'Iβ = (Ia + Ib + Ic) / 3',
        ],
        correct: 1,
        hint: '幅值不变形式 Iα=Ia, Iβ=(Ia+2·Ib)/√3。也可以用 Ic=−Ia−Ib 代入改写成 (Ib−Ic)/√3，两种是代数等价。选项 D 是 I0 公式（零序），算的是"对称分量的第 0 项"——把它和 Iβ 混淆会让 Park 投影完全错乱。',
        qEn: 'In the amplitude-invariant Clarke transform, which is the standard formula for Iβ?',
        optionsEn: [
          'Iβ = Ib',
          'Iβ = (Ia + 2·Ib) / √3',
          'Iβ = Ib − Ic',
          'Iβ = (Ia + Ib + Ic) / 3',
        ],
        hintEn: 'Amplitude-invariant: Iα = Ia, Iβ = (Ia + 2·Ib)/√3. Substituting Ic = −Ia − Ib gives the algebraically equivalent (Ib − Ic)/√3. Option D is the I0 (zero-sequence) formula; confusing it with Iβ scrambles Park completely.',
      },
    },
    {
      id: 'why-2d',
      title: '为何 2 维够',
      goal: '理解"三个标量为什么压两个就不丢信息"',
      goalEn: 'Understand why compressing three scalars into two is lossless.',
      action: '保持 Ia=5、Ib=−2.5、Ic=−2.5。盯住"abc 三相输入"卡片下方的 I0 数值。然后把 Ic 单独改成 −3（让 Ia+Ib+Ic = −0.5）。',
      observe: 'I0 = 0 → −0.167；αβ 平面上的矢量端点几乎没动，零序的偏移被独立分离到 I0 通道。',
      observeEn: 'I0 = 0 → −0.167; the αβ vector tip barely moves; the zero-sequence shift is separated into I0.',
      whyMatters: '这就是关键洞察：三相平衡时只有 2 个自由度。Ia、Ib、Ic 看似三个独立变量，但工程上"星型连接 + 三相和=0"这个约束让第三个变量是冗余的。Clarke 把这个冗余沿着"三相和"方向投影到 I0，剩下两个正交自由度落在 αβ 平面。所以 FOC 用 2 个 PI（一个 Id、一个 Iq）就够控全部三相——不需要三个。这是模块 05 的 PI 数量、模块 06 的 dq 解耦、模块 07 的 SVPWM 扇区数全都基于二维平面的根源。',
      whyMattersEn: 'Key insight: a balanced three-phase set has only 2 degrees of freedom. Ia/Ib/Ic look independent, but the wye + sum-equals-zero constraint makes the third redundant. Clarke projects the redundancy along the sum direction into I0, leaving two orthogonal degrees on the αβ plane. FOC uses 2 PIs (Id, Iq) to control all three phases — not three. This is the root reason Module 05 uses two PIs, Module 06 has dq decoupling, and Module 07 SVPWM sectors are built on a 2-D plane.',
    },
    {
      id: 'zero-sequence',
      title: '零序的物理地位',
      goal: '认识 I0 在三相三线电机里"物理不可存在但常常飘"的工程含义',
      goalEn: 'Grasp the engineering meaning of I0 in a three-wire motor — physically impossible yet often drifting.',
      action: '故意把三相和拉成显著非零——Ia=4、Ib=2、Ic=2（和 = 8，平均 I0 = 2.67）。再切回平衡输入观察 I0 应该多小。',
      observe: 'I0 = 2.67 A；αβ 平面上矢量仍然有合理位置（不会爆掉），但 I0 占据了相当大的"幅值预算"。健康三相平衡系统 |I0| 应在 < 0.5% Imax。',
      observeEn: 'I0 = 2.67 A; the αβ vector still has a reasonable position (it does not blow up), but I0 eats a large slice of the amplitude budget. A healthy balanced three-phase system has |I0| < 0.5% Imax.',
      whyMatters: '三相三线星型电机（家用空调压缩机 / 洗衣机直驱 / 多数 PMSM）中性点不引出，I0 没有物理回路——它在物理上不可能稳态存在，但仿真允许你"喂"进去。运行时若 I0 真的飘起来，几乎一定是采样链问题：① ADC 三相零点没校准 ② 缺相 ③ 三个相阻差异大 ④ 三角形接法误判为星型。STM32 项目里典型做法是在 FOC 中断里持续算 i0_sq = (ia+ib+ic)²，超过阈值即触发 FAULT_KCL_INVALID——这比波形录制再事后分析快 100 倍，是产线"30 秒鉴别"的核心免费仪表。',
      whyMattersEn: 'A three-wire wye motor (HVAC compressor, washing-machine direct drive, most PMSMs) has no neutral wire, so I0 has no physical return — it cannot exist at steady state. If I0 actually drifts at runtime, it is almost always a sampling-chain issue: (1) un-calibrated three-phase ADC zeros, (2) lost phase, (3) wide phase-resistance spread, (4) delta mistaken for wye. Typical STM32 practice: continuously compute i0_sq = (ia + ib + ic)² in the FOC ISR and raise FAULT_KCL_INVALID above threshold — 100× faster than offline waveform analysis, the core "30-second discriminator" instrument on the production line.',
      quiz: {
        q: '运行时观测到 |I0| = 0.8 A，电机额定 6 A。最可能的原因是？',
        options: [
          '正常现象，零序总会有点',
          'ADC 三相零点未校准 / 缺相 / 相阻不平衡',
          'PWM 频率太高',
          'Park 变换的电角度算错',
        ],
        correct: 1,
        hint: '平衡三相 I0 应远小于幅值（< 1%）。0.8/6 ≈ 13% 已经是显著偏移。上电先做 ADC 偏置校准——电机不通电时取 1024 次 ADC 平均当零点，写进 motor_calib.adc_offset_a/b/c。Park 算错（选项 D）会让 Id/Iq 串扰但不影响 I0；PWM 高 / 低和 I0 几乎无关。',
        qEn: 'At runtime |I0| = 0.8 A on a motor rated 6 A. Most likely cause?',
        optionsEn: [
          'Normal — there is always some zero-sequence',
          'Un-calibrated three-phase ADC zero / lost phase / phase-resistance imbalance',
          'PWM frequency too high',
          'Wrong electrical angle in Park',
        ],
        hintEn: 'A balanced three-phase I0 should be far below the amplitude (< 1%). 0.8/6 ≈ 13% is a significant offset. Calibrate ADC zero at boot — 1024-sample average with motor de-energized, written into motor_calib.adc_offset_a/b/c. A Park error (option D) causes Id/Iq crosstalk but does not affect I0; PWM frequency has essentially no effect on I0.',
      },
    },
    {
      id: 'two-adc-reconstruction',
      title: '省一路 ADC',
      goal: '理解"两相采样重构 Ic = −Ia − Ib"的成立条件 + STM32 ADC 配置',
      goalEn: 'Understand the preconditions for reconstructing Ic = −Ia − Ib from two phases, plus the STM32 ADC config.',
      action: '模拟两路 ADC 方案——只用 Ia、Ib 两个数，假设 Ic = −Ia − Ib。设 Ia=3、Ib=1，那么算出来 Ic 应该 =−4。把 Ic 真填成 −4，看 I0 是不是变成 0。',
      observe: 'I0 = 0；αβ 端点位置和"正常三路采样"完全一致。',
      observeEn: 'I0 = 0; the αβ tip lands at exactly the same place as full three-channel sampling.',
      whyMatters: '真实 STM32 板子上经常只放两路电流采样硬件（运放+采样电阻+ADC 通道）——省一路 BOM 成本 + 省一路 PCB 走线。代价是必须严格满足：① 电机三相星型连接（中性点浮空，KCL 强制 Σi = 0）② 两路 ADC 偏置都校准过 ③ 不能用 KCL 自检（因为 Ic 是算出来的，KCL 恒等成立）。STM32 G4 + JSQR 配 PWM 中点采样的最小骨架：' +
        ' /* TIM1 update 触发 ADC 注入序列采 Ia, Ib (CH1, CH2) */' +
        ' LL_ADC_INJ_SetTriggerSource(ADC1, LL_ADC_INJ_TRIG_EXT_TIM1_TRGO);' +
        ' LL_ADC_INJ_SetSequencerLength(ADC1, LL_ADC_INJ_SEQ_SCAN_ENABLE_2RANKS);' +
        ' LL_ADC_INJ_SetSequencerRanks(ADC1, LL_ADC_INJ_RANK_1, LL_ADC_CHANNEL_1);' +
        ' LL_ADC_INJ_SetSequencerRanks(ADC1, LL_ADC_INJ_RANK_2, LL_ADC_CHANNEL_2);' +
        ' /* JEOS 回调里读取并扣偏置 */' +
        ' void ADC1_2_IRQHandler(void) {' +
        '   int16_t ia_raw = LL_ADC_INJ_ReadConversionData12(ADC1, LL_ADC_INJ_RANK_1);' +
        '   int16_t ib_raw = LL_ADC_INJ_ReadConversionData12(ADC1, LL_ADC_INJ_RANK_2);' +
        '   ia = (ia_raw - g_offset_a) * I_SCALE;  /* g_offset_a 上电时 1024 次平均得到 */' +
        '   ib = (ib_raw - g_offset_b) * I_SCALE;' +
        '   ic = -ia - ib;  /* 关键：依赖星型 KCL */' +
        '   ialpha = ia; ibeta = (ia + 2.f*ib) * ONE_OVER_SQRT3;' +
        ' }' +
        ' 注意：三角形接法的电机环流让相电流和不为 0，方案直接失效——压缩机偶尔遇到三角接的电机要立刻切回 3 路独立采样。EV 主驱必须 3 路独立 + LEM 闭环霍尔，KCL 残差是一路故障的免费报警器。',
      whyMattersEn: 'Real STM32 boards often use only two current channels (op-amp + sense resistor + ADC) — saving one channel of BOM and one PCB trace. The price: (1) motor must be wye (floating neutral, KCL forces Σi = 0); (2) both ADC offsets calibrated; (3) KCL self-check unavailable (Ic is computed, KCL tautological). Minimum STM32 G4 + JSQR skeleton with PWM-midpoint sampling: configure ADC1 injected trigger to TIM1_TRGO with a 2-rank scan reading channels 1 (Ia) and 2 (Ib); in ADC1_2_IRQHandler read raw codes from injected ranks, subtract boot-time calibrated offsets, scale to amps, then ic = −ia − ib (the key step depending on wye KCL), then ialpha = ia and ibeta = (ia + 2·ib) × ONE_OVER_SQRT3. Note: delta motors carry circulating currents that break Σi = 0, so this scheme fails immediately — drop a delta compressor back to 3-channel sampling. EV traction must use 3 independent channels + LEM closed-loop Hall, where the KCL residual is a free single-channel-failure alarm.',
    },
    {
      id: 'amplitude-vs-power',
      title: '幅值 vs 功率',
      goal: '搞清"幅值不变"和"功率不变"两种 Clarke 的真实差别',
      goalEn: 'Pin down the real difference between amplitude-invariant and power-invariant Clarke.',
      action: '保持 Ia=5、Ib=−2.5、Ic=−2.5。注意当前的 |Iαβ| = √(5²+0²) = 5 A —— 这就是"幅值不变"形式：αβ 矢量幅值 = 单相峰值。',
      observe: '换成"功率不变"形式（公式前面乘 √(2/3) ≈ 0.8165），同样三相输入会得到 |Iαβ| ≈ 4.08 A —— 矢量被缩小了 18%，但 dq 域瞬时功率公式 P = 1.5·(Vd·Id+Vq·Iq) 改成 P = (Vd·Id+Vq·Iq)，少了 1.5 倍因子。',
      observeEn: 'Switch to power-invariant (multiply by √(2/3) ≈ 0.8165) and the same three-phase input gives |Iαβ| ≈ 4.08 A — the vector shrinks by 18%, but the dq-domain instantaneous power formula simplifies from P = 1.5·(Vd·Id + Vq·Iq) to P = Vd·Id + Vq·Iq.',
      whyMatters: '两种形式在数学上完全等价，但工程上：① 嵌入式 / TI Motor 库 / ST FOC SDK 几乎全用幅值不变（αβ 直接等于相电流读数，调试时示波器看 αβ 和看 ADC 量纲一致）② 学术教材和功率电子分析常用功率不变（dq 域瞬时功率公式无 1.5 因子）。最致命的混用后果：你照搬一份"功率不变"教材里的 Kp/Ki 数值，套进一个"幅值不变"实现里 → 电流环带宽错位 18%、限幅圆错位 18%、SVPWM 调制比错位 18% —— 系统稳定但莫名其妙地差，调试要绕大半天才反应过来。读任何教材的 FOC 公式前先翻到 Clarke 那一节确认它用哪种形式，是嵌入式工程师的基本功。',
      whyMattersEn: 'The two forms are mathematically equivalent, but engineering-wise: (1) embedded / TI Motor lib / ST FOC SDK almost all use amplitude-invariant (αβ directly equals phase-current readings, so scope views of αβ and ADC share units); (2) academic textbooks and power-electronics analysis use power-invariant (no 1.5 factor in the dq-domain instantaneous power formula). The most lethal cross-mix is copying Kp/Ki from a power-invariant textbook into an amplitude-invariant implementation → current-loop bandwidth, limit circle, and SVPWM modulation index all sit 18% off — the system is stable but mysteriously underperforming. Before using any FOC formula, flip to its Clarke chapter to confirm the form — basic discipline for an embedded engineer.',
      quiz: {
        q: '功率不变与幅值不变 Clarke 混用在 FOC 项目里，最直接的后果是？',
        options: [
          '没差别，最终结果一样',
          'PI 增益、电流限幅、SVPWM 调制比全部按 √(2/3) ≈ 0.82 比例错位',
          '电机直接不转',
          'ADC 数据溢出',
        ],
        correct: 1,
        hint: '√(2/3) ≈ 0.8165。所有依赖 αβ 幅值的下游模块（PI 跟踪误差、限幅器、过流保护、SVPWM 六边形顶点）都会按这个倍数偏离。这是非常隐蔽的"工作但性能莫名差"型 bug——电流环带宽实测比设计值低 18%，会被误诊为"硬件没调好"或"PWM 频率不够"。',
        qEn: 'Mixing power-invariant and amplitude-invariant Clarke in an FOC project — what is the most direct consequence?',
        optionsEn: [
          'No difference, the end result is the same',
          'PI gains, current limits, and SVPWM modulation index all sit off by a factor of √(2/3) ≈ 0.82',
          'The motor simply will not spin',
          'ADC data overflows',
        ],
        hintEn: '√(2/3) ≈ 0.8165. Everything downstream that depends on αβ amplitude (PI tracking error, limiter, overcurrent guard, SVPWM hex vertices) sits off by this factor. A very subtle "works but mysteriously slow" bug — the measured current-loop bandwidth comes in 18% below design, often misdiagnosed as "hardware not yet tuned" or "PWM too low".',
      },
    },
    {
      id: 'rotating-input',
      title: '让它转起来',
      goal: '看 Clarke 输出"还是个 AC 矢量"，不是终点',
      goalEn: 'See that the Clarke output is still an AC vector — not the destination.',
      action: '切回"平衡三相正弦"输入模式，幅值 = 5A、相位 = 0°，启动运行。',
      observe: 'αβ 平面上的白点开始沿单位圆匀速旋转——矢量幅值恒定 5 A，但方向在转。这跟 02 模块的"旋转磁场矢量"几乎一模一样，只是换了坐标系标签：那边叫"定子磁场矢量"，这边叫"αβ 电流矢量"。',
      observeEn: 'The white dot in the αβ plane rotates uniformly along the unit circle — magnitude held at 5 A while the direction turns. Essentially the same picture as Module 02\'s "rotating field vector", just with different labels: there it was the stator field vector; here it is the αβ current vector.',
      whyMatters: '关键认知：Clarke 没有消除"AC 性"——它只是把 3 个 AC 标量压成 2 个 AC 标量。这点对 FOC 设计很重要：如果让 PI 直接跟踪 Iα/Iβ，那 PI 看到的还是高速正弦目标值，稳态会有相位/幅值误差（这就是早期"标量控制"的局限）。下一步 Park 变换会做的事是：跳到一个跟着矢量同步旋转的坐标系，AC 矢量就"停"下来变成 DC——PI 才能零稳态误差地控住。这也是 FOC 全称 "Field Oriented Control" 里 "Oriented" 一词的真实含义：坐标系定向到磁场方向。',
      whyMattersEn: 'Key insight: Clarke does not eliminate AC-ness — it only compresses three AC scalars into two AC scalars. This matters for FOC design: a PI tracking Iα/Iβ directly still sees a high-frequency sinusoidal target with steady-state phase/amplitude error (the limit of early "scalar control"). The next step (Park) jumps onto a frame that co-rotates with the vector, so the AC vector "freezes" into DC — only then can the PI hold it with zero steady-state error. This is the literal meaning of "Oriented" in Field-Oriented Control: the frame is oriented to the field.',
    },
    {
      id: 'stm32-q15-implementation',
      title: 'STM32 q15 整数实现',
      goal: '把 Clarke 矩阵写成不用 FPU 也跑得快的 q15 定点',
      goalEn: 'Code Clarke in fast q15 fixed-point that runs without an FPU.',
      action: '想象目标平台是 STM32F103（Cortex-M3 无 FPU）或 G0 系列。要用 16-bit 整数算 Iβ = (Ia + 2·Ib) / √3。',
      observe: '把 1/√3 ≈ 0.57735 预算成 q15 常量 18919（= round(0.57735 × 32768)）。一次 Clarke 只需 1 加 + 1 乘 + 1 右移，约 100 ns @ 72 MHz Cortex-M3，比浮点 div 快 10 倍。',
      observeEn: 'Pre-compute 1/√3 ≈ 0.57735 as the q15 constant 18919 (= round(0.57735 × 32768)). One Clarke needs 1 add + 1 multiply + 1 right shift, about 100 ns on a 72 MHz Cortex-M3, 10× faster than a floating divide.',
      whyMatters: '低成本 STM32 / GD32 / 国产 RISC-V MCU 多数无 FPU，Clarke / Park / SVPWM 必须全部走 q15 整数路径。注意三个坑：① 中间结果 (ia + 2·ib) 可能溢出 q15（±32767），必须升到 q31 再算 ② q15 乘法在 ARM 上有 SMULBB / SMULTB 指令，一次 1 个周期，比浮点 mul 快很多 ③ 1/√3 = 18919 的精度等效 ±0.003% 误差，远小于 ADC 量化噪声，不用担心。生产骨架（带 CMSIS-DSP）：' +
        ' /* CMSIS-DSP q15 风格，单周期 SIMD 在 M4/M7 上可达 200 ns */' +
        ' #define ONE_OVER_SQRT3_Q15  18919  /* round(0.57735 * 32768) */' +
        ' static inline void clarke_q15(int16_t ia, int16_t ib, int16_t *ialpha, int16_t *ibeta) {' +
        '   int32_t tmp = (int32_t)ia + ((int32_t)ib << 1);  /* ia + 2*ib，q15+q15 → q15 但中间用 q31 防溢出 */' +
        '   *ialpha = ia;' +
        '   *ibeta  = (int16_t)((tmp * ONE_OVER_SQRT3_Q15) >> 15);  /* q15 乘法 + 右移恢复 q15 */' +
        ' }' +
        ' /* CMSIS-DSP 等价调用：arm_clarke_q15(ia, ib, &ialpha, &ibeta); */' +
        ' 实测在 F103 @ 72 MHz：手写 q15 ≈ 100 ns，CMSIS-DSP q15 ≈ 80 ns，浮点 ≈ 1.2 μs（软浮点库）。压缩机 16 kHz PWM 中断里 ISR 总预算 62.5 μs，整数实现给 SMO / PLL / HFI 解调腾出 90% 的时序余量——这就是为什么便宜的 G0 也能跑生产级 FOC。',
      whyMattersEn: 'Low-cost STM32 / GD32 / domestic RISC-V MCUs mostly lack an FPU, so Clarke/Park/SVPWM must all run on a q15 path. Three pitfalls: (1) the intermediate (ia + 2·ib) can overflow q15 (±32767), promote to q31; (2) ARM has single-cycle SMULBB/SMULTB for q15 multiplies, much faster than floating multiplies; (3) 1/√3 = 18919 has ±0.003% error, far below ADC quantization noise. Production skeleton: define ONE_OVER_SQRT3_Q15 as 18919; in clarke_q15(ia, ib, ialpha, ibeta) compute tmp = (int32_t)ia + ((int32_t)ib << 1) (q31 to avoid overflow), set *ialpha = ia, *ibeta = (int16_t)((tmp * ONE_OVER_SQRT3_Q15) >> 15); the CMSIS-DSP equivalent is arm_clarke_q15. On F103 @ 72 MHz: hand-written q15 ≈ 100 ns, CMSIS-DSP q15 ≈ 80 ns, float ≈ 1.2 μs (soft-FP). With a 16 kHz PWM ISR budget of 62.5 μs, integer code leaves 90% timing margin for SMO / PLL / HFI demodulation — which is why a cheap G0 can still run production-grade FOC.',
    },
    {
      id: 'recap-to-park',
      title: '接 Park',
      goal: '把 αβ 矢量正式交给 Park',
      goalEn: 'Hand the αβ vector off to Park formally.',
      action: '参数复位（balanced 模式、幅值 = 6 A、相位 = 0、ic 自动 = -ia-ib）。看 αβ 平面里旋转的矢量。',
      observe: '矢量在 αβ 平面画圆，转一圈对应电流的一个完整电周期。圆的半径 = 6 A（幅值不变形式下，等于相电流峰值）。',
      observeEn: 'The vector traces a circle on the αβ plane; one revolution = one electrical cycle. Radius = 6 A (under amplitude-invariant form, equal to the phase-current peak).',
      whyMatters: '下一模块（04 Park）做的事用一句话总结：在 αβ 平面上"跳上去跟矢量一起转"，从而让矢量在新坐标系（dq）里看起来"不动"。Id 是矢量在 d 轴上的投影（控磁链），Iq 是在 q 轴上的投影（控转矩）。整套 FOC 的"为什么能用 PI"，根本原因就是 Park 把交流问题变成了直流问题。Clarke 是这条链路的"无损降维 + KCL 自检"，Park 才是"AC 变 DC 的魔法"。',
      whyMattersEn: 'Module 04 (Park) in one sentence: jump onto the αβ plane and co-rotate with the vector so it "stands still" in the new (dq) frame. Id is the projection on the d axis (controls flux); Iq is on the q axis (controls torque). The reason FOC "can use PI at all" is precisely that Park turns AC into DC. Clarke is the chain\'s "lossless dimensionality reduction + KCL self-check"; Park is the "AC-to-DC magic".',
    },
  ],
  pitfalls: [
    {
      id: 'wrong-sign-third-phase',
      label: '试错：两路采样里 Ic 符号写成 +Ia+Ib',
      labelEn: 'Mis-step: in two-channel sampling, Ic written as +Ia + Ib (wrong sign)',
      symptom: 'αβ 矢量幅值变 2 倍、I0 显著非零、电流环开环就过流保护跳闸',
      symptomEn: 'The αβ vector amplitude doubles, I0 becomes significantly non-zero, and even open-loop the current loop trips overcurrent.',
      why: '正确公式 Ic = −Ia − Ib（三相和=0 推出来）。写成 +Ia+Ib 等价于让"虚拟第三相"翻倍，结果 Clarke 输出 Iα 不变但 Iβ 多了一个 √3 倍的项，矢量幅值飘到正常的 1.7~2 倍。生产 PCB 上这个 bug 几乎一定触发过流保护，但你会以为是硬件问题。先在 main() 启动前调用 self_test_clarke() 静态喂 (5, -2.5, -2.5) 验证 Clarke 输出 (5, 0) 再上电，能避开 90% 这类隐蔽错误。',
      whyEn: 'The correct formula is Ic = −Ia − Ib (from sum = 0). Writing +Ia + Ib effectively doubles the "virtual third phase": Iα is unchanged but Iβ gains a √3-scaled extra term, so the vector amplitude drifts to 1.7–2× normal. On real PCB this bug almost certainly trips overcurrent — easy to mistake for hardware failure. Call self_test_clarke() with the static (5, −2.5, −2.5) check before main() runs PWM to confirm Clarke outputs (5, 0); this avoids 90% of such hidden errors.',
    },
    {
      id: 'forget-adc-offset',
      label: '试错：跳过 ADC 偏置校准就上电',
      labelEn: 'Mis-step: boot without ADC offset calibration',
      symptom: '电机不通电时 |I0| 已经达到 0.3~0.8 A，αβ 端点画的圆中心偏离原点，FOC 启动后听见 100/120 Hz 嗡嗡声',
      symptomEn: 'Even with the motor de-energized, |I0| sits at 0.3–0.8 A; the αβ circle is off-center; after FOC starts you can hear a 100/120 Hz hum.',
      why: 'ADC 输出的不是真零电流的"代码 0"，而是出厂时的偏置量（通常占满量程的 50%，留给双向电流测量）。如果上电时不先记录这个偏置然后在 FOC 中减掉，所有"相电流"读数都带着固定的 DC 偏移——直接进 Clarke 后表现为 I0 飘大、αβ 圆心偏移。这条偏移被 Park 旋进 dq 域变成 2 倍电频率的纹波（一倍电频率 + 反射），让转矩出现可听见的嗡声。修复：上电流程加 calibrate_adc_offset(1024) —— 电机不通电时取 1024 次 ADC 平均当零点，写进 motor_calib.adc_offset_a/b/c，每次启动重做或写 Flash 持久化。',
      whyEn: 'At zero current the ADC code is not 0 but the factory mid-point (typically 50% of full scale). Without recording this offset at boot and subtracting it in FOC, every phase-current reading carries a DC offset — Clarke shows this as drifting I0 and an off-center αβ circle. Park rotates the offset into the dq domain as a 2× electrical-frequency ripple, producing audible torque hum. Fix: call calibrate_adc_offset(1024) at boot — 1024-sample average with motor de-energized, save to motor_calib.adc_offset_a/b/c, redo at every cold start or persist to Flash.',
    },
    {
      id: 'mix-amplitude-power',
      label: '试错：照搬功率不变形式教材的 Kp/Ki',
      labelEn: 'Mis-step: copy Kp/Ki from a power-invariant textbook',
      symptom: '电流环阶跃响应明显比预期慢 18%~20%，但又不至于不稳定；调 PWM 频率 / 改 ADC 滤波都没用',
      symptomEn: 'Current-loop step response is visibly 18–20% slower than expected, yet not unstable; changing PWM frequency or ADC filtering does not help.',
      why: '功率不变形式 αβ 幅值比幅值不变形式小 √(2/3) ≈ 0.82。等价于 PI 看到的"误差"被缩小了 18%。Kp 表现为变小、Ki 也变小，整个电流环带宽下降。最隐蔽的版本是看起来"系统稳定、能动、就是性能稍差"——非常容易被当作"硬件没调好"或"母线电压不够"误诊。读任何教材的 FOC 公式前，先翻到 Clarke 那一节确认它用的是哪种形式；TI Motor SDK / ST FOC SDK / 国产英飞特等主流库统一用幅值不变。',
      whyEn: 'In power-invariant form, the αβ amplitude is √(2/3) ≈ 0.82× smaller, so the PI sees an "error" 18% smaller. Effective Kp and Ki shrink, current-loop bandwidth drops. The most insidious symptom: stable, functioning, just slightly underperforming — easily misdiagnosed as "hardware not yet tuned" or "DC link too low". Before using any FOC formula, flip to its Clarke chapter to confirm the form; TI Motor SDK, ST FOC SDK, and most mainstream Chinese libraries all use amplitude-invariant.',
    },
    {
      id: 'two-adc-on-delta',
      label: '试错：三角形连接电机用两路采样重构 Ic',
      labelEn: 'Mis-step: reconstruct Ic from two channels on a delta-connected motor',
      symptom: 'Ic = −Ia − Ib 在线电流域成立，但相电流（绕组内部环流）三相和不为 0，FOC 整体行为诡异：力矩波动、效率偏低、Iq 命令稳态但实际转矩抖',
      symptomEn: 'Ic = −Ia − Ib holds in line currents but not phase currents (winding circulation breaks the sum); FOC behavior is bizarre: torque ripple, low efficiency, Iq command steady but actual torque jittering.',
      why: '三角形连接里"线电流"和"相电流"是两个概念——线电流之和 = 0（KCL 在外部节点），但相电流（每根绕组里实际产生磁动势的电流）可以有环流（由零序电压 + 三相阻抗不平衡激发）。两路 ADC 测的是线电流，重构出来的 Ic 也只是线电流，但 FOC 假设的"相电流"对应的是绕组里实际产生磁动势的电流。这种系统必须三路独立采样，不能省。压缩机里偶尔遇到三角形接法的电机就要特别小心；选型阶段就要确认绕组接法（星型 Y / 三角 Δ），写进 motor_config.h 让代码自动选采样方案。',
      whyEn: 'In delta, line current ≠ phase current: line currents sum to 0 (KCL at external nodes), but phase currents (those actually producing MMF inside the windings) can carry circulating components (excited by zero-sequence voltage + impedance imbalance). Two ADCs measure line currents, reconstructed Ic is a line current, but FOC assumes the phase current producing MMF — mismatch. Such systems must use three independent ADCs. Be especially careful with the (rare but real) delta-connected compressor; confirm wiring (Y or Δ) at selection time and write it into motor_config.h so the code auto-selects the sampling scheme.',
    },
  ],
  nextModuleHook: '现在你把三相 AC 压成了 αβ 平面上一个旋转矢量，并学会了用 KCL 残差做 30 秒故障鉴别。下一模块（04 Park）做最后一跳：把坐标系也"转起来"和矢量同步，AC 矢量在新坐标里变成 Id、Iq 两个 DC 量——这就是 FOC 能用 PI 精确控转矩的根本原因。',
  nextModuleHookEn: 'You now compress three-phase AC into a rotating αβ-plane vector and use the KCL residual as a 30-second fault discriminator. Module 04 (Park) makes the final hop: spin the frame with the vector so the AC vector becomes two DC quantities Id and Iq — the root reason FOC can use PI to precisely regulate torque.',
};
