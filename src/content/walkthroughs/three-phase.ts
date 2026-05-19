import type { ModuleWalkthrough } from './types';

/**
 * 02 三相磁场 —— 把"三个 120° 错开的正弦合成旋转磁场"做实+把工业采样链问题接进来。
 *
 * 教学路径：旋转磁场 → 幅值/频率独立 → 三相和 = 0（KCL） → 不平衡椭圆 →
 *           死区 5/7 次谐波 → 采样时机 → STM32 双 ADC 同步采样 + 注入触发代码骨架 → 交棒 Clarke。
 *
 * 工业绑定：空调 1.5HP 压缩机三相采样链路（运放 + 采样电阻 + ADC1/ADC2 注入通道 +
 *           TIM1 中点触发），洗烘一体机直驱、APF 三相电流测量。
 */
export const threePhaseWalkthrough: ModuleWalkthrough = {
  moduleId: 'three-phase',
  bigPicture: '三个 120° 错开正弦 → 旋转磁场矢量；同时 Ia+Ib+Ic=0 是免费的硬件健康度听诊器。',
  bigPictureEn: 'Three 120°-offset sinusoids synthesize a rotating field vector; meanwhile Ia + Ib + Ic = 0 is a free hardware-health stethoscope.',
  successCriteria: [
    '能解释幅值（电流大小）与频率（电频率 = 转速·polePairs/60）在物理上完全独立',
    '能在 30 秒内用 Ia+Ib+Ic 残差判断三相采样链是否健康（阈值 0.1A）',
    '能识别"αβ 端点画椭圆 → 不平衡或 ADC 偏置"、"圆带毛边 → 5/7 次谐波"两种典型指纹',
    '理解死区时间为什么产生 5、7、11、13 次谐波，并知道用什么补偿方案',
    '掌握 STM32 双 ADC 同步采样 + TIM1 中点注入触发的最小配置代码',
    '能说出"两路 ADC 重构 Ic = −Ia−Ib"的成立前提（三相星型 + ADC 偏置已校准）',
  ],
  successCriteriaEn: [
    'Explain that amplitude (current magnitude) and frequency (electrical frequency = rpm·polePairs/60) are physically independent.',
    'Use the Ia + Ib + Ic residual to judge in 30 seconds whether the three-phase sampling chain is healthy (threshold 0.1 A).',
    'Identify two typical fingerprints: "αβ endpoint draws an ellipse → imbalance or ADC offset" and "circle with fuzz → 5th/7th harmonics".',
    'Understand why dead time produces 5th, 7th, 11th, 13th harmonics and which compensation schemes apply.',
    'Master the minimum STM32 configuration for dual-ADC synchronous sampling triggered at the TIM1 mid-point.',
    'State the preconditions for two-channel ADC + reconstructed Ic = −Ia − Ib (three-phase wye + calibrated ADC offsets).',
  ],
  steps: [
    {
      id: 'rotating-field',
      title: '看旋转磁场',
      goal: '建立"三相合成 = 旋转矢量"的几何认知',
      goalEn: 'Build the geometric intuition that "three-phase synthesis = a rotating vector".',
      action: '点"运行"启动仿真，幅值 6A、频率 50Hz、不平衡=0、谐波=0。盯左侧定子截面里的绿色合成箭头。',
      observe: '三相 ⊙⊗ 此消彼长；中心绿色合成磁场箭头匀速旋转，画出完美的圆；αβ 平面里白点同步画同一个圆。',
      observeEn: 'The three-phase ⊙⊗ markers swap intensity; the green resultant arrow at the center rotates uniformly, tracing a perfect circle; the white dot in the αβ plane traces the same circle in sync.',
      whyMatters: '这就是所有 AC 电机能转的物理根。FOC 不"造"这个磁场——它只精确控制磁场的相对位置（角度）和长度（电流幅值）。压缩机 6 极对 + 50 Hz 电流 = 机械转速 500 rpm；这个旋转矢量在 αβ 平面以 50 Hz 转，每一圈对应一个完整的电周期。',
      whyMattersEn: 'This is the physical root of every AC motor\'s rotation. FOC does not "create" this field — it precisely controls the field\'s relative position (angle) and length (current amplitude). A 6 pole-pair compressor at 50 Hz current = 500 rpm mechanical; this rotating vector spins at 50 Hz in the αβ plane, one revolution per electrical cycle.',
      presetId: 'rotating-field',
    },
    {
      id: 'amp-vs-freq',
      title: '幅值 vs 频率独立',
      goal: '亲手把"磁场强度"和"磁场转速"两个旋钮分开',
      goalEn: 'Separate the "field strength" and "field rotational speed" knobs with your own hands.',
      action: '先把幅值从 6 拉到 10A 看圆变大；再幅值回 6、频率从 50→120Hz 看转速变快但圆大小不变。',
      observe: '|F| ∝ I 与 f 完全独立。120Hz 时一秒画 120 个圆；幅值不变。',
      observeEn: '|F| ∝ I is completely independent of f. At 120 Hz the dot traces 120 circles per second; magnitude unchanged.',
      whyMatters: 'FOC 解耦控制的物理前提：转矩对应 Iq（幅值）、转速对应 ω_e（频率），两条旋钮硬件上可独立调。压缩机变频空调"风量"和"温度"对应的就是控 ω_e（频率）+ 控 Iq（幅值）两条独立路径。',
      whyMattersEn: 'The physical premise of FOC decoupled control: torque maps to Iq (amplitude), speed maps to ω_e (frequency), two knobs independently tunable in hardware. In a variable-speed AC compressor, "airflow" and "temperature" correspond to ω_e (frequency) and Iq (amplitude) along independent paths.',
      quiz: {
        q: '空调压缩机 6 极对，FOC 把 q 轴电流 Iq* 从 5A 阶跃到 10A，电频率不变（500 rpm）。定子合成磁场会？',
        options: [
          '转速变快、幅值不变',
          '转速不变、幅值变大约 2 倍（Iq 翻倍但 Id 不变）',
          '幅值翻倍、转速也翻倍',
          '无变化（FOC 只控转矩不控磁场）',
        ],
        correct: 1,
        hint: '幅值 = √(Id²+Iq²)；Iq 翻倍而 Id=0 时幅值跟着翻倍。频率由速度环输出的 ω_e 决定，与电流幅值无关——这正是 FOC 解耦的体感。选 A/C/D 都把"控转矩 = 控转速"混淆了。',
        qEn: 'An HVAC compressor at 6 pole pairs runs FOC; Iq* steps from 5 A to 10 A while electrical frequency stays the same (500 rpm). What happens to the stator resultant field?',
        optionsEn: [
          'Rotation speeds up, amplitude unchanged',
          'Speed unchanged, amplitude roughly doubles (Iq doubles while Id stays 0)',
          'Both amplitude and speed double',
          'No change (FOC only controls torque, not the field)',
        ],
        hintEn: 'Amplitude = √(Id² + Iq²); when Iq doubles and Id = 0, amplitude doubles too. Frequency is set by ω_e from the speed loop and is independent of current amplitude — the felt experience of FOC decoupling. Options A/C/D confuse "controlling torque" with "controlling speed".',
      },
    },
    {
      id: 'sum-zero-kcl',
      title: 'Ia+Ib+Ic=0 听诊器',
      goal: '把 KCL 变成产线在线诊断指标',
      goalEn: 'Turn KCL into an in-line production diagnostic metric.',
      action: '盯三相数值卡片。在不同时刻读 Ia/Ib/Ic 三个数求和，确认 |Ia+Ib+Ic| < 0.05 A。然后把"三相不平衡"调到 0.2 再求一次。',
      observe: '平衡时和 ≈ 0；不平衡时和不再为 0，浮动在 ±0.5 A 量级。',
      observeEn: 'When balanced the sum ≈ 0; when imbalanced the sum is no longer 0 and fluctuates at the ±0.5 A level.',
      whyMatters: 'KCL 在三相星型电机里 100% 成立（中性点浮空 → 无第三回路）。STM32 FOC ISR 末尾加一行 if (fabsf(ia+ib+ic) > 0.1f) fault_flag |= FAULT_KCL; 就实现了在线硬件健康度监测——比示波器抓波形快 1000 倍。压缩机产线点检的"老师傅口诀"之一就是：报"过流"先看 KCL 残差大不大，残差大 = 采样问题，残差小 = 真过流。',
      whyMattersEn: 'KCL holds 100% in a three-phase wye motor (floating neutral → no third return). Adding one line at the end of the STM32 FOC ISR — `if (fabsf(ia+ib+ic) > 0.1f) fault_flag |= FAULT_KCL;` — gives in-line hardware-health monitoring 1000× faster than scoping waveforms. A veteran rule on compressor production lines: when "overcurrent" reports, first check the KCL residual — large residual = sampling problem, small residual = real overcurrent.',
      quiz: {
        q: 'STM32 FOC ISR 里实时算 ia+ib+ic，正常应 ≈ 0。某天观察到稳态时和 ≈ 0.6 A（额定 6 A，残差 10%）。最可能根因？',
        options: [
          '电机绕组缺相',
          'A/B/C 某一路 ADC 零点漂移（运放温飘、采样电阻老化）',
          'PWM 频率太高引入采样误差',
          '电机轴承磨损',
        ],
        correct: 1,
        hint: '稳态 10% KCL 残差最常见是 ADC 偏置——绕组缺相会让 Ia/Ib/Ic 某一相 = 0 且其它两相大幅波动，残差远大于 10%。修复：上电先做 ADC 零点校准——电机不通电时连续采 1024 次取平均当零点存 Flash，FOC ISR 减掉。PWM 频率与零点漂移无关。',
        qEn: 'The STM32 FOC ISR computes ia + ib + ic in real time; it should be ≈ 0. One day at steady state the sum is ≈ 0.6 A (rated 6 A, residual 10%). Most likely root cause?',
        optionsEn: [
          'Lost motor winding phase',
          'ADC zero drift on one of A/B/C (op-amp thermal drift or sense-resistor aging)',
          'PWM frequency too high, introducing sampling error',
          'Bearing wear',
        ],
        hintEn: 'A 10% KCL residual at steady state is most commonly ADC offset — a lost phase would drive one of Ia/Ib/Ic to zero with the other two swinging massively, far above 10%. Fix: calibrate ADC zero at boot — sample 1024 times with the motor de-energized, average to a zero offset, store in Flash, subtract in the ISR. PWM frequency has nothing to do with zero drift.',
      },
    },
    {
      id: 'unbalance-ellipse',
      title: '不平衡指纹',
      goal: '看见"αβ 画椭圆"是硬件采样不平衡的视觉指纹',
      goalEn: 'See that "αβ traces an ellipse" is the visual fingerprint of hardware sampling imbalance.',
      action: '把"三相不平衡"从 0 拉到 0.3，看 αβ 平面白点轨迹。再拉到 0.5。',
      observe: '圆压扁成椭圆；长轴 / 短轴比约 1:0.5 时 αβ 角速度不再均匀（"快慢摇"）。',
      observeEn: 'The circle squashes into an ellipse; at a 1:0.5 axis ratio, αβ angular velocity becomes non-uniform ("fast-slow wobble").',
      whyMatters: '生产现场"αβ 椭圆"几乎一定是硬件问题：① ADC 零点没校 ② 三相采样电阻容差（标称 1% 实际可能 2%）③ 缺相 ④ 相序错。看到椭圆**绝不要去改算法**——直接回硬件层查。模块 12 故障调试会把椭圆 → 缺相 / 偏置 / 相序的分类决策树串起来。',
      whyMattersEn: 'In the field, an "αβ ellipse" is almost always a hardware issue: (1) un-calibrated ADC zero, (2) sense-resistor tolerance (nominally 1%, possibly 2% real), (3) lost phase, (4) wrong phase order. When you see an ellipse, **do not touch the algorithm** — drop back to hardware. Module 12 (fault debugging) wires up the full ellipse → lost-phase / offset / phase-order classification tree.',
    },
    {
      id: 'deadtime-harmonics',
      title: '死区 5/7 次谐波',
      goal: '理解死区时间为什么产生 5、7 次谐波及补偿思路',
      goalEn: 'Understand why dead time produces 5th and 7th harmonics, and the compensation idea.',
      action: '把不平衡调回 0；把"5 次谐波"拉到 0.2。看波形顶端和 αβ 端点。',
      observe: '三相正弦顶变成"凹陷的菱角"；αβ 圆边出现 6 瓣对称的小起伏。',
      observeEn: 'The three-phase sinusoid peaks turn into "dimpled rhombuses"; the αβ circle edge gains six small symmetric lobes.',
      whyMatters: '真实电机里 5/7 次谐波主要来自死区时间——上下管不能同时导通，每次开关切换 PWM 实际输出比命令少了 ΔV_dt = (t_dead/Ts)·Udc·sign(I_phase)。每相电流过零时符号翻转 → 输出阶跃失真 → 在傅里叶展开里贡献 6k±1 次谐波（5、7、11、13）。补偿方案：根据 sign(i_phase) 在每相占空比上加 ±ΔV_dt/Udc 的偏置——但相电流过零附近 sign 函数本身有量化噪声，过零段补偿反而加重失真。工业方案是"过零禁区"——|I_phase| < 0.3A 时不补偿，避免错补。这是模块 08 逆变器要细讲的。',
      whyMattersEn: 'Real-motor 5th/7th harmonics come mainly from dead time — the high and low switches cannot conduct simultaneously, so at every switching transition the actual PWM output lags the command by ΔV_dt = (t_dead/Ts)·Udc·sign(I_phase). When a phase current crosses zero, the sign flips → step distortion → contributes 6k±1 harmonics (5th, 7th, 11th, 13th) in the Fourier expansion. Compensation: add ±ΔV_dt/Udc bias to each phase duty according to sign(i_phase) — but near zero-crossing the sign function itself is noisy and naive compensation worsens distortion. The industrial answer is a "zero-cross dead zone": when |I_phase| < 0.3 A, skip compensation. Module 08 (inverter) covers this in depth.',
      quiz: {
        q: '空调压缩机 PWM 16 kHz、死区 1 μs、母线 310 V。死区造成的相电压畸变 ΔV_dt 大约？',
        options: [
          '0.005 V（可忽略）',
          '5 V（占基波 ~3%，5/7 次谐波来源）',
          '50 V（撑爆母线）',
          '依赖电机参数（与 Udc 无关）',
        ],
        correct: 1,
        hint: 'ΔV_dt = (t_dead/Ts)·Udc·sign(I) = (1μs / 62.5μs) × 310 × sign(I) ≈ 4.96 V。占基波约 3%——FFT 看 5、7 次谐波各占基波 ~1%。这就是为什么 EV 主驱 SiC 选 t_dead = 200 ns 而不是 1 μs：每减一半死区，谐波就少一半，电机温升和振动跟着改善。',
        qEn: 'HVAC compressor: PWM 16 kHz, dead time 1 μs, DC link 310 V. Approximately what is the phase-voltage distortion ΔV_dt caused by dead time?',
        optionsEn: [
          '0.005 V (negligible)',
          '5 V (~3% of the fundamental, the source of 5th/7th harmonics)',
          '50 V (would blow the DC link)',
          'Depends on motor parameters (unrelated to Udc)',
        ],
        hintEn: 'ΔV_dt = (t_dead/Ts)·Udc·sign(I) = (1 μs / 62.5 μs) × 310 × sign(I) ≈ 4.96 V. About 3% of the fundamental; in the FFT the 5th and 7th harmonics each show ~1% of the fundamental. This is why EV traction with SiC picks t_dead = 200 ns instead of 1 μs: halving dead time halves the harmonics, with corresponding gains in temperature rise and vibration.',
      },
    },
    {
      id: 'sample-noise-timing',
      title: '采样时机',
      goal: '理解 ADC 采样点为什么必须落在 PWM 中点',
      goalEn: 'Understand why the ADC sample instant must land at the PWM mid-point.',
      action: '把谐波调回 0，"采样噪声"从 0 加到 1 A。看 αβ 平面的"毛茸茸"圆。',
      observe: '原本光滑的圆变毛糙——白点在曲线周围 ±0.5 A 随机抖动；三相波形上叠加肉眼可见毛刺。',
      observeEn: 'The previously smooth circle becomes furry — the white dot jitters ±0.5 A randomly around the curve; visible glitches overlay the three-phase waveforms.',
      whyMatters: 'STM32 上典型噪声来源：① ADC 采样点放在开关边沿（di/dt 大、共模噪声）；② 触发链路抖动（软件触发 vs 硬件 TRGO 同步）；③ 运放接地走线差。修复唯一正路：用 TIM1 中心对齐 PWM 计数到 ARR 时（PWM 中点 = 所有桥臂稳态 111 或 000、电流处于"纹波谷"）通过 TRGO 触发 ADC 注入通道——硬件信号 0 软件延迟。**绝不要**用数字低通滤波器抹噪声——滤波器引入相位滞后会让 Park 看见"1ms 前的电流"，电流环带宽掉一半。',
      whyMattersEn: 'Typical STM32 noise sources: (1) ADC sample on a switching edge (high di/dt and common-mode noise); (2) trigger-path jitter (software trigger vs hardware TRGO sync); (3) poor op-amp ground routing. The only right answer: trigger the ADC injected channel via TRGO when TIM1 center-aligned PWM counts to ARR (PWM mid-point — all bridge legs in steady state 111 or 000, current at the "ripple valley") — hardware signal, zero software latency. **Never** use a digital low-pass filter to mask noise — the phase lag makes Park see "the current from 1 ms ago" and halves the current-loop bandwidth.',
    },
    {
      id: 'stm32-dual-adc',
      title: 'STM32 双 ADC + TIM1',
      goal: '把"PWM 中点同步采样"落到 STM32 寄存器配置',
      goalEn: 'Pin "PWM mid-point synchronous sampling" down to STM32 register configuration.',
      action: '看下面 STM32 LL 风格代码：TIM1 中心对齐 PWM + ADC1 注入通道 A 相、ADC2 注入通道 B 相、双 ADC 同步模式让 A/B 在同一时刻采样。',
      observe: 'ADC1/2 由 TIM1 TRGO 同步触发；JEXTSEL 选 TIM1_CC4（PWM 中点）；DMA 把结果搬到 ia_raw/ib_raw 数组。FOC ISR 在 ADC EOC 中断里读出。',
      observeEn: 'ADC1/2 are synchronously triggered by TIM1 TRGO; JEXTSEL selects TIM1_CC4 (PWM mid-point); DMA moves results into the ia_raw/ib_raw arrays. The FOC ISR reads them in the ADC EOC interrupt.',
      whyMatters: 'STM32F3/G4 双 ADC 同步采样骨架（生产代码）：' +
        ' /* TIM1 中心对齐 + CC4 在 PWM 中点产生触发 */' +
        ' LL_TIM_SetCounterMode(TIM1, LL_TIM_COUNTERMODE_CENTER_UP);' +
        ' LL_TIM_OC_SetCompareCH4(TIM1, TIM1->ARR / 2);' +
        ' LL_TIM_SetTriggerOutput(TIM1, LL_TIM_TRGO_OC4REF);' +
        ' /* ADC1 注入通道：A 相，硬件触发 TIM1_TRGO */' +
        ' LL_ADC_INJ_SetSequencerLength(ADC1, LL_ADC_INJ_SEQ_SCAN_DISABLE);' +
        ' LL_ADC_INJ_SetTrigger(ADC1, LL_ADC_INJ_TRIG_EXT_TIM1_TRGO);' +
        ' LL_ADC_INJ_SetTriggerEdge(ADC1, LL_ADC_INJ_TRIG_EXT_RISING);' +
        ' LL_ADC_INJ_SetSequencerRanks(ADC1, LL_ADC_INJ_RANK_1, IA_ADC_CHANNEL);' +
        ' /* ADC2 注入：B 相，双 ADC 同步模式让 A/B 同时采样 */' +
        ' LL_ADC_SetMultimode(ADC123_COMMON, LL_ADC_MULTI_DUAL_INJ_SIMULT);' +
        ' LL_ADC_INJ_SetSequencerRanks(ADC2, LL_ADC_INJ_RANK_1, IB_ADC_CHANNEL);' +
        ' LL_ADC_INJ_StartConversion(ADC1);' +
        ' /* FOC ISR (在 ADC1 注入 EOC 中断里) */' +
        ' void ADC1_2_IRQHandler(void) {' +
        '   if (LL_ADC_IsActiveFlag_JEOS(ADC1)) {' +
        '     int32_t ia_raw = LL_ADC_INJ_ReadConversionData12(ADC1, LL_ADC_INJ_RANK_1);' +
        '     int32_t ib_raw = LL_ADC_INJ_ReadConversionData12(ADC2, LL_ADC_INJ_RANK_1);' +
        '     float ia = (ia_raw - ia_offset) * I_SCALE;  /* 减零点 + 量纲换算 */' +
        '     float ib = (ib_raw - ib_offset) * I_SCALE;' +
        '     float ic = -ia - ib;  /* KCL 重构第三相 */' +
        '     foc_isr(ia, ib, ic);  /* Clarke → Park → PI → ... */' +
        '     LL_ADC_ClearFlag_JEOS(ADC1);' +
        '   }' +
        ' }' +
        ' 这套骨架做到了 ADC 触发 0 软件抖动、A/B 同时采样、KCL 重构第三相省一路 ADC、零点校准已在 ia_offset/ib_offset 里——压缩机变频器电流采样的工程模板。',
      whyMattersEn: 'STM32F3/G4 dual-ADC synchronous sampling skeleton (production code): TIM1 in center-aligned mode with CC4 generating the trigger at the PWM mid-point; TRGO = OC4REF; ADC1 injected channel set to A-phase, triggered by TIM1_TRGO rising edge, rank 1 = IA_ADC_CHANNEL; ADC2 in A/B dual-injected-simultaneous mode, rank 1 = IB_ADC_CHANNEL; in the ADC1_2_IRQHandler, on JEOS, read the raw codes, subtract the calibrated ia_offset/ib_offset, scale to amps, reconstruct ic = −ia − ib via KCL, then call foc_isr(ia, ib, ic). The skeleton achieves zero software jitter on the ADC trigger, simultaneous A/B sampling, KCL-based reconstruction to save one ADC, and pre-applied zero-offset calibration — the engineering template for current sampling in a compressor drive.',
    },
    {
      id: 'recap-to-clarke',
      title: '交棒 Clarke',
      goal: '把这个三相旋转矢量交给 Clarke 处理',
      goalEn: 'Hand the three-phase rotating vector off to Clarke.',
      action: '所有参数复位（不平衡=0、谐波=0、噪声=0、幅值=6、频率=50）。盯"αβ 静止坐标矢量"卡片。',
      observe: '右侧白点在 αβ 平面画标准圆，圆心在原点，α 轴方向 = A 相绕组方向、β 轴领先 90°。',
      observeEn: 'On the right, the white dot traces a clean circle in the αβ plane, centered at the origin, with the α axis aligned to the A-phase winding direction and the β axis leading by 90°.',
      whyMatters: '现在你看到的 abc → αβ 对应关系，下一模块 Clarke 把它写成矩阵。重点弄清：① 为什么是 1/√3（功率守恒推导）② I0 = 三相和 / 3 = 零序，平衡时 = 0、不平衡时反映硬件健康度 ③ 幅值不变 vs 功率不变两种形式怎么选（嵌入式选幅值不变，下游 Kp/Ki 直接套）。',
      whyMattersEn: 'The abc → αβ correspondence you see here is written as a matrix in the next module (Clarke). Be sure to nail down: (1) why the 1/√3 appears (power-conservation derivation); (2) I0 = sum/3 = zero sequence: 0 when balanced, a hardware-health indicator when not; (3) how to choose amplitude-invariant vs power-invariant (embedded picks amplitude-invariant so downstream Kp/Ki transfer directly).',
    },
  ],
  pitfalls: [
    {
      id: 'sample-at-edge',
      label: '试错：ADC 采样点放在 PWM 边沿（软件触发）',
      labelEn: 'Mis-step: ADC sample landed on the PWM edge (software trigger)',
      symptom: 'Ia/Ib 读数毛刺极大（噪声峰峰值 1 A+），FOC 电流环必须降带宽到 200 Hz 才不振荡',
      symptomEn: 'Ia/Ib readings carry huge glitches (peak-to-peak noise > 1 A); the FOC current loop must be detuned to 200 Hz bandwidth to avoid oscillation.',
      why: 'PWM 切换瞬间桥臂上下管交替导通，相电流 di/dt 达数 A/μs 量级，叠加 IGBT/MOS 切换共模噪声耦合进 ADC——读到的是"瞬态值 + 噪声"。修复：用 TIM1 中心对齐 + CC4 在 ARR 时触发 ADC 注入（PWM 中点 = 所有桥臂稳态 111 或 000、电流处于纹波谷）。软件触发禁止——10 行 C 代码的抖动就抹掉 FOC 一半带宽。',
      whyEn: 'At PWM switching the high/low switches alternate; phase current di/dt reaches several A/μs, and IGBT/MOSFET switching common-mode noise couples into the ADC — you read "transient + noise". Fix: TIM1 center-aligned + CC4 triggering the ADC injection at ARR (PWM mid-point — all bridge legs in steady 111 or 000, current at the ripple valley). Software triggers are forbidden — even the jitter from 10 lines of C will halve the FOC bandwidth.',
    },
    {
      id: 'no-adc-offset-cal',
      label: '试错：跳过 ADC 零点校准就上电',
      labelEn: 'Mis-step: boot without ADC zero-offset calibration',
      symptom: '电机不通电时已经报"过流预警"或 KCL 残差 > 0.5 A；FOC 启动后 αβ 圆心偏离原点',
      symptomEn: 'With the motor de-energized you already see an "overcurrent warning" or KCL residual > 0.5 A; once FOC starts, the αβ circle is off-center.',
      why: 'ADC 输出对应零电流时通常不是码值 0 而是中点（2048 for 12bit）—— 留给双向电流测量。若上电时不先记录这个偏置在每次采样减掉，所有相电流读数都带 DC 偏移 → KCL 残差非零 → Park 投影把这个偏移旋进 dq 域变成 2 倍电频率纹波 → 转矩可听见嗡声。修复：boot 阶段电机不通电时连续采 1024 次取平均当零点存 ia_offset/ib_offset；每次冷启动重做（运放温飘 24h 量级）。',
      whyEn: 'At zero current the ADC code is not 0 but the mid-point (2048 on 12-bit) — left for bidirectional measurement. Without recording this offset at boot and subtracting it from every sample, all phase-current readings carry a DC offset → KCL residual non-zero → Park rotates the offset into the dq domain as a 2× electrical-frequency ripple → audible torque hum. Fix: at boot with the motor de-energized, sample 1024 times, average, store as ia_offset/ib_offset; redo at every cold start (op-amp drift is on the 24 h scale).',
    },
    {
      id: 'lpf-killing-bandwidth',
      label: '试错：靠数字低通滤波掩盖采样噪声',
      labelEn: 'Mis-step: use a digital low-pass filter to mask sampling noise',
      symptom: '波形看起来干净了，但电流环阶跃响应明显变慢、高速段振荡，温度上来后更不稳',
      symptomEn: 'Waveforms look clean, but the current-loop step response is visibly slower, the high-speed region oscillates, and stability worsens with temperature.',
      why: '滤波器引入的相位滞后让 Park 看见"1 ms 前的电流"——电流环算出 Vd/Vq 响应的是"过去的状态"。带宽掉一半，性能跟着崩。正确做法：噪声从源头杀（采样点对准 PWM 中点 + 运放接地走线优化 + 屏蔽差分线），不要靠软件抹平。LPF 截止频率必须 ≥ 10×电流环带宽（典型 ≥ 20 kHz），否则就是在自欺欺人。',
      whyEn: 'The filter\'s phase lag makes Park see "the current from 1 ms ago" — the Vd/Vq the current loop computes responds to a "past state". Bandwidth halves and performance collapses. The right answer is to kill noise at the source (sample point at PWM mid-point + op-amp ground routing + shielded differential lines), not to mask it in software. An LPF cut-off must be ≥ 10× the current-loop bandwidth (typically ≥ 20 kHz) or you are deceiving yourself.',
    },
    {
      id: 'two-adc-on-delta',
      label: '试错：三角形连接电机用两路 ADC 重构 Ic = −Ia−Ib',
      labelEn: 'Mis-step: reconstruct Ic = −Ia − Ib with two ADCs on a delta-connected motor',
      symptom: 'FOC 整体行为诡异：低速时似乎能转，高速时电流环失稳；KCL 残差为 0 但电机表现明显不对',
      symptomEn: 'FOC behavior is bizarre overall: it seems to turn at low speed but the current loop destabilizes at high speed; KCL residual is 0 yet motor behavior is clearly wrong.',
      why: '三角形接法里"线电流"≠"相电流"——线电流和 = 0（KCL 在外节点），但绕组内部相电流可以有环流（三相不一定满足和 = 0）。两路 ADC 测的是线电流，重构 Ic 也是线电流，FOC 期望的是磁动势对应的相电流——不一致。必须三路独立采样。压缩机里偶遇三角形接法（少见但有）就要全部走 3 路 ADC + DMA。',
      whyEn: 'In a delta connection, "line current" ≠ "phase current" — line currents sum to 0 (KCL at external nodes), but internal winding phase currents can carry circulating components (the three phases need not sum to 0). Two ADCs measure line currents, the reconstructed Ic is also a line current, but FOC expects the phase current producing MMF — mismatch. You must use three independent ADCs. The (rare but real) delta-connected compressor must run 3-channel ADC + DMA throughout.',
    },
  ],
  nextModuleHook: '现在你"看见"了旋转磁场、知道 KCL 是免费听诊器、能写 ADC 双通道同步采样的 STM32 配置。下一模块（03 Clarke）把这些直觉写成矩阵——讲清楚为什么是 1/√3、I0 为什么可以丢、幅值不变 vs 功率不变怎么选不混。',
  nextModuleHookEn: 'You can now "see" the rotating field, know KCL is a free stethoscope, and can write the STM32 configuration for dual-ADC synchronous sampling. Module 03 (Clarke) turns these intuitions into a matrix — clarifying why the 1/√3 appears, why I0 can be dropped, and how to choose between amplitude-invariant and power-invariant forms without confusion.',
};
