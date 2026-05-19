import type { ModuleWalkthrough } from './types';

/**
 * 13 HFI 高频注入低速无感 —— 用凸极电感不对称把"零速也能定位"做到生产级。
 *
 * 设计理念：把 IPM 凸极物理 (Ld < Lq) → d 轴注入正弦 → 响应电流幅值带 2θe 信息
 * → 同相解调 → PLL 锁到 sin(2Δθ)=0 这条信号链每一步都讲清。
 * 重点强调"为什么 SPM 表贴式电机用不了 HFI"、生产中的三大坑（凸极不足、频率选错、PLL 失控）、
 * 以及 STM32 上 CORDIC + CMSIS-DSP biquad LPF 的 ISR 实现骨架。
 *
 * 工业绑定：家用空调外机压缩机（不装编码器省 60-200 元 + 密封轴承油封）零启动、
 * 商用冷库 / 制冰机（启动负载大、必须零速带载）、洗衣机外转子直驱（成本敏感）、
 * 工业泵 / 风机（环境恶劣编码器易坏）；EV 主驱低速爬行段也用 HFI 但凸极比要 > 2.5。
 */
export const hfiSensorlessWalkthrough: ModuleWalkthrough = {
  moduleId: 'hfi-sensorless',
  bigPicture: '零速也要锁角度——往 d 轴主动喊一声，听 IPM 凸极的回声里有没有 2θe；CORDIC + biquad 把这条信号链塞进 ISR。',
  bigPictureEn: 'Lock the angle even at zero speed — actively call into the d axis and listen for 2θe in the IPM saliency echo; CORDIC + biquad squeeze this signal chain into the ISR.',
  successCriteria: [
    '能解释 IPM 凸极性 (Lq > Ld) 的物理来源（永磁体磁阻大）以及为什么这是 HFI 的物理前提',
    '能描述"注入 → 凸极响应 → 同相解调 → LPF → PLL 锁 sin(2Δθ)"全链路 + 公式',
    '理解为什么表贴式 PMSM (Ld ≈ Lq) 用 HFI 完全无效（凸极信号增益 (r-1)/(r+1) → 0）',
    '掌握注入频率选 800-1500 Hz 的三个约束（人耳、PWM 余量、铁损）+ PWM 必须 ≥ 4 × 注入',
    '知道 HFI 的 180° 极性歧义来源（sin(2Δθ) 周期 π）和上电 d 轴对齐的解决办法',
    '能写 STM32 上 HFI 解调骨架：CORDIC 算载波 + CMSIS-DSP biquad LPF + PLL PI',
    '能识别"凸极崩塌 / 注入频率落入 PWM 谐波带 / PLL Kp 过大 / 跳过对齐"四类典型故障现象',
  ],
  successCriteriaEn: [
    'Explain the physical source of IPM saliency (Lq > Ld, magnet has high reluctance) and why this is the prerequisite for HFI.',
    'Describe the full chain: injection → saliency response → in-phase demodulation → LPF → PLL locking sin(2Δθ), with formulas.',
    'Understand why surface-mount PMSM (Ld ≈ Lq) makes HFI useless (saliency-signal gain (r − 1)/(r + 1) → 0).',
    'Master the three constraints on the 800–1500 Hz injection frequency (hearing, PWM headroom, iron loss) plus PWM ≥ 4× injection.',
    'Know the 180° polarity ambiguity from sin(2Δθ) (period π) and the boot d-axis alignment that resolves it.',
    'Write the STM32 HFI demodulation skeleton: CORDIC for the carrier + CMSIS-DSP biquad LPF + PLL PI.',
    'Identify four typical fault phenomena: saliency collapse / injection frequency in PWM harmonic band / oversized PLL Kp / skipped alignment.',
  ],
  steps: [
    {
      id: 'why-hfi',
      title: '为什么要 HFI',
      goal: '把 HFI 的应用场景与 BEMF 失效区接上',
      action: '观察右侧"HFI 适用范围"卡片；默认转速 50 rpm（低速段）。',
      observe: '主图蓝色估算角追绿色真实角，PLL 在 ~10-20 ms 内锁定，最终误差 < 5°。整个过程电机几乎不转。',
      whyMatters: 'BEMF = ψ_f·ω·polePairs 正比转速；50 rpm 时 BEMF 不到 2 V，被死区压降（典型 ±2 V @310 V 母线 + 3 μs 死区）和 ADC 噪声完全淹没（模块 10 演示过这个失败模式）。HFI 换思路：不依赖电机自身转动产生的信号，而是控制器主动注入一个高频探测信号，从响应里解出角度。压缩机零启动（开机即满载）、冰柜启动（堵转转矩高）、电动汽车爬行（< 50 rpm 长时间运行）、洗衣机进水后大不平衡负载启动——这四个场景都是 HFI 的主场，无可替代。',
    },
    {
      id: 'saliency-physics',
      title: '凸极物理',
      goal: '搞清 Lq > Ld 这件事的几何含义',
      action: '右侧把"凸极比 Lq/Ld"从 2.18 慢慢拉到 2.5。',
      observe: '"凸极信号增益"百分数从约 37% 涨到约 43%；锁相误差变小、收敛变快。',
      whyMatters: 'IPM (内置式永磁) 电机的永磁体埋在转子铁芯里，d 轴（沿磁极方向）磁路因为永磁体磁阻大（μr ≈ 1，接近空气）→ 电感 Ld 小；q 轴（垂直磁极）磁路全是硅钢片（μr 几千）→ 电感 Lq 大。差异 (Lq − Ld) 就是 HFI 能解调出角度的全部物理基础。压缩机选型时铭牌的"凸极比 r = Lq/Ld"参数就是为 HFI 写的——比例越大，HFI 越好用。压缩机典型 r = 2.0-2.8，洗衣机直驱 r = 1.5-2.0（凸极性弱，HFI 边界场景），表贴 SPM r ≈ 1.0（彻底用不了）。',
      quiz: {
        q: 'IPM 电机的 d 轴电感为什么比 q 轴小？',
        options: [
          '设计时故意做小的',
          'd 轴磁路穿过永磁体（高磁阻，μr≈1），q 轴磁路只穿硅钢片（低磁阻，μr 几千）',
          '温度影响',
          '与控制器有关',
        ],
        correct: 1,
        hint: '电感 L ∝ 1/磁阻。永磁体的相对磁导率约为 1，与空气接近，磁阻大；硅钢片 μr 几千，磁阻小。d 轴必经永磁体 → 高磁阻 → 低 L_d；q 轴绕开永磁体 → 低磁阻 → 高 L_q。这种结构差异在 IPM 电机几何上是天然的——压缩机选型时让转子设计师"做大凸极比"是 HFI 友好度的硬指标。',
      },
    },
    {
      id: 'injection-signal',
      title: '注入信号',
      goal: '看 d 轴注入电压怎么变成可解调的响应',
      action: '右侧把"注入电压"从 30 V 调到 50 V，再观察"高频注入信号 + 解调"图。',
      observe: '蓝色 V_inject 幅值变大（800 Hz 正弦）；橙色"解调误差信号"幅值跟着增大；锁相时间略缩短。',
      whyMatters: '注入 V_d_h = V_h·sin(ω_h·t) 后，在估算 dq 系里看到的响应电流（教学简化模型）为：i_response ∝ (Lq − Ld) / (Ld·Lq) · V_h / ω_h · cos(ω_h·t) · sin(2·Δθ)，其中 Δθ = θ_true − θ̂。注意四件事：① 信号幅值正比 V_h（拉大有收益但有副作用：铜损 ∝ V_h²、可听噪声增大、Iq 命令余量被占）② 凸极差 (Lq − Ld) 是放大器（决定能不能用 HFI）③ 出现 2·Δθ（决定了 180° 极性歧义）④ 信号反比 ω_h（高频注入信号弱，要平衡）。生产 V_h 典型 20-50 V（母线 310 V 的 7-15%）。',
    },
    {
      id: 'demod-pll',
      title: '解调 + PLL + biquad',
      goal: '把"信号 × 载波 → LPF → PLL"这条流水线串到 STM32 实现',
      action: '看下方"高频注入信号 + 解调"图，理解橙色曲线怎么从蓝色注入波形里"挤"出来。再读 C 实现。',
      observe: '橙色解调输出在锁相过程中从大幅震荡逐步收敛到接近 0；锁定后误差曲线压在 ±5° 绿色锁定带内。',
      whyMatters: '解调 = 响应电流 × cos(ω_h·t)（同相相乘） → 三角积化和差：cos²(ω_h·t)·sin(2Δθ) = 0.5·(1 + cos(2ω_h·t))·sin(2Δθ)。低通滤掉 2ω_h·t 的高频项后得到 0.5·sin(2Δθ)——经典相位检测器结构。PLL 用这个 sin(2Δθ) 当误差，PI 调节 ω̂ 把 Δθ 推到 0。STM32 G4 + CMSIS-DSP biquad + CORDIC 完整实现骨架（每 ISR 1.5 μs）：' +
        ' /* 一次性初始化 biquad LPF：fc=200Hz, Q=0.707, fs=16kHz (PWM) */' +
        ' /* MATLAB: [b,a]=butter(2, 200/8000); arm_biquad_cascade_df1_init_f32(...) */' +
        ' static arm_biquad_casd_df1_inst_f32 lpf_state;' +
        ' static float lpf_coeffs[5] = { 0.00159f, 0.00318f, 0.00159f, 1.910f, -0.916f };' +
        ' static float lpf_buf[4];' +
        ' arm_biquad_cascade_df1_init_f32(&lpf_state, 1, lpf_coeffs, lpf_buf);' +
        ' /* 每 ISR (PWM 16kHz)：注入 + 解调 + LPF + PLL */' +
        ' float wh_t = OMEGA_H * t;        /* ωh = 2π·800 = 5027 rad/s */' +
        ' /* CORDIC 算 sin/cos */' +
        ' LL_CORDIC_WriteData(CORDIC, (uint32_t)(wh_t * Q31_SCALE));' +
        ' int32_t cos_q31 = (int32_t)LL_CORDIC_ReadData(CORDIC);' +
        ' int32_t sin_q31 = (int32_t)LL_CORDIC_ReadData(CORDIC);' +
        ' float sin_wh = (float)sin_q31 / 2147483648.f;' +
        ' float cos_wh = (float)cos_q31 / 2147483648.f;' +
        ' /* 注入 d 轴：V_d_inj = V_h·sin(ωh·t) */' +
        ' vd_total = vd_pi + V_H_INJ * sin_wh;' +
        ' /* 解调：iq 响应 × cos(ωh·t)，过 biquad LPF */' +
        ' float demod_raw = iq_meas * cos_wh;' +
        ' float demod_lpf;' +
        ' arm_biquad_cascade_df1_f32(&lpf_state, &demod_raw, &demod_lpf, 1);' +
        ' /* PLL：误差 = sin(2Δθ) 近似 = 2·demod_lpf；积分 → ω̂，再积分 → θ̂ */' +
        ' float pll_err = demod_lpf;' +
        ' omega_integral += KI_PLL * pll_err * TS;' +
        ' omega_hat = KP_PLL * pll_err + omega_integral;' +
        ' theta_hat += omega_hat * TS;' +
        ' if (theta_hat > 2*PI) theta_hat -= 2*PI;' +
        ' if (theta_hat < 0   ) theta_hat += 2*PI;' +
        ' 整段 ISR 增量 ~1.5 μs（CORDIC 36 ns + biquad 200 ns + PLL 100 ns + 杂项），16 kHz PWM 完全装得下。',
      quiz: {
        q: '解调后的低通滤波器截止频率为什么选 200 Hz（注入频率 800 Hz 的 1/4）？',
        options: [
          '随便选的',
          '要滤掉 2ω_h（1600 Hz）残留，同时保留 Δθ 变化（< 100 Hz）',
          '匹配电网频率',
          '硬件限制',
        ],
        correct: 1,
        hint: 'LPF 必须 ① 远低于 2ω_h（1600 Hz）才能滤掉相乘后的高频项 ② 又要远高于 PLL 带宽（典型 30-100 Hz）以免延迟拖慢锁相。200 Hz 是这两条约束的折中。biquad 而不是简单一阶 RC 是因为：二阶 Butterworth 在过渡带衰减 12 dB/oct，能压住 1600 Hz 残留到 −24 dB（足够干净），同时通带平直无失真。',
      },
    },
    {
      id: 'saliency-breakdown',
      title: '凸极崩塌',
      goal: '亲眼看 HFI 在表贴式电机上失效',
      action: '把"凸极比 Lq/Ld"从 2.18 一路拉到 1.05（接近表贴式 SPM 的 Lq ≈ Ld）。',
      observe: '"凸极信号增益"塌到 ~2%；主图蓝色估算角彻底追不上绿色真实角；锁相时间显示"未锁定"；最终误差几十度。',
      whyMatters: 'HFI 信号增益 (r−1)/(r+1) 是凸极比 r = Lq/Ld 的函数。r=2.5 时增益 0.43；r=1.5 时 0.20；r=1.05 时 0.024——比 ADC 量化噪声（典型 0.5% 满量程）还小，解调出来全是垃圾。这就是为什么表贴式 SPM 不能用 HFI——物理上没信号可解。压缩机选型时凸极比 < 1.5 直接淘汰，这是硬指标，不是 nice-to-have。如果真要在表贴 SPM 上做零启动，要换"零位检测 + 开环 I/f 启动"方案（强行注入旋转电流矢量拖动转子，转矩纹波大但能转），适用于风扇 / 水泵这类无负载启动场景。',
    },
    {
      id: 'freq-tradeoff',
      title: '频率折中',
      goal: '理解注入频率的三方约束 + PWM 频率耦合',
      action: '右侧把"注入频率"从 800 Hz 调到 200 Hz，再调到 1500 Hz，分别看响应。',
      observe: '200 Hz：落入人耳最敏感区（200-1000 Hz），可听噪声大；同时容易被 PWM 死区谐波污染。1500 Hz：避开人耳敏感段，效果好；但 PWM 8 kHz 时只剩 5 倍余量，再高就要抬 PWM 频率。',
      whyMatters: '注入频率有四条边界：① 必须高过 PLL 带宽 + LPF 截止（典型 > 500 Hz，否则 LPF 滤不干净）② 应高于人耳最敏感的 200-1000 Hz 段（选 > 1 kHz 时压缩机几乎听不到嗡声）③ 必须远低于 PWM 载波（< 1/4 PWM，避免采样混叠和占空比饱和——PWM 16 kHz → 注入 ≤ 4 kHz；PWM 8 kHz → 注入 ≤ 2 kHz）④ 高于 PWM 死区谐波带（典型 100-500 Hz，死区效应让相电压产生 5/7 次谐波，会污染解调）。空调压缩机典型 PWM 8-16 kHz + 注入 1-1.5 kHz 是行业共识，注入电压 30-50 V（母线 7-15%）。',
      quiz: {
        q: '同一台压缩机，PWM 从 16 kHz 降到 6 kHz（节能模式），注入频率应该？',
        options: [
          '保持 1.5 kHz 不变',
          '同时降低到 600-800 Hz（保持 < PWM/4），但要接受可听噪声加剧',
          '提高到 3 kHz',
          '与 PWM 无关',
        ],
        correct: 1,
        hint: 'PWM 6 kHz 时 1/4 PWM = 1.5 kHz 已经是上限；考虑实际还要留余量避混叠，注入只能压到 800 Hz 左右，这时落入人耳敏感区——所以高端变频空调 PWM 都不会低于 10 kHz。节能模式下要么舍弃 HFI 切到开环 V/f 启动，要么接受用户能听到的嗡声。',
      },
    },
    {
      id: 'polarity-180',
      title: '180° 极性歧义',
      goal: '搞清 sin(2Δθ) 自带的二义性 + 上电对齐流程',
      action: '观察主图：估算角 0° 和 180° 都让 sin(2Δθ) = 0；如何区分？',
      observe: '本模块仿真已假设上电前完成 d 轴对齐（trueThetaRad 初始已知），所以从已知方向起步不会跳到 180° 翻转分支。',
      whyMatters: 'HFI 解调输出 sin(2·Δθ) 周期是 180° 不是 360°——也就是 θ̂ = θ_true 和 θ̂ = θ_true + 180° 是两个稳定锁相点。如果不处理，启动方向是随机的。生产做法分两步：① **上电对齐**：注入一个 1-2 A 的直流 Id（不是高频），持续 200-500 ms 把永磁体强制拉到 d 轴对齐 α 相零位（θ_true = 0 已知）；② **极性判别**：注入两个不同幅值的 Id 脉冲，看响应电流方向——磁饱和效应让正向 Id 引起的 Ld 减小幅度比负向 Id 大（M 形非对称磁化曲线），由此区分 0° 和 180°。模块 14（启动状态机）会把这两步串成完整的"预充→对齐→极性判别→HFI 闭环"流程。',
    },
    {
      id: 'recap',
      title: '回到全局',
      goal: '把 HFI 接入压缩机零启动完整流程',
      action: '回顾：一台空调压缩机从上电到 3000 rpm，HFI 出现在哪些阶段？',
      observe: '答：① 母线预充（PFC 升 380V）② 短时直流对齐 d 轴（200 ms）③ 极性判别（注入两脉冲，500 ms）④ HFI 零速闭环（0-100 rpm）⑤ HFI + BEMF 加权过渡（100-400 rpm，两者按转速插值）⑥ 纯 SMO 闭环（> 400 rpm）⑦ 弱磁。',
      whyMatters: 'HFI 不是孤立算法，是"零启动 + 平滑切到 BEMF"组合拳的前半段。本模块讲了 HFI 怎么工作；下一模块（14 启动状态机）讲 HFI/BEMF/V-f 之间怎么切换、滞回怎么设、健康检查怎么做。两个模块合起来才是一套生产级压缩机控制器的低速段。生产体验：HFI 阶段听见 1 kHz 左右轻微"嗞"声是正常的（注入信号），切到 SMO 后立刻安静；如果安静后又开始嗡——很可能是切换滞回带宽设窄了，HFI/SMO 来回振荡。',
    },
  ],
  pitfalls: [
    {
      id: 'spm-on-hfi',
      label: '试错：表贴式 SPM 电机用 HFI（r = 1.05）',
      symptom: '解调信号几乎平直，PLL 永远锁不上；估算角在 0-360° 间随机漫游；启动 100% 失败',
      why: '凸极信号增益 (r-1)/(r+1) 在 r=1.05 时只有 2.4%，比 ADC 噪声还小。增大 V_h 也救不了——信号是凸极差产生的，没有凸极就没有信号。选错电机是 HFI 应用最致命也最常见的失败模式，必须在电机选型阶段卡死 r ≥ 1.5。如果非要用表贴 SPM（成本敏感场景），换"开环 I/f 启动"：注入旋转电流矢量按速度斜坡拖动转子，转矩纹波大但能转，达到 BEMF 可检测的转速（典型 10% 同步速）再切到 SMO。',
    },
    {
      id: 'inject-too-low',
      label: '试错：注入频率选 200 Hz（落入 PWM 谐波带 + 人耳敏感区）',
      symptom: '解调输出有强烈纹波，PLL 锁不稳；压缩机发出刺耳啸叫，用户投诉"开机像蚊子叫"',
      why: '200 Hz 落在 PWM 死区效应的谐波带（PWM 死区在 100-500 Hz 段产生 5/7 次谐波）→ 解调时 PWM 谐波被同步检波下来变成低频干扰，淹没真正的 sin(2Δθ)。同时 200 Hz 是人耳最敏感的语音频段，压缩机会发出刺耳啸叫。正确做法：选 1 kHz 以上，避开人耳敏感和 PWM 谐波双重雷区。如果 PWM 限制只能 < 1 kHz 注入，要在 PWM 死区补偿后再注入，并把 V_h 压到 20 V 以下减小可听度。',
    },
    {
      id: 'pll-too-aggressive',
      label: '试错：HFI PLL Kp 拉到 5 倍',
      symptom: '启动瞬态变快但 PLL 在锁定后持续抖动；估算角附带 ±20° 高频毛刺；Iq 命令跟着抖 → 转矩脉动 → 压缩机低速段被人体感知为震动',
      why: 'HFI 的 PLL 误差信号本身就带噪声（LPF 不能完全干净）。Kp 越大，把这些噪声越快地推到 ω̂，再积分进 θ̂——结果是估角度高频抖动。Iq 命令跟着抖 → 转矩脉动 → 在低速段被人体感知为"压缩机抖动"。经验：HFI PLL 带宽 30-50 Hz，比 BEMF PLL 还要保守（BEMF 阶段可以推到 100-200 Hz）。整定口诀：先把 LPF 截止压到 ω_h/4，再让 PLL 带宽 < LPF 截止 / 4，最后 Kp/Ki = 2·ζ·ω_n、ζ=0.7。',
    },
    {
      id: 'no-alignment',
      label: '试错：跳过上电 d 轴对齐和极性判别',
      symptom: '50% 概率电机反方向启动；偶尔启动失败；启动方向不重复（同一台电机每次开机方向随机）',
      why: 'sin(2Δθ) 的 180° 周期让 θ̂ = θ_true 和 θ̂ = θ_true + 180° 都是稳定平衡点。不做对齐 → PLL 随机收敛到其中一个 → 50% 概率 d 轴方向反了 → Iq 命令实际投到 −q 轴 → 电机反转或者死锁（与负载方向不匹配卡死）。修复：上电先注入一个 1-2 A 的 Id（不要 Iq）持续 200-500 ms，让永磁体被拉到 d 轴对齐 α 相的位置；然后注入两个不同幅值脉冲做极性判别（利用磁饱和的非对称性区分 N/S 极性）；建立已知零位再启 HFI。这套对齐流程在模块 14 状态机里是 ALIGN 状态。',
    },
  ],
  nextModuleHook: '现在你能用 HFI 在零速锁角度了，但 HFI、SMO、开环 V/f 之间什么时候切、怎么切才平滑？下一模块"启动状态机"用一张状态图把整个压缩机启动流程（预充→对齐→极性判别→HFI→过渡→SMO→弱磁）串起来，是生产代码真正的样子。',
  nextModuleHookEn: 'You can now lock the angle at zero speed with HFI, but when do you switch between HFI, SMO, and open-loop V/f, and how do you keep it smooth? Module 14 (startup state machine) chains the full compressor startup (precharge → align → polarity check → HFI → handoff → SMO → field weakening) into a state diagram — what production code actually looks like.',
};
