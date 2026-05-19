import type { ModuleWalkthrough } from './types';

/**
 * 10 无感 FOC —— SMO + PLL 反电动势观测器的物理直觉、离散化实现、失效边界。
 *
 * 工业绑定：家用空调外机 PMSM 压缩机（5-8 极对、低惯量、要 6000+ rpm）零成本无编码器
 * 是 ROI 极高的选择——省 60-200 元/台编码器 + 一对密封轴承油封 + 长期可靠性提升。
 * 但代价是低速段必须靠 HFI（下一模块）、上电必须做对齐、Rs 温飘必须在线补偿、
 * 启动状态机的滞回必须设对——本模块把这些工业坑一次性翻穿。
 */
export const sensorlessFocWalkthrough: ModuleWalkthrough = {
  moduleId: 'sensorless-foc',
  bigPicture: '反电动势是无感的"回声"——速度大听得清、速度小被噪声淹没；要懂 SMO 离散化、Rs 温飘、PLL 带宽、切换滞回四件事才能上量产。',
  bigPictureEn: 'Back-EMF is the sensorless "echo" — clear at high speed, drowned in noise at low speed; you need SMO discretization, Rs thermal drift, PLL bandwidth, and switching hysteresis to take a sensorless drive to mass production.',
  successCriteria: [
    '能默写 e = v − Rs·i − Ls·di/dt，并解释每一项的物理含义和离散化误差源',
    '能解释为什么低速 BEMF 幅值小 → 估角度失败（SNR 塌陷），并定量算"信噪比 = 1"的临界转速',
    '理解 PLL 用 sin(θ_meas − θ̂) 而不是 Δθ 直接做误差的原因（在 ±π/2 内单调）',
    '掌握 STM32 上 SMO 离散化骨架（一阶 Euler + sat 函数）和稳定步长选择',
    '能识别 SMO 抖振、Rs 温飘漂角、PLL 增益过大、滤波延迟相位损失四类典型故障现象',
    '知道 BEMF/HFI 切换的转速边界（5-10% 同步速）和滞回原则，以及健康检查闭环',
  ],
  successCriteriaEn: [
    'Recite e = v − Rs·i − Ls·di/dt and explain the physical meaning of each term and the discretization error sources.',
    'Explain why low-speed BEMF amplitude is small → angle estimation fails (SNR collapse), and quantitatively compute the critical speed at SNR = 1.',
    'Understand why the PLL uses sin(θ_meas − θ̂) instead of Δθ directly (monotone within ±π/2).',
    'Master the STM32 SMO discretization skeleton (1st-order Euler + sat function) and stable step-size selection.',
    'Identify four typical fault phenomena: SMO chatter, Rs-drift angle bias, excessive PLL gain, filter-induced phase loss.',
    'Know the BEMF/HFI handoff speed boundary (5–10% synchronous speed) and hysteresis principle, plus the health-check loop.',
  ],
  steps: [
    {
      id: 'bemf-equation',
      title: 'BEMF 方程',
      goal: '把"反电动势怎么算"咬死，理解每一项的物理含义',
      action: '看主图下方文字，回忆 e_α = v_α − Rs·i_α − Ls·di_α/dt；右侧把"转速"调到 1500 rpm。',
      observe: '"反电动势幅值 ≈ Ke·ω·polePairs" 显示约 32V，SMO 锁相中，峰值误差 < 3°。',
      whyMatters: 'PMSM 定子磁链 ψ_α = ψ_f·cos(θe) → BEMF e_α = dψ/dt = −ψ_f·ωe·sin(θe)。BEMF 矢量幅值 ∝ ωe，方向领先转子磁链 90°。这就是 atan2(eβ, eα) − π/2 能反推角度的全部秘密。三个估算项的工程含义：v 用 PI 输出值（电压指令）而不是测电压（家用驱动器没有电压采样），所以 v 的精度由"PWM 实际输出 vs 指令"的死区误差决定；Rs·i 在低速重载时是主导项（甚至超过 BEMF），所以 Rs 估值的温飘是低速无感的头号噪声源；Ls·di/dt 离散化为 Ls·(i[k]−i[k-1])/Ts，对采样噪声极敏感——这是为什么 SMO 之后必须再加一阶低通。',
    },
    {
      id: 'high-speed-locked',
      title: '高速锁相',
      goal: '在 BEMF 信号充足时看角度怎么被准确估算',
      action: '保持转速 1500 rpm，观察主图中绿色"真实 θe"和蓝色"SMO+PLL 估算"两条线。',
      observe: '两条线几乎重合，红色误差线压在 ±5° 失锁阈值内；下面"开关面 |i_est − i_meas|" 快速收敛到边界层附近（接近 0）。',
      whyMatters: 'SMO 本质是用电流误差 i_est − i_meas 驱动一个开关函数（sat 替代 sign 抑制抖振），开关函数的等效控制项经低通滤波 ≈ BEMF。BEMF 大时 SNR 高，atan2 + PLL 锁得稳。这是 5% 同步速以上无感 FOC 的"舒适区"。压缩机额定转速 4000-6000 rpm（电频率 200-400 Hz @5 极对），BEMF 峰值 30-50V，是 SMO 的甜区。',
      quiz: {
        q: '反电动势 e = v − Rs·i − Ls·di/dt 中，最容易因为温升导致角度漂移的参数是？',
        options: [
          'v（PI 输出指令，理论值精确）',
          'Rs（定子铜阻每 10°C 升 4%；Rs·i 是低速主导项）',
          'Ls（定子电感受饱和影响但温敏较弱）',
          '都不影响（PLL 会自动修正）',
        ],
        correct: 1,
        hint: 'Rs 是铜电阻，温升每 10°C 上升约 4%。压缩机启动到稳态绕组温升 60-80°C，Rs 涨 25-30% → Rs·i 项偏差 25%。在低速重载（Rs·i 主导）时这会让 BEMF 估值有恒定偏差 → 角度有恒定偏移 → 表现为"Iq 命令大但转矩小、效率掉 5-8%"。生产驱动器必须做 Rs 在线辨识——一种实现：稳态时 v_d ≈ Rs·i_d（id≈0 时几乎纯 Rs 项），反推 Rs 实时刷新；另一种用 NTC 测绕组温度按温度系数推算。',
      },
    },
    {
      id: 'smo-discrete',
      title: 'SMO 离散化实现',
      goal: '把"滑模观测器"在 STM32 上落地的最小骨架理清楚',
      action: '看下方"SMO 内部信号"图：i_est 跟 i_meas 几乎重合，z_α 经一阶 LPF 是 BEMF 估值。再读 C 片段。',
      observe: 'SMO 不依赖速度也不依赖角度——只用电压、电流、电机参数 (Rs, Ls)。这是它比 EKF 更受欢迎的核心原因（EKF 需要速度作为状态变量，且 9 个 matrix 元素维护麻烦）。',
      whyMatters: 'SMO 离散化骨架（一阶 Euler、电流 dq → αβ 后实现）：' +
        ' /* 电机模型：Ls·di/dt = v − Rs·i − e；估算 i_est 时把未知 e 替换成 sat(i_est-i_meas) 的开关项 */ ' +
        ' float di_est_alpha = (v_alpha - Rs * i_est_alpha - K_smo * sat(i_est_alpha - i_meas_alpha, BOUND)) / Ls;' +
        ' float di_est_beta  = (v_beta  - Rs * i_est_beta  - K_smo * sat(i_est_beta  - i_meas_beta , BOUND)) / Ls;' +
        ' i_est_alpha += di_est_alpha * Ts;' +
        ' i_est_beta  += di_est_beta  * Ts;' +
        ' /* 开关函数的等效控制项 ≈ BEMF；用一阶 LPF 提取 */ ' +
        ' float z_alpha = K_smo * sat(i_est_alpha - i_meas_alpha, BOUND);' +
        ' float z_beta  = K_smo * sat(i_est_beta  - i_meas_beta , BOUND);' +
        ' e_alpha = e_alpha * (1 - alpha_lpf) + z_alpha * alpha_lpf;' +
        ' e_beta  = e_beta  * (1 - alpha_lpf) + z_beta  * alpha_lpf;' +
        ' theta_atan = atan2(-e_alpha, e_beta);  /* BEMF 领先转子 90° 故 -e_alpha */ ' +
        ' 三个工业级注意：① sat(x, B) = clamp(x/B, -1, 1) 替代 sign() 消除抖振，B 是边界层厚度，典型 0.1·I_rated；② K_smo 选 ≈ ωe·Ls·5（让滑模面收敛比 BEMF 变化快 5 倍）；③ alpha_lpf = Ts·2π·f_c/(1+Ts·2π·f_c)，截止 f_c 选 BEMF 频率的 5-10 倍（典型 200-500 Hz @ 50 Hz BEMF），太低延迟大、太高滤不掉抖振。',
      quiz: {
        q: 'SMO 离散化用一阶 Euler，PWM 16 kHz（Ts = 62.5 μs），电机 Ls = 1 mH、Rs = 0.4 Ω。最大稳定 K_smo 大约多大？',
        options: [
          'K_smo = 50（远小于稳定边界）',
          'K_smo = 320（≈ 2Ls/Ts = 0.002/62.5e-6 ≈ 32，但抖振大）',
          'K_smo = 5000（超稳定边界，必发散）',
          '与 Ls/Ts 无关（K_smo 越大越好）',
        ],
        correct: 1,
        hint: '一阶 Euler 离散化稳定条件：K_smo·Ts/Ls < 2（推导自 z 域稳定）→ K_smo < 2·Ls/Ts = 2·0.001/62.5e-6 = 32。但实际取 K_smo ≈ ωe·Ls·5 才有性能，典型 200-500 量级——这就需要把 Euler 升级为 RK2 或缩 Ts。选项 B 数值正确但概念上"32 已经是稳定边界"，工程取 0.3-0.5 倍 = 10-15。提 PWM 频率到 32 kHz 能让稳定边界翻倍是另一条路。',
      },
    },
    {
      id: 'low-speed-fail',
      title: '低速失锁',
      goal: '看 BEMF 在低速怎么塌陷，定量算"信噪比 = 1"临界转速',
      action: '加载预设"低速无感估算失败"，转速从 1500 跌到 ~300 rpm。',
      observe: '主图右上变红："失锁风险（建议切 HFI）"；蓝色估算角剧烈抖动追不上真实角；峰值误差冲到 15° 以上；右侧诊断卡警告"低速 SMO 失效区"。',
      whyMatters: 'BEMF 幅值 = ψ_f·ωe = ψ_f·2π·rpm·polePairs/60。300 rpm @5 极对时只有 1500 rpm 的 1/5，约 6V 量级；Rs·i 项在重载 8A、Rs=0.4Ω 时约 3.2V；加上死区电压畸变（~2V @310V 母线 + 2μs 死区）和 ADC 量化噪声 → SNR ≈ 1，估算彻底失效。压缩机零启动用不了 SMO 的根本原因，必须切下一模块的 HFI。临界转速估算公式：SNR=1 → ψ_f·ωe = Rs·I_max + V_deadtime → ω_critical = (Rs·I_max + V_deadtime) / ψ_f，典型空调压缩机 50-100 rad/s 电角度，相当于 100-200 rpm @5 极对。',
      presetId: 'low-speed-sensorless',
    },
    {
      id: 'pll-tracking',
      title: 'PLL 锁相 + 带宽折中',
      goal: '理解 PLL 怎么把 atan2 瞬时角变成平滑跟踪角，以及为什么 PLL 用 sin(Δθ) 不用 Δθ',
      action: '回到默认 1500 rpm，右侧把 PLL Kp 从 80 加到 240（3 倍），观察主图。',
      observe: '锁相收敛更快（启动瞬态更短），但稳态角度抖动明显放大，红色误差线变粗。',
      whyMatters: 'PLL 误差用 Δθ = sin(θ_meas − θ̂) 而不是直接相减——因为 atan2 在 ±π 边界会跳变（179° → −179° 差 358°），直接相减会触发"角度环绕"灾难；sin(Δθ) 在 |Δθ| < π/2 内单调，且在 0 附近 ≈ Δθ，PI 在小误差区间线性表现良好，在大误差区间也不会崩。完整 PLL 离散实现（PWM 16 kHz、Ts = 62.5 μs）：' +
        ' float err = sinf(theta_atan - theta_hat);  /* 用三角恒等式：sin(a-b) = sin(a)cos(b) - cos(a)sin(b)，省一次 atan2 */ ' +
        ' omega_integral += Ki_pll * err * Ts;' +
        ' omega_hat = Kp_pll * err + omega_integral;' +
        ' theta_hat += omega_hat * Ts;' +
        ' if (theta_hat > PI) theta_hat -= 2*PI; else if (theta_hat < -PI) theta_hat += 2*PI;  ' +
        ' Kp 越大跟踪越快，但同时把 BEMF 估算的噪声直接放大到角度输出。带宽折中是无感调试的核心手艺——典型工程做法：PLL 带宽 = 电流环带宽的 1/3~1/5。电流环 1 kHz → PLL 带宽 200-300 Hz → Kp_pll ≈ 2·ζ·ω_pll、Ki_pll ≈ ω_pll²（ζ = 0.707）→ Kp_pll ≈ 2·0.707·1885 ≈ 2660、Ki_pll ≈ 3.55e6。',
      quiz: {
        q: 'PLL 输出 ω̂ 与命令转速偏差越来越大持续 50 ms，控制器应该？',
        options: [
          '什么也不做，继续按估算角度送电流（"也许会自己锁回来"）',
          '触发"健康检查 failed"立刻切回开环 V/f 拖动或封 PWM 报故障',
          '把 Kp 拉大强行追（"激进 PLL 更快锁"）',
          '重启 MCU（"软件出错了"）',
        ],
        correct: 1,
        hint: '估算失效时继续闭环 = 把 Iq 命令投到错误方向，轻则失步、重则烧管。生产代码必有 PLL 健康检查：① BEMF 幅值持续 < 阈值；② |ω_cmd − ω_hat| 持续 > 阈值；③ atan2 角度跳变速率异常。任一条件 50-100 ms 内不恢复就切开环 V/f 或封 PWM，并把当前转速、电流、BEMF 写入黑匣子。选项 C 是更糟选择——失锁时拉大 Kp 让噪声更快进入控制环，反而加速发散。',
      },
    },
    {
      id: 'noise-and-compensation',
      title: '噪声敏感性 + Rs 在线补偿',
      goal: '量化 Rs/ADC/死区误差对角度的影响，并理解工程上的补偿手段',
      action: '把"噪声"参数从 0.08 拉到 0.5（约 6 倍）。',
      observe: '"SMO 内部信号"图里开关面波形变毛糙；z_α 低通输出多了高频纹波；峰值误差从 ~3° 涨到 8-10°，逼近失锁阈值。',
      whyMatters: '生产噪声不只是 ADC 量化，还包括：① 死区导致的开关电压畸变（约 1-2V @ PWM 周期）；② Rs 温飘（启动到稳态升 25-30%）；③ 电流采样运放失调；④ 母线电压跌落导致 v_cmd 与实际差异。这些都先污染 e_α / e_β 估算，再经 atan2 + PLL 一路放大到角度。三种主流补偿：' +
        ' (1) 死区在线补偿：v_alpha_real = v_alpha_cmd + V_deadtime · sign(i_alpha)；过零附近禁用（前一模块讲过）；' +
        ' (2) Rs 在线辨识：稳态 i_q=I0、i_d=0、转速恒定时 v_d ≈ -ωe·Lq·iq + Rs·id ≈ 0；切换 id 注入小直流 0.5A → v_d ≈ Rs·0.5 → 反推 Rs，每 5-10 秒刷新一次；' +
        ' (3) 加 BEMF 一阶 LPF（截止 200 Hz @ 50 Hz BEMF）：滤掉开关谐波，代价是低通引入相位滞后（200 Hz LPF 在 50 Hz 处滞后 ~14°），所以 LPF 截止频率必须远高于 BEMF 频率本身——这是 5-10 倍经验法则的来源。',
    },
    {
      id: 'handoff',
      title: '切换边界 + 滞回',
      goal: '形成"什么速度用什么观测器"的工程心智图，并理解滞回为什么必要',
      action: '回到默认参数，慢慢把转速从 50 推到 3000 rpm，观察主图右上角状态条变化。',
      observe: '50-300 rpm：失锁风险（建议切 HFI）；300-500 rpm：SMO 误差临界（warn）；> 500 rpm：SMO 锁相中（measure）。',
      whyMatters: '工程套路：< 5% 同步速 → HFI；5-10% → 加权混合两套估算（避免角度跳变）；> 10% → 纯 BEMF / SMO。切换边界必须有滞回（hysteresis）：例如 HFI → BEMF 在 400 rpm 切，BEMF → HFI 在 250 rpm 切——150 rpm 的"死区"防止在边界附近反复抖动。如果没有滞回，机械负载波动让转速在 350 rpm 上下抖 ±50 rpm 时，观测器在 HFI 和 BEMF 之间每秒切几次，每次切换都让 dq 命令跳变 → 转矩脉动 → 客户听到的就是"压缩机咯噔咯噔"。状态机骨架（属于模块 14）：' +
        ' if (state == BEMF && rpm < 250) state = HFI;' +
        ' else if (state == HFI && rpm > 400) state = BEMF;' +
        ' /* 切换瞬间还要清 PI 积分器，避免旧状态的电压指令惯性打到新状态 */',
    },
    {
      id: 'recap',
      title: '回到全局',
      goal: '把无感 FOC 串回完整变频器链路',
      action: '回顾：一台空调压缩机上电到额定转速，控制器经历了哪几段？',
      observe: '答：① 母线预充（PFC 模块）② d 轴对齐（给固定 Id 让转子停在零位）③ HFI 低速无感（下一模块）④ HFI→SMO 平滑过渡（带滞回）⑤ SMO 闭环（500 rpm 以上）⑥ 进入弱磁高速段（4000+ rpm）。',
      whyMatters: '"无感"是一组观测器的协同，不是单一算法。本模块讲的 BEMF/SMO 是高速段的主力，下一模块 HFI 补低速段。两者配合才能撑起压缩机从零速到 6000+ rpm 的全工况。出厂前必跑的无感测试：① 启动失败率（500 次启动失败 < 5 次）；② 切换稳定性（在 250-400 rpm 间反复扫描转速 100 次无切换震荡）；③ Rs 温飘鲁棒性（25°C 调好后烤箱升到 85°C 复测，角度误差 < 5°）；④ 母线跌落鲁棒性（Udc 从 310V 降到 250V，PLL 不失锁）。',
      quiz: {
        q: '压缩机变频器从静止启动到 3000 rpm，BEMF/SMO 观测器最早能可靠工作的时间点大约是？',
        options: [
          '上电瞬间（0 rpm）就行，SMO 不依赖速度',
          '转速越过 ~5-10% 额定转速（约 300-500 rpm）之后，BEMF SNR 足够',
          '到达额定转速时',
          '永远不行，压缩机必须用编码器',
        ],
        correct: 1,
        hint: 'BEMF ∝ ωe。低于 5% 同步速时 BEMF 比 Rs·i + 死区误差还小，SMO 估不出。越过这个门槛后 SNR 提升，可以从 HFI 平滑切到 SMO。选项 A 是常见的误解——SMO 算法本身不需要速度作为输入，但它能"看见"的信号（BEMF）必须 ≥ 一定量级才有意义。选项 D 是反例——空调和冰箱压缩机大面积是无感，证明完全可行。',
      },
    },
  ],
  pitfalls: [
    {
      id: 'wrong-rs',
      label: '试错：Rs 标错（实测 0.42 Ω 填成 0.6 Ω）',
      symptom: '稳态下蓝色估算角和绿色真实角差恒定 ~15°，误差曲线不是零均值而是带直流偏置；Iq 大但转矩小',
      why: 'Rs·i 项被高估 → e_α = v_α − Rs·i_α 被多扣一部分 → BEMF 幅值偏小、相位偏移 → atan2 算出的角度有恒定偏差。生产中表现为"扭矩偏低、效率差几个点、铜损发烫"。解决：上电做参数自辨识（注入直流测 Rs，注入高频测 Ls + 凸极比）；运行中做 Rs 在线刷新（id=0、稳态下 v_d ≈ Rs·实际 id 反推）。压缩机生产线必跑参数辨识流程，不允许直接用电机型号标称值。',
    },
    {
      id: 'pll-too-fast',
      label: '试错：PLL Kp/Ki 拉到 4 倍',
      symptom: '启动瞬态变快，但稳态角度抖动放大；电流环也开始振荡',
      why: 'PLL 带宽过高 → BEMF 噪声经 PI 直接进 θ̂ → Park 投影矩阵随机抖动 → Iq 命令在 q 轴和 d 轴间来回错投 → 电流环看到不一致的 dq 参考，产生振荡。工程经验：PLL 带宽 ≤ 电流环带宽 / 3。无感系统 PLL 带宽通常 200-500 Hz（电流环 1 kHz 时），更高就要冒抖动放大的风险。',
    },
    {
      id: 'low-speed-closed-loop',
      label: '试错：< 300 rpm 强行闭环（关掉 HFI 切换）',
      symptom: '电机抖动、可能反转、电流尖峰；峰值误差爆 30° 以上',
      why: 'BEMF 太小（~6V）连不过 Rs·i 的扰动，atan2 输入信噪比 < 1 → 估角度本质上是在追噪声 → Iq 命令方向随机 → 转矩瞬时方向乱变。压缩机零启动失败 99% 是这个原因。修复：低速段必须先 HFI（下一模块），或者用开环 V/f 拖到 200 rpm 再切 SMO。',
      presetId: 'low-speed-sensorless',
    },
    {
      id: 'no-health-check',
      label: '试错：禁用 PLL 健康检查',
      symptom: '负载突变或母线跌落时，PLL 一次失锁后没自动回退；电流持续大、保护器跳闸甚至烧管',
      why: '生产代码必须监测 ① BEMF 幅值是否过低（< 2V 时报警）② 角度误差 |Δθ| 是否持续超阈值（> 30° 持续 50 ms）③ ω̂ 与命令转速偏差是否过大（> 30% 持续 100 ms）。任一条件触发立即切开环 V/f 或封 PWM 报故障。没这层保护 → 一次扰动就可能烧管，是无感 FOC 最致命的设计缺失。健康检查代码加 10 行，能避免 90% 的售后退机。',
    },
  ],
  nextModuleHook: '现在你能用 BEMF/SMO 估算高速角度了，并且知道 Rs 温飘、PLL 带宽、切换滞回、健康检查四道工业坎。但压缩机零启动 BEMF 还没出来——下一模块 HFI 用"主动注入高频电压 + 凸极响应解调"解决 0-300 rpm 这段死区，是空调/冰箱压缩机的标配。',
  nextModuleHookEn: 'You can now estimate high-speed angle with BEMF/SMO and know four industrial hurdles: Rs thermal drift, PLL bandwidth, switching hysteresis, and health checks. But a compressor at zero start has no BEMF — Module 13 (HFI) solves the 0–300 rpm dead zone via "active high-frequency voltage injection + saliency-response demodulation", the standard option for HVAC and refrigerator compressors.',
};
