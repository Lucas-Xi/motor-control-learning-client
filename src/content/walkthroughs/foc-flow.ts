import type { ModuleWalkthrough } from './types';

export const focFlowWalkthrough: ModuleWalkthrough = {
  moduleId: 'foc-flow',
  bigPicture: 'FOC = 每个 PWM 周期跑一遍的 7 段纯函数流水线；时序预算 + 解析整定 + 解耦前馈三件事不掉链，电机调试就只剩选参数。',
  bigPictureEn: 'FOC = a 7-stage pure-function pipeline executed once per PWM cycle; if timing budget, analytic tuning, and decoupling feed-forward all hold, motor commissioning reduces to parameter selection.',
  successCriteria: [
    '能背出每个 PWM 周期里依次发生的 7 件事（ADC 注入采样 → Clarke → Park → PI → 反 Park → SVPWM → 写 CCR）',
    '能解释为什么 PI 要放在 dq 域而不是 abc 域（直流量 vs 交流量，零稳态误差）',
    '能定位电流环 4 类典型故障：振荡（Kp/延迟）、Id-Iq 串扰（Δθ）、高速发软（缺解耦）、撞限不收（抗饱和）',
    '能判断哪些代码必须放在 ADC ISR 里、哪些必须放到 1 kHz 低频任务里（按时间预算 < 10 μs）',
    '理解 ADC 注入触发点必须放在 PWM 中点的硬件原因（电流处于纹波谷 + 桥臂稳态 000/111）',
    '能用 Kp = ω_bw·L、Ki = ω_bw·R 算出 PI 起点，并解释为什么实测取 0.5-0.7 倍解析值',
    '理解 ADC 采样 + CCR 预装载产生的 1.5 个 PWM 周期延迟为什么把电流环带宽锁死在 PWM/10~PWM/8',
  ],
  successCriteriaEn: [
    'Recite the 7 stages in order per PWM cycle: ADC injection → Clarke → Park → PI → inverse Park → SVPWM → write CCR.',
    'Explain why PI lives in the dq domain rather than abc (DC vs AC, zero steady-state error).',
    'Diagnose four typical current-loop faults: oscillation (Kp / delay), Id-Iq crosstalk (Δθ), high-speed weakness (no decoupling), saturation hangs (no anti-windup).',
    'Decide which code goes in the ADC ISR vs the 1 kHz slow task (time budget < 10 μs).',
    'Understand the hardware reason ADC injection triggers must sit at the PWM mid-point (current at ripple valley + bridge in 000/111 steady state).',
    'Use Kp = ω_bw·L, Ki = ω_bw·R to get the PI starting point and explain why measured values are 0.5–0.7× the analytic value.',
    'Understand why the 1.5 PWM-period delay from ADC sampling + CCR preload caps current-loop bandwidth at PWM/10 to PWM/8.',
  ],
  steps: [
    {
      id: 'pipeline-map',
      title: '看流水线',
      goal: '建立"7 段流水线"的整体心智模型',
      goalEn: 'Build the overall mental model of the 7-stage pipeline.',
      action: '点击顶部"数据流水线"标签，看 7 个步骤节点：ADC 注入采样 → Clarke → Park → 电流 PI（带解耦） → 反 Park → SVPWM → 写 CCR。点中任一节点可锁定探针看输入/输出。',
      observe: '每个节点上方是该步骤的精确公式，下方是工程意义；点节点后右侧探针显示该段的实时输入/输出数值。',
      observeEn: 'Above each node is the exact formula; below is the engineering meaning. Clicking a node shows the live input/output values in the probe panel on the right.',
      whyMatters: '工业 FOC 调试的第一原则就是"按段冻结"——先 ADC 校零、再 Clarke、再 Park、再电流环。把每段看成独立的纯函数，错了就知道在哪段；如果整段往里塞业务逻辑，调试时只能靠运气。这种"流水线 + 探针"心智模型也直接决定了你怎么组织代码：foc_step() 主函数顺序调 7 个 static inline，每个函数纯输入输出 + 无副作用 + 可单元测试，是嵌入式 FOC 代码组织的事实标准。',
      whyMattersEn: 'The first principle of industrial FOC bring-up is "freeze per stage": ADC zero first, then Clarke, then Park, then current loop. Treat each stage as a pure function and you know exactly where a bug is; pack business logic into a single blob and debugging becomes luck. This pipeline + probe mental model also dictates code organization: foc_step() calls 7 static inline functions in order, each pure I/O with no side effects and unit-testable — the de-facto standard for embedded FOC code.',
    },
    {
      id: 'interrupt-budget',
      title: '中断时序预算',
      goal: '理解 PWM 16 kHz 下 62.5 μs ISR 里能做什么不能做什么',
      goalEn: 'Understand what can and cannot fit in a 62.5 μs ISR at 16 kHz PWM.',
      action: '回顾 Cortex-M4F + FPU 上一次完整 FOC 流水线的时序：ADC 读取 ~0.3 μs + Clarke ~0.2 μs + Park (含 CORDIC sin/cos) ~0.5 μs + 2 个 PI + 解耦 ~1.0 μs + 反 Park ~0.5 μs + SVPWM ~1.0 μs + 写 CCR ~0.2 μs + 杂项 ~1.5 μs = 约 5-6 μs，CPU 占用 < 10%。',
      observe: '剩下 56+ μs 给低频任务（速度环、位置环、通信、SMO、HFI 解调）按抢占优先级排队跑。',
      observeEn: 'The remaining 56+ μs is for the slow tasks (speed loop, position loop, comms, SMO, HFI demodulation) scheduled by preemption priority.',
      whyMatters: '中断里**只放快环**（电流环 + SVPWM + 必要观测器更新）。printf / HAL_Delay / 浮点除法 / malloc / 任何 OS 调用都禁止——一次超时就 PWM 错节拍，桥臂时序错乱可能直通烧管子。速度环 / 位置环 / 通信 / 日志全部进 1 kHz 低频任务（TIM6 中断或 RTOS task）。STM32 上典型 NVIC 优先级：ADC 注入 (0) > TIM1 BRK 刹车 (1) > TIM6 1 kHz (5) > CAN / UART (8+) > 主循环 (15)。',
      whyMattersEn: 'The ISR runs the fast loop only (current loop + SVPWM + essential observer updates). Forbidden: printf, HAL_Delay, floating divide, malloc, any OS call — one timeout misses a PWM cycle and bridge timing corruption can cause shoot-through. Speed loop, position loop, comms, logs all go in the 1 kHz slow task (TIM6 or RTOS task). Typical STM32 NVIC priorities: ADC injection (0) > TIM1 BRK brake (1) > TIM6 1 kHz (5) > CAN/UART (8+) > main loop (15).',
      quiz: {
        q: '在 16 kHz PWM 中断里调用 HAL_Delay(1) 会发生什么？',
        options: [
          '什么都不会发生',
          '中断耗时 1 ms 远超 62.5 μs 周期，下一次 PWM 中断错过，桥臂时序错乱，可能桥臂直通',
          '只是稍微慢一点',
          'STM32 自动跳过',
        ],
        correct: 1,
        hint: 'HAL_Delay 内部是 SysTick 阻塞循环，最小粒度 1 ms。在 62.5 μs 周期里 delay 1 ms 等于错过 16 个 PWM 周期——硬件上是灾难。中断里禁止任何阻塞调用，调试时要看 ISR 当前周期写 GPIO 翻转 + 示波器实测耗时，不能靠 printf。',
        qEn: 'Calling HAL_Delay(1) inside a 16 kHz PWM ISR — what happens?',
        optionsEn: [
          'Nothing happens',
          'The ISR runs for 1 ms, far longer than the 62.5 μs period, missing the next PWM interrupt, scrambling bridge timing, and possibly causing shoot-through',
          'Just a small slowdown',
          'STM32 automatically skips it',
        ],
        hintEn: 'HAL_Delay is a SysTick-based blocking loop with 1 ms minimum granularity. Delaying 1 ms inside a 62.5 μs period misses 16 PWM cycles — a hardware disaster. No blocking calls in the ISR; toggle a GPIO at entry/exit and measure on the scope, do not rely on printf.',
      },
    },
    {
      id: 'sample-timing',
      title: 'ADC 注入锁中点',
      goal: '理解 JSQR + JEXTSEL = TIM1_TRGO 把 ADC 触发钉在 PWM 中点的硬件做法',
      goalEn: 'Understand how JSQR + JEXTSEL = TIM1_TRGO pins the ADC trigger to the PWM mid-point.',
      action: '切回"电流环响应"标签。把"采样延迟"从 0 拉到 4 个周期，观察 Iq 阶跃响应的变化。',
      observe: '采样延迟越大，相同 Kp 下振荡越明显；延迟 4 周期时几乎无法稳定，Iq 阶跃直接发散。',
      observeEn: 'Greater sampling delay produces more obvious oscillation at the same Kp; at 4-period delay the loop barely stays stable and Iq step response diverges.',
      whyMatters: '硬件上 ADC 注入触发由 TIM1 中心对齐计数器达到 ARR 时的 update 事件（TRGO）产生；那一刻所有桥臂上下管都处于稳定状态（要么 000 要么 111），电流处于"纹波谷"，采样误差最小。如果采样点放在开关边沿附近，电流正在剧烈跳变，ADC 读到的是含噪声的瞬态值，等效相位延迟 → 电流环必须降带宽。STM32 G4 上 JSQR 配置最小骨架：' +
        ' /* TIM1 中心对齐 + ARR 自动触发 ADC 注入 */' +
        ' LL_TIM_SetCounterMode(TIM1, LL_TIM_COUNTERMODE_CENTER_UP_DOWN);' +
        ' LL_TIM_SetTriggerOutput(TIM1, LL_TIM_TRGO_UPDATE);  /* TRGO=update */' +
        ' /* ADC1 注入序列锁 TIM1 TRGO 触发 */' +
        ' LL_ADC_INJ_SetTriggerSource(ADC1, LL_ADC_INJ_TRIG_EXT_TIM1_TRGO);' +
        ' LL_ADC_INJ_SetTrigAuto(ADC1, LL_ADC_INJ_TRIG_INDEPENDENT);' +
        ' LL_ADC_INJ_SetSequencerLength(ADC1, LL_ADC_INJ_SEQ_SCAN_ENABLE_3RANKS);' +
        ' /* JEOS 中断里执行整条 FOC 流水线，关 update 中断避免双触发 */' +
        ' LL_TIM_DisableIT_UPDATE(TIM1);' +
        ' LL_ADC_EnableIT_JEOS(ADC1);' +
        ' 这样 ADC 转换完一组 (Ia, Ib, Ic) 触发 JEOS 中断，HAL_ADC_InjectedConvCpltCallback() 里跑 FOC，整个时序由硬件保证锁在 PWM 中点 ±100 ns。',
      whyMattersEn: 'In hardware, the ADC injection trigger fires on TIM1 center-aligned counter reaching ARR (update event, TRGO); at that instant all bridge legs are in steady state (either 000 or 111), the current is at the "ripple valley", and sampling error is minimum. If the sample lands near a switching edge, the current is changing violently and the ADC reads a noisy transient → equivalent phase lag → the current loop must be detuned. STM32 G4 JSQR minimum skeleton: TIM1 in center-aligned mode with TRGO = update; ADC1 injected trigger set to TIM1_TRGO with independent injection mode and 3-rank scan; disable the TIM1 update interrupt to avoid double triggering and enable the JEOS interrupt. The ADC then converts one set of (Ia, Ib, Ic), triggers JEOS, and HAL_ADC_InjectedConvCpltCallback() runs FOC — the entire timing is hardware-locked to the PWM mid-point within ±100 ns.',
    },
    {
      id: 'angle-error',
      title: '角度误差 Δθ → Id 串扰',
      goal: '看清 Δθ 怎么把 Iq 漏到 Id（产线编码器零位诊断的核心信号）',
      goalEn: 'See how Δθ leaks Iq into Id (the core signal for production-line encoder-zero diagnosis).',
      action: '保持 Iq 阶跃 = 5 A、Id 指令 = 0 A、Δθ = 0。运行后把"角度误差 Δθ"从 0 慢慢拉到 +15°。',
      observe: 'Iq 阶跃时 Id（蓝线）会被拉起来一个峰值；稳态时 Id 不再是 0 而是约 1.3 A。Iq 也达不到 5 A，实际值约 4.8 A。',
      observeEn: 'On the Iq step, Id (blue) gets pulled up to a peak; at steady state Id is no longer 0 but ≈ 1.3 A. Iq also fails to reach 5 A, settling near 4.8 A.',
      whyMatters: '这就是著名的"dq 串扰"。Park 投影 Id = cos(θ+Δθ)·Iα + sin(θ+Δθ)·Iβ 中的 Δθ 让一部分 Iq 投到了 Id 轴上：Id_actual ≈ Iq*·sin(Δθ)、Iq_actual ≈ Iq*·cos(Δθ)。15° 时 sin(15°)·5 = 1.3 A → Id 漏；cos(15°)·5 = 4.83 → Iq 损失 3%。产线诊断口诀："Iq 阶跃 Id 翘 → 编码器零位错"，反算 Δθ ≈ atan(Id/Iq)。修复 = 重做对齐流程（上电低压注 Id_align 把转子拉到 d 轴零位 + 标定 Z_OFFSET 写 Flash），不是改 PI 参数！',
      whyMattersEn: 'The famous "dq crosstalk". In Park Id = cos(θ + Δθ)·Iα + sin(θ + Δθ)·Iβ, Δθ projects part of Iq onto the Id axis: Id_actual ≈ Iq*·sin(Δθ), Iq_actual ≈ Iq*·cos(Δθ). At 15°, sin(15°)·5 = 1.3 A leaks into Id; cos(15°)·5 = 4.83 loses 3% on Iq. Production rule: "Iq step pulls Id → encoder zero is off", and Δθ ≈ atan(Id/Iq). Fix = re-run alignment (low-voltage Id_align to drag the rotor to d-axis zero + calibrate Z_OFFSET to Flash), not tune the PI!',
      quiz: {
        q: '现场调 FOC 发现 Iq 命令 5 A 但实测 Id ≈ 1.3 A、Iq ≈ 4.8 A，最优先该查什么？',
        options: [
          '电流环 Kp 太小',
          '编码器零位 / Park 角度偏移，先做对齐流程；改 PI 是按错了药方',
          'ADC 采样点',
          'PWM 频率太低',
        ],
        correct: 1,
        hint: 'Id 不为 0 是 Park 投影出错的几何后果，与 PI 增益无关。Δθ ≈ atan(Id/Iq) = atan(1.3/4.8) ≈ 15° 是典型的编码器零位偏移量级。如果去改 Kp，你会发现 Id 仍漏 1.3 A——因为 PI 控不了几何偏角。',
        qEn: 'In the field FOC commands Iq = 5 A but measures Id ≈ 1.3 A, Iq ≈ 4.8 A. What is the top-priority check?',
        optionsEn: [
          'Current-loop Kp too small',
          'Encoder zero / Park angle offset — re-run alignment first; tuning PI is the wrong prescription',
          'ADC sampling point',
          'PWM frequency too low',
        ],
        hintEn: 'Non-zero Id is the geometric consequence of a Park projection error, independent of PI gain. Δθ ≈ atan(Id/Iq) = atan(1.3/4.8) ≈ 15° is a typical encoder-zero offset. Tuning Kp leaves Id leaking 1.3 A — the PI cannot correct a geometric angle offset.',
      },
    },
    {
      id: 'cross-coupling',
      title: '高速 dq 解耦前馈',
      goal: '理解高速下 vd / vq 之间的交叉耦合项 + 解耦前馈的 C 实现',
      goalEn: 'Understand high-speed vd/vq cross-coupling and the C implementation of decoupling feed-forward.',
      action: '把"电频率 ω"从 0 拉到 400 Hz（接近压缩机额定）。给 Iq 阶跃 5 A，观察 Iq 上升过程。',
      observe: 'ω = 0 时 Iq 干净上升；ω = 400 Hz 时 Iq 上升过程带"晃动"或下垂，Id 也跟着波动。开解耦前馈后两者都恢复干净阶跃。',
      observeEn: 'At ω = 0 the Iq rise is clean; at 400 Hz the Iq rise carries "wobble" or sag, and Id wavers too. With decoupling feed-forward enabled, both recover clean step responses.',
      whyMatters: 'PMSM dq 模型有交叉项：vd = R·id + Ld·did/dt − ω·Lq·iq；vq = R·iq + Lq·diq/dt + ω·(Ld·id + ψf)。速度越高 ω·L·i 越大（压缩机 6000 rpm × 6 极对 = ωe = 3770 rad/s，Lq = 2 mH、iq = 8 A → ω·Lq·iq = 60 V，已经占母线一大半），PI 输出要先"对抗"这一项才能控住电流。工业方案是加**解耦前馈**：' +
        ' /* 在 PI 输出后直接叠加交叉耦合补偿，让 PI 只对建模残差负责 */' +
        ' /* 输入: id_meas, iq_meas, omega_e, motor params */' +
        ' float vd_pi = pi_update(&pi_d, id_ref, id_meas);' +
        ' float vq_pi = pi_update(&pi_q, iq_ref, iq_meas);' +
        ' float vd_ff = -omega_e * Lq * iq_meas;                     /* d 轴前馈：−ω·Lq·iq */' +
        ' float vq_ff = omega_e * (Ld * id_meas + psi_f);            /* q 轴前馈：ω·(Ld·id + ψf) */' +
        ' float vd_cmd = vd_pi + vd_ff;' +
        ' float vq_cmd = vq_pi + vq_ff;' +
        ' /* 电压限幅圆 √(vd²+vq²) ≤ Udc/√3 （SVPWM 线性区上限） */' +
        ' float vmax = udc * ONE_OVER_SQRT3;  /* 0.5773·Udc */' +
        ' float vmag = sqrtf(vd_cmd*vd_cmd + vq_cmd*vq_cmd);' +
        ' if (vmag > vmax) { vd_cmd *= vmax/vmag; vq_cmd *= vmax/vmag; }' +
        ' 实际效果：开了前馈电流环带宽不变，但稳态跟踪误差从 ±5% 压到 ±0.5%，高速段动态响应回到低速水平。空调压缩机 6000 rpm + 高极对数场景必加；EV 主驱 18000 rpm 不加 100% 失控。',
      whyMattersEn: 'The PMSM dq model has cross terms: vd = R·id + Ld·did/dt − ω·Lq·iq; vq = R·iq + Lq·diq/dt + ω·(Ld·id + ψf). At higher speed ω·L·i grows (compressor 6000 rpm × 6 pole pairs → ωe = 3770 rad/s; Lq = 2 mH, iq = 8 A → ω·Lq·iq = 60 V, already eating most of the bus); the PI must first fight this term to regulate current. The industrial answer is decoupling feed-forward: compute the PI outputs vd_pi/vq_pi, then add vd_ff = −ω·Lq·iq_meas and vq_ff = ω·(Ld·id_meas + ψf), sum to vd_cmd/vq_cmd, and apply the voltage-limit circle √(vd² + vq²) ≤ Udc/√3 (SVPWM linear-region limit). With feed-forward enabled, current-loop bandwidth is unchanged but steady-state tracking error drops from ±5% to ±0.5%, and high-speed dynamic response returns to low-speed quality. Mandatory on 6000 rpm + high-pole-pair HVAC compressors; an EV traction motor at 18000 rpm without it is 100% unstable.',
    },
    {
      id: 'pi-tuning',
      title: '解析整定电流环',
      goal: '用 ω_bw = Kp/L、Ki/Kp = R/L 两条公式判断 PI 是否合理',
      goalEn: 'Use ω_bw = Kp/L and Ki/Kp = R/L to judge whether the PI is reasonable.',
      action: '当前电机参数 Rs ≈ 0.2 Ω、Ld ≈ 1 mH。目标电流环带宽 1 kHz。算一下 Kp = ω_bw·L = 2π·1000·0.001 ≈ 6.28，Ki = ω_bw·R = 2π·1000·0.2 ≈ 1257。先把 Kp 拉到 4（解析值 × 0.65 留相位裕度）、Ki 拉到 800。',
      observe: 'Iq 阶跃约 1.5 ms 内进入 5% 误差带，几乎无超调；这是带宽 1 kHz 的典型表现（取 0.65 倍解析值后实际带宽约 650 Hz）。',
      observeEn: 'Iq enters the 5% band within about 1.5 ms with near-zero overshoot — typical of 1 kHz design bandwidth (at 0.65× analytic, real bandwidth ≈ 650 Hz).',
      whyMatters: 'Ki/Kp = R/L 让 PI 零点抵消电机电气极点 R/L，剩下纯一阶系统，闭环带宽就是 Kp/L。这是电机控制最重要的一条解析整定公式——比试错调参快 10 倍。**但要乘 0.5-0.7 折扣**：① ADC 注入在 PWM 中点 + CCR 下周期生效，总采样-计算-生效延迟 ~1.5 个 PWM 周期；② ADC 抗混叠滤波（典型 10 kHz RC）再吃一点相位；③ 电流采样滤波（典型 1 阶 5 kHz LPF）。这些延迟综合给电流环吃掉约 30-50° 相位裕度，所以实际 Kp 取解析值 × 0.65 才稳。',
      whyMattersEn: 'Ki/Kp = R/L lets the PI zero cancel the motor electrical pole R/L, leaving a pure first-order plant with closed-loop bandwidth = Kp/L. This is the most important analytic tuning formula in motor control — 10× faster than trial-and-error. **But multiply by 0.5–0.7**: (1) ADC injection at PWM mid-point + CCR preload gives ~1.5 PWM-period sample-to-actuation delay; (2) ADC anti-aliasing filter (typical 10 kHz RC) eats more phase; (3) current-sample filter (typical 1st-order 5 kHz LPF). Combined these eat 30–50° of phase margin, so real-world Kp = 0.65× analytic for stability.',
      quiz: {
        q: '想要电流环带宽 2 kHz，电机 L = 0.5 mH、R = 0.1 Ω，Kp 解析值应取多少（不考虑相位折扣）？',
        options: ['Kp = 6.3', 'Kp ≈ 2π × 2000 × 0.0005 ≈ 6.28', 'Kp = 100', 'Kp = 0.5'],
        correct: 1,
        hint: 'Kp = ω_bw × L = 2π × 2000 × 0.0005 ≈ 6.28。低电感电机要小 Kp，高电感要大 Kp——和直觉相反，因为带宽 = Kp/L。注意实测要再 × 0.65 ≈ 4.1 留相位裕度。',
        qEn: 'For a 2 kHz current-loop bandwidth on a motor with L = 0.5 mH, R = 0.1 Ω, what is the analytic Kp (ignoring the phase-margin discount)?',
        optionsEn: ['Kp = 6.3', 'Kp ≈ 2π × 2000 × 0.0005 ≈ 6.28', 'Kp = 100', 'Kp = 0.5'],
        hintEn: 'Kp = ω_bw × L = 2π × 2000 × 0.0005 ≈ 6.28. Low-inductance motors take small Kp; high-inductance take large Kp — counter-intuitive, because bandwidth = Kp/L. In practice multiply by 0.65 ≈ 4.1 for phase margin.',
      },
    },
    {
      id: 'voltage-saturation',
      title: '电压限幅 + 抗饱和',
      goal: '理解电压限幅圆 √(vd²+vq²) ≤ Udc/√3 与 PI 抗饱和的协作',
      goalEn: 'Understand how the voltage-limit circle √(vd² + vq²) ≤ Udc/√3 cooperates with PI anti-windup.',
      action: '把"电压限幅"从 240 V 拉到 80 V，Iq 阶跃 = 10 A，运行。先关抗饱和看现象，再开抗饱和。',
      observe: 'Iq 无法跟到 10 A，稳态卡在 4-5 A；不开抗饱和时 PI 积分项会一直涨；开了抗饱和后积分被 Back-Calc 反推，撞限解除后无大超调。',
      observeEn: 'Iq cannot reach 10 A and saturates at 4–5 A; with anti-windup off the PI integrator climbs unboundedly; with anti-windup on, Back-Calc unwinds the integrator and there is no large overshoot when saturation releases.',
      whyMatters: 'SVPWM 线性区上限是 Udc/√3 ≈ 0.577·Udc。310 V 母线对应约 179 V 线性区。当 PI 输出 √(vd²+vq²) > 这个值，硬件就只能输出 179 V，电流跟不上指令。两种应对：① **抗积分饱和**（PI 输出撞限时用 Back-Calc 反推积分，Kt = ki/kp，模块 05 详讲）；② **给 Id 注负值进入弱磁**——通过削弱等效 ψf 让 ω·ψf 项变小，腾出电压余量给 Iq——这是下一模块 11 弱磁的核心。两者协作：先靠抗饱和让控制不发散，再靠弱磁让转速能上去。空调压缩机加速到 5000 rpm 以上必须两者都开。',
      whyMattersEn: 'The SVPWM linear-region limit is Udc/√3 ≈ 0.577·Udc. A 310 V bus gives ~179 V linear region. When PI outputs √(vd² + vq²) > this limit, hardware only outputs 179 V and current cannot follow the command. Two remedies: (1) anti-windup (PI Back-Calc unwinds the integrator at saturation, Kt = ki/kp — see Module 05); (2) inject negative Id to enter field weakening — reducing effective ψf shrinks the ω·ψf term and frees voltage headroom for Iq — the core of Module 11. They cooperate: anti-windup keeps control from diverging, field weakening lifts speed. An HVAC compressor above 5000 rpm must enable both.',
    },
    {
      id: 'recap',
      title: '回到硬件视角',
      goal: '把 FOC 流水线接回 STM32 寄存器层面看总延迟',
      goalEn: 'Wire the FOC pipeline back to the STM32 register level and inspect total delay.',
      action: '回顾：一个完整的 PWM 中断里，ADC 触发在哪个时刻？写 CCR 后什么时候生效？',
      observe: '答：ADC 在 TIM1 计数到 ARR（PWM 中点 t=0）注入触发；ADC 转换 ~1 μs 完成进 JEOS ISR 跑 FOC ~5 μs；ISR 退出后下一次 update 事件（t=Ts/2 = 31 μs）才把 CCR 装到比较器；CCR 影响 PWM 占空比从下一周期开始（t=Ts = 62.5 μs）→ 电流环天然带约 1.5 个 PWM 周期的总延迟（采样到生效）。',
      observeEn: 'Answer: ADC injects on TIM1 counting to ARR (PWM mid-point t = 0); ADC conversion finishes in ~1 μs entering JEOS ISR running FOC in ~5 μs; the next update event (t = Ts/2 = 31 μs) latches CCR into the comparator; CCR changes affect PWM duty starting the next period (t = Ts = 62.5 μs) → the current loop carries an intrinsic 1.5 PWM-period total delay from sampling to actuation.',
      whyMatters: '理解这一个半周期的延迟是 FOC 稳定性的关键：电流环带宽不能超过 1/(2π × 总延迟·1.5)。16 kHz PWM 总延迟 ~95 μs → 理论上限 ~1.7 kHz，实际工程 1-1.5 kHz 是稳态甜区。要再升带宽只能：① 提 PWM 到 20-32 kHz（SiC/GaN）；② 用 DMA + ADC 双缓冲让 ISR 进入更早；③ 取消 CCR 预装载（但要小心 PWM 边沿撞了导致输出毛刺）。压缩机典型选 16 kHz + 1 kHz 电流环 + 100 Hz 速度环 + 10 Hz 位置环，是工程上最稳的层叠。',
      whyMattersEn: 'Understanding this 1.5-period delay is the key to FOC stability: current-loop bandwidth ≤ 1/(2π · total delay · 1.5). At 16 kHz PWM total delay ~95 μs → theoretical limit ~1.7 kHz; in practice 1–1.5 kHz is the sweet spot. To push higher: (1) raise PWM to 20–32 kHz (SiC/GaN); (2) DMA + ADC double-buffering for earlier ISR entry; (3) drop CCR preload (with care about edge collisions and output glitches). A compressor typically uses 16 kHz + 1 kHz current loop + 100 Hz speed + 10 Hz position — the most robust cascade in practice.',
      quiz: {
        q: 'PWM 16 kHz、ADC 注入在 PWM 中点触发，电流环写 CCR 后实际生效时间是？',
        options: [
          '立即生效',
          '下一个 PWM 周期开始时生效（约 62.5 μs 后），总延迟约 1.5 个 PWM 周期',
          '下一个采样点',
          '永远滞后 1 ms',
        ],
        correct: 1,
        hint: 'TIM1 的 CCR 寄存器有预装载（preload）功能，写入后等到下一次 update 事件（PWM 周期末）才装载到比较器。这一周期延迟必须放进电流环的延迟预算里——加上采样到 ISR 退出的半个周期，总延迟约 1.5 Ts。这是为什么 16 kHz PWM 的实际工程上限是 1-1.5 kHz 电流环带宽。',
        qEn: 'PWM 16 kHz, ADC injection at the PWM mid-point. When does a CCR write actually take effect?',
        optionsEn: [
          'Immediately',
          'At the start of the next PWM period (about 62.5 μs later), total delay about 1.5 PWM periods',
          'At the next sample',
          'Always 1 ms behind',
        ],
        hintEn: 'TIM1\'s CCR has preload: a write latches into the comparator only at the next update event (end of the PWM period). This one-period delay must be in the current-loop delay budget — plus the half period from sampling to ISR exit gives total ≈ 1.5 Ts. That is why 16 kHz PWM caps the practical current-loop bandwidth at 1–1.5 kHz.',
      },
    },
  ],
  pitfalls: [
    {
      id: 'printf-in-isr',
      label: '试错：中断里加 printf 调试',
      labelEn: 'Mis-step: add printf for debugging inside the ISR',
      symptom: 'PWM 输出错节拍、电机异响或母线电压报警；示波器看 PWM 周期偶尔扩大到 100+ μs',
      symptomEn: 'PWM falls out of sync, motor noises or DC-link alarms appear; a scope shows the PWM period occasionally expanding to 100+ μs.',
      why: 'printf 走 USART/SWO，单字符 ~10 μs，单次调用 100 μs+，远超 PWM 周期 62.5 μs。下一次中断到来时上一次还没退出，中断嵌套或丢失，桥臂时序乱套。生产代码 ISR 里只允许：寄存器读写、纯算术、限幅。要看 ISR 当前状态用 SEGGER RTT 或 ITM trace（不阻塞），或者写 DMA 缓冲事后回放；调试时还可以在 ISR 入口 / 出口翻转 GPIO，用示波器实测 ISR 耗时，超过 60% 周期就必须优化。',
      whyEn: 'printf over USART/SWO is ~10 μs per character, 100+ μs per call — far above the 62.5 μs PWM period. The previous ISR is still running when the next interrupt arrives, causing nesting or losses, scrambling bridge timing. Production ISRs allow only register reads/writes, pure arithmetic, and saturation. Inspect ISR state via SEGGER RTT or ITM trace (non-blocking), or write to a DMA buffer for offline replay; toggle a GPIO at ISR entry/exit and measure on the scope — anything above 60% of the period must be optimized.',
    },
    {
      id: 'sample-at-edge',
      label: '试错：ADC 采样点放在 PWM 边沿',
      labelEn: 'Mis-step: ADC sample at the PWM edge',
      symptom: 'Ia/Ib 噪声极大，电流环必须降到 200 Hz 带宽才不振荡；THD 显著高于设计值',
      symptomEn: 'Ia/Ib noise is huge, the current loop must drop to 200 Hz bandwidth to avoid oscillation; THD far exceeds design.',
      why: '开关边沿瞬间桥臂在切换，电流正经历 di/dt 最大的瞬态，外加 IGBT/MOS 切换噪声耦合进 ADC。读到的是"瞬态值 + 共模噪声"，等效引入大相位延迟。修复 = 用 TIM1 update 事件（PWM 中点）触发 ADC 注入，让采样窗对齐"开关稳态期"。如果采用边沿对齐 PWM（非中心对齐），还要专门加 ADC 触发延迟把采样推到稳态段。STM32 上 LL_ADC_REG_SetTriggerSource(ADC1, LL_ADC_REG_TRIG_EXT_TIM1_TRGO) + TIM1 CCR4 配合可以更灵活地选采样点。',
      whyEn: 'At a switching edge the bridge legs are transitioning, the current is at peak di/dt, and IGBT/MOSFET switching noise couples into the ADC. You read "transient + common-mode noise", equivalent to a large phase lag. Fix: use TIM1 update event (PWM mid-point) as the ADC injection trigger so the sampling window aligns with the switching-steady region. For edge-aligned PWM (non-center) add an ADC trigger delay to push sampling into the steady region. On STM32, LL_ADC_REG_SetTriggerSource(ADC1, LL_ADC_REG_TRIG_EXT_TIM1_TRGO) plus TIM1 CCR4 give more flexible sample-point selection.',
    },
    {
      id: 'wrong-pole-pairs',
      label: '试错：极对数从 4 改成 8 不重新校准',
      labelEn: 'Mis-step: change pole pairs from 4 to 8 without recalibrating',
      symptom: 'θe 速度翻倍，Park 投影完全错乱；Iq 指令变正负震荡，电机抖动卡转',
      symptomEn: 'θe speed doubles, Park completely scrambled; Iq command alternates sign and oscillates, the motor shudders and stalls.',
      why: 'θe = polePairs × θm，极对数错就让 dq 坐标旋转速率错；PI 在"漂移的旋转系"里控制，Iq 命令一会儿投到 +d 轴一会儿投到 −d 轴。这是出厂调试时"上电不转"最常见的根因，不是 PI 不好。修复：把 MOTOR_POLE_PAIRS 提到 motor_config.h 单点定义，所有用到的地方全走宏；出厂自检脚本里跑一次 V/f 慢转一圈 + 数编码器计数 = 极对数自动核对。',
      whyEn: 'θe = polePairs × θm; the wrong pole pair count makes the dq frame rotate at the wrong rate; the PI controls in a drifting rotating frame, projecting Iq onto +d or −d unpredictably. This is the most common "won\'t spin at first boot" root cause — not a PI issue. Fix: define MOTOR_POLE_PAIRS once in motor_config.h and use the macro everywhere; have the factory self-test script run V/f slow rotation for one revolution and count encoder counts to verify pole pairs automatically.',
    },
    {
      id: 'no-decoupling-highspeed',
      label: '试错：高速段不加 dq 解耦前馈',
      labelEn: 'Mis-step: no dq decoupling feed-forward at high speed',
      symptom: '低速好好的电机，转速一过 3000 rpm 电流环开始晃，Iq 跟踪带稳态振荡；6000 rpm 直接撞限发散',
      symptomEn: 'A motor that runs fine at low speed starts wobbling above 3000 rpm with steady-state Iq tracking oscillation; at 6000 rpm it saturates and diverges.',
      why: '高速下 ω·Lq·iq 项数十伏量级（前面算过 6000 rpm × Lq=2mH × Iq=8A = 60V），PI 输出全花在抵消这一项，剩下的余量不够动态响应。加前馈 vd -= ω·Lq·iq、vq += ω·(Ld·id + ψf) 让 PI 只处理建模残差，性能立刻回来。空调压缩机 6000 rpm + 高极对数场景必加；EV 主驱 18000 rpm 解耦项数百伏量级，不加 100% 失控。注意前馈用 ω_e（电频率）不是机械角速度，单位 rad/s。',
      whyEn: 'At high speed ω·Lq·iq reaches tens of volts (computed above: 6000 rpm × Lq = 2 mH × Iq = 8 A = 60 V), all PI output is spent fighting it with no headroom for dynamic response. Adding feed-forward vd −= ω·Lq·iq, vq += ω·(Ld·id + ψf) lets the PI handle only the modeling residual, restoring performance immediately. Mandatory on 6000 rpm + high-pole-pair HVAC compressors; an EV traction at 18000 rpm has hundreds of volts of decoupling term, without it 100% unstable. Note: use ω_e (electrical frequency) not mechanical angular velocity, units rad/s.',
    },
  ],
  nextModuleHook: '现在你能跑一遍完整 FOC 流水线了。最后一段"反 Park → SVPWM"实际上是把 Uα/Uβ 翻译成 6 个桥臂开关状态——下一模块 SVPWM 详解扇区判断、T1/T2/T0 时间分配、min-max 算法的零序注入，以及为什么 SVPWM 比 SPWM 多 ~15.5% 母线利用率（这关系到压缩机能不能转到铭牌转速）。',
  nextModuleHookEn: 'You can run the full FOC pipeline now. The final stage "inverse Park → SVPWM" translates Uα/Uβ into 6 bridge-leg switch states — Module 07 (SVPWM) details sector decoding, T1/T2/T0 time allocation, the zero-sequence injection of the min-max algorithm, and why SVPWM gives ~15.5% more bus utilization than SPWM (which determines whether the compressor can reach nameplate speed).',
};
