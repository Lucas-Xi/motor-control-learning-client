import type { ModuleWalkthrough } from './types';

/**
 * 09 三闭环级联 —— 把"电流 → 速度 → 位置"三层级联讲透：带宽分层的物理原因、
 * 整定顺序、输出限幅、抗积分饱和、速度环离散化、增量式 PID。
 *
 * 工业绑定：
 *   - 电流环：FOC 的 ISR 主体，与 PWM 同频（16-20 kHz），决定动态响应上限；
 *   - 速度环：1 kHz 软定时器或 RTOS 高优先级任务，决定调速精度；
 *   - 位置环：100 Hz 慢任务，仅伺服 / CNC / 机器人关节 / EV 主驱挂挡时启用。
 *
 * 压缩机变频空调：只用电流环 + 速度环，没有位置环（不需要精确停在某角度）。
 * 工业泵 / 风机：同样只用电流+速度。带位置环的是机器人关节、CNC 主轴定位、EV 倒车精停。
 */
export const controlLoopsWalkthrough: ModuleWalkthrough = {
  moduleId: 'control-loops',
  bigPicture: '位置 → 速度 → 电流三层级联，外层给参考、内层快速执行；带宽逐层降 5-10 倍，整定从内向外。',
  bigPictureEn: 'A three-layer cascade — position → speed → current; the outer layers issue references, the inner layers execute quickly; bandwidth drops by 5–10× per layer, tuned from inside out.',
  successCriteria: [
    '能画出三闭环框图，并说明每环的输入/输出/执行频率（电流 16 kHz / 速度 1 kHz / 位置 100 Hz）',
    '能解释"内环必须比外环快 5-10 倍"的 Nyquist 物理边界，并从振荡频率反推哪一层出错',
    '会按 Kp = ω_bw·L、Ki = ω_bw·R 解析公式整定电流环，并理解为什么实际取 0.5-0.7 倍',
    '能写出抗积分饱和的两种主流实现（条件冻结 + back-calculation）并知道各自利弊',
    '懂得每层输出必须限幅（速度限 / 电流限 / 电压限），并按物理量纲限不是按"代码喜欢的数"',
    '能在嵌入式上正确实现增量式 PID 摆脱 Ts 显式依赖，应对 PWM 频率切换场景',
  ],
  successCriteriaEn: [
    'Draw the three-cascade block diagram and state each loop\'s input/output and execution frequency (current 16 kHz / speed 1 kHz / position 100 Hz).',
    'Explain the Nyquist physical boundary of "inner-loop must be 5–10× faster than outer" and identify which layer is misbehaving from the oscillation frequency.',
    'Tune the current loop with the analytic formulas Kp = ω_bw·L, Ki = ω_bw·R and understand why the measured value is 0.5–0.7× analytic.',
    'Write the two mainstream anti-windup implementations (conditional integration + back-calculation) and know their trade-offs.',
    'Understand that each layer\'s output must be saturated, in physical units (not arbitrary code-friendly numbers).',
    'Correctly implement an embedded incremental PID to remove explicit Ts dependence and handle PWM-frequency switching.',
  ],
  steps: [
    {
      id: 'cascade-structure',
      title: '看级联',
      goal: '在框图上认清三层结构、数据流、执行频率',
      action: '观察右侧"三层级联"卡片：位置环（橙）→ 速度环（青）→ 电流环（mint）；每层输出是下一层参考。',
      observe: '位置环输出 = 速度参考 ω*；速度环输出 = Iq 参考 Iq*；电流环输出 = 电压参考 Vq*。Vq* 经反 Park + SVPWM 落到桥臂。三层运行频率：电流 16 kHz（ISR），速度 1 kHz（软定时器），位置 100 Hz（慢任务）。',
      whyMatters: '这是工业伺服 / 机器人关节 / CNC 主轴 / 压缩机变频的标准架构。少一层（如只有速度环）则做不了精确定位；多一层（加加速度环）实际意义不大、徒增延迟。三层是工程上的最优解。空调压缩机只用电流+速度（不需要位置精确），EV 倒车精停才需要位置环。',
    },
    {
      id: 'bandwidth-hierarchy',
      title: '带宽分层的物理根',
      goal: '从 Nyquist 稳定条件理解"内快外慢"不是建议是物理上限',
      action: '记住三个典型数：电流环 1-5 kHz、速度环 100-500 Hz、位置环 10-50 Hz。每层比内层慢 5-10 倍。',
      observe: '电流环跟 PWM 同频（16-20 kHz 中断），速度环跑在 1 kHz 软定时器，位置环 100-500 Hz。',
      whyMatters: '带宽 = "能跟踪多快指令的能力"。外环的输出 = 内环的参考。如果外环带宽 ≥ 内环：外环参考变化速度 ≥ 内环响应速度 → 内环还没跟上参考又变了 → 误差累积 → 振荡。这是控制理论里"内环必须比外环快 5-10 倍"经验法则的 Nyquist 物理根。同时一条边界：内环带宽不能超过 1/(2π·PWM 周期)·0.3 ≈ PWM/20，否则采样-计算-生效的总延迟耗光相位裕度。16 kHz PWM 理论电流环上限 ~2.5 kHz，工程取 1-1.5 kHz 是稳态甜区。',
      quiz: {
        q: '一台 4 极对 PMSM，Ld = 1.5 mH、Rs = 0.4 Ω，电流环目标带宽 1.2 kHz。按解析公式 Kp ≈ ω_bw·L、Ki ≈ ω_bw·R，起步 Kp 和 Ki 大致取多少？',
        options: [
          'Kp = 1.5、Ki = 0.4（直接代物理量数值）',
          'Kp = 11.3、Ki = 3016（Kp = 2π·1200·1.5e-3 ≈ 11.3，Ki = 2π·1200·0.4 ≈ 3016）',
          'Kp = 5、Ki = 100（凭经验拍脑袋）',
          'Kp = 0.001、Ki = 0.0004（用 ms/mΩ 单位算）',
        ],
        correct: 1,
        hint: 'ω_bw = 2π·f_bw = 2π·1200 ≈ 7540 rad/s；Kp = ω_bw·L = 7540·0.0015 ≈ 11.3；Ki = ω_bw·R = 7540·0.4 ≈ 3016。实际工程取 0.5-0.7 倍（Kp ≈ 7、Ki ≈ 2000）留 PWM 延迟 + 滤波器相位余量。这是 SISO 极点配置（Ki/Kp = R/L 让 PI 零点抵消电气极点），是电机控制最关键的解析整定公式——比 Z-N 试错快 10 倍。',
      },
    },
    {
      id: 'tune-current',
      title: '先调电流环',
      goal: '把"从内向外"整定的第一步落地：解析公式 + 阶跃验证',
      action: '把外面两层屏蔽（位置环 Kp=0、速度环 Kp=0、外部直接给 Iq* 阶跃），按 Kp = ω_bw·L、Ki = ω_bw·R 算出起步值，调电流环 Kp / Ki。',
      observe: '理想电流环阶跃响应：上升时间 < 1 ms，超调 < 10%，稳态无误差。如果实际响应慢于解析值 50%——说明 ADC/滤波器相位延迟太大，应进一步降 Kp 而不是加 Ki。',
      whyMatters: '电流环不稳，外面任何层都白搭——外环给的 Iq* 命令送进一个不靠谱的电流环，电机实际输出转矩就是噪声。STM32 实测整定流程：① 把 Iq* 设成 1A 阶跃，用 SWO 或串口送 Iq 实测值出来用上位机看；② 先 Ki=0 把 Kp 推到出现轻微振荡（临界 Kp）；③ Kp 取临界的 0.5 倍；④ 加 Ki 让稳态误差 < 1%。** 注意电流环禁加 Kd**：D 项 ∝ ΔI/Ts，把 ADC 采样噪声放大成可听啸叫；要加 D 必先配一阶低通（截止 ≤ 电流环带宽的 1/5）。',
    },
    {
      id: 'tune-speed',
      title: '再调速度环 + 速度反馈滤波',
      goal: '电流环稳定后接入速度环，并处理"低分辨率编码器速度抖动"',
      action: '保持电流环参数不动，打开速度环，位置环仍清零。给小速度阶跃（100 → 500 rpm）调速度环 Kp / Ki。同时观察速度反馈——通常需要一阶低通把编码器抖动滤掉。',
      observe: '速度跟踪上升时间 5-10 ms，超调 < 15%，无持续振荡。如果出现 200-500 Hz 范围振荡 → 速度环 Kp 偏大；稳态有误差 → Ki 太小；高频毛刺 → 速度反馈滤波不够。',
      whyMatters: '速度环带宽必须在电流环 1/5 到 1/10：电流环 1 kHz → 速度环 100-200 Hz。速度反馈的两种实现各有坑：① 差分法 ω = (θ[k] − θ[k-1])/Ts — 简单但 1024 PPR 编码器在 1 kHz 采样、100 rpm 转速下每周期只增加 1-2 计数，量化噪声 ±50% — 必须配一阶低通（截止频率 ≤ 速度环带宽的 5 倍）；② M/T 法 — 高速用 M（计数）+ 低速用 T（测周期），平滑覆盖宽速域。压缩机用 BEMF 观测器估速度时直接拿 PLL 输出 ω̂，已经天然滤波过，但 PLL 带宽本身就限制了速度环带宽——这是无感 FOC 速度环带宽很难做高的根本原因。',
      quiz: {
        q: '示波器看到速度响应在 300 Hz 持续振荡，已知电流环带宽是 1 kHz、速度环带宽设为 300 Hz、PLL 带宽 200 Hz。最可能的根因？',
        options: [
          '电流环 Kp 太小（理论上电流环带宽 1 kHz > 速度环 300 Hz，不应是这里）',
          '速度环带宽 = 电流环带宽 / 3.3，违反 "1/5-1/10" 经验法则，必振荡',
          '编码器分辨率不够',
          'PWM 频率太高',
        ],
        correct: 1,
        hint: '速度环 300 Hz 与电流环 1 kHz 比值 = 1:3.3，严重违反 1:5~10 经验。振荡频率 300 Hz 正好等于速度环带宽——指针指向速度环本身。修法：速度环 Kp 减半，振荡频率会下降到 150 Hz 然后消失。如果觉得速度响应不够快，正确路径是先提高电流环带宽（提 PWM 频率或换更低延迟 ADC）。',
      },
    },
    {
      id: 'anti-windup',
      title: '抗积分饱和（实战必填）',
      goal: '掌握抗饱和的两种主流实现，写进 STM32 PI 模板',
      action: '想象速度环 PI：Iq* 输出限幅 ±I_MAX = ±15A。如果速度环 Ki = 50、误差持续 100 rpm、限幅 15A，多久 I 项就把输出"撞死"在 15A？',
      observe: '撞限期间如果不做抗饱和，I 项继续累加 Σe·Ts·Ki；解除限幅时输出仍 = Kp·e + 巨大 I 项 → 实际电机过冲到 30A 量级，过流保护立刻跳。',
      whyMatters: '两种主流抗饱和实现：' +
        ' (1) 条件冻结：if (out_unsat > MAX || out_unsat < MIN) integral += 0; else integral += error * Ts; — 写起来 1 行，但 PI 在限幅边界附近"半开半关"积分容易卡死。' +
        ' (2) Back-calculation：out_sat = clamp(out_unsat, MIN, MAX); integral += (error - Kt*(out_unsat - out_sat)) * Ts;  其中 Kt = Ki/Kp 是反推时间常数，让积分按"撞限多少"自动回退。这是 STM32 工业模板的标准做法，比条件冻结收敛快 30%。' +
        ' 完整 PI step（速度环、Ts = 1 ms）：' +
        ' float err = ref - meas;' +
        ' float out_unsat = Kp * err + integral;' +
        ' float out_sat = clamp(out_unsat, -I_MAX, I_MAX);' +
        ' integral += (Ki * err - Kt * (out_unsat - out_sat)) * Ts;  ' +
        ' 限幅 + 抗饱和必须成对出现——只要 Ki>0 且输出有上下界（PWM、电流、转速），抗饱和不开就是定时炸弹。',
    },
    {
      id: 'tune-position',
      title: '最后调位置环（按需启用）',
      goal: '接入最外层位置环完成整定，并理解为什么位置环慎用 I 项',
      action: '速度环稳定后打开位置环（仅伺服/机器人/EV 倒车需要）。先用小斜坡位置指令（不是大阶跃！），调位置环 Kp。位置环通常只用 P（PD 结构），I 慎用。',
      observe: '位置跟踪误差小、回零无超调；典型设计目标稳态误差 < 0.05°。',
      whyMatters: '位置环 Kp 大约是速度环带宽的 1/5：速度环 100 Hz → 位置环 10-20 Hz。位置环加 I 项的最大坑：如果机械卡死（如机器人关节撞到障碍、CNC 主轴堵刀），位置永远到不了 → I 项持续积累 → 解除卡死瞬间 I 项的巨量值变成"速度参考飞车" → 关节砸出去。所以工业伺服位置环常用"纯 P + 速度前馈"（v_ff = dθ_ref/dt 直接馈到速度环参考），消除位置稳态误差不靠 I。压缩机和家电变频不需要位置环——客户在乎"转得稳"不在乎"停在第几度"。',
    },
    {
      id: 'outer-too-fast',
      title: '外环过快振荡（反面教材）',
      goal: '直观看到"外环超过内环带宽"的后果',
      action: '左上"实验预设"选 "速度环参数过大导致电机振荡"。',
      observe: '速度响应曲线出现持续高频振荡（接近速度环带宽频率），Iq 命令在电流上下限之间来回撞，位置一直追不到目标。',
      whyMatters: '这是新手最常见翻车现场：速度环 Kp 调得激进想追快响应，结果外环命令变化频率高过内环跟踪能力 → 内环永远落后 → 误差不收敛而是来回摆。修法：速度环 Kp 减半，或反过来先把电流环带宽提高（如果 ADC 和 PWM 频率允许）。注意现场区分技巧——振荡频率 ≈ 速度环带宽，说明是速度环本身；振荡频率 ≈ 电流环带宽，说明是电流环；振荡频率 ≈ 机械固有频率（如丝杠 100 Hz、皮带 50 Hz），说明是机械共振，要加陷波滤波。',
      presetId: 'speed-loop-osc',
    },
    {
      id: 'output-clamp-incremental',
      title: '限幅 + 增量式 PID',
      goal: '每层输出按物理量限，并理解增量式 PID 怎么摆脱 Ts 依赖',
      action: '设想：位置环 Kp_p = 10，给 360° 位置阶跃（误差 360°），速度参考 = 10 × 360 = 3600 rpm。如果电机最大 2000 rpm 会发生什么？',
      observe: '速度参考超过电机能力 → 速度环算出超大 Iq*（被速度环输出限幅截到 I_MAX）→ 电流环命令撞电流上限 → 电机用最大加速度跑，但永远追不上虚假 3600 rpm 目标 → 积分饱和。',
      whyMatters: '每层输出必须按物理能力限幅：位置环输出 ≤ SPEED_MAX（rpm），速度环输出 ≤ I_Q_MAX（A），电流环输出 ≤ Udc/√3 · 0.95（V）。同时 PI 控制器必须做 anti-windup。增量式 PID 是另一招：' +
        ' /* 位置式：u[k] = Kp·e[k] + Ki·Ts·Σe + Kd·(e[k]-e[k-1])/Ts */ ' +
        ' /* 增量式：Δu[k] = Kp·(e[k]-e[k-1]) + Ki·Ts·e[k] + Kd·(e[k]-2e[k-1]+e[k-2])/Ts; u[k] = u[k-1] + Δu[k]; */ ' +
        ' 增量式优点：① 无积分项变量（不会一次性 windup）；② PWM 频率切换时 Ki·Ts 乘积稳定，不用重算 Ki；③ 故障后切回手动控制无 bump。代价是 D 项噪声放大且离散化误差累积——电流环（高频高噪声）不适合用增量式，速度环 / 位置环更适合。压缩机控制器 PWM 16k → 20k 切换时电流环若用位置式必须重新整定，用增量式则 0 改动。',
    },
    {
      id: 'recap',
      title: '回到全局',
      goal: '把三闭环接回 FOC 全链路，落成新机型 SOP',
      action: '回顾：拿到一台新电机要跑伺服，整体调试顺序是什么？',
      observe: '答：① 极对数 + 编码器零位（模块 01）② 逆变器 PWM 互补 + 死区 + BKIN 保护（模块 08）③ ADC 校零 + Clarke 验证 ④ 电流环按 ω_bw·L 起步 + 阶跃整定 ⑤ 速度环带宽 = 电流环 / 5~10 + 反馈滤波 ⑥ 位置环带宽 = 速度环 / 5（仅按需）⑦ 输出限幅 + 抗积分饱和 ⑧ 必要时加速度/速度前馈降跟踪误差。',
      whyMatters: '这就是工业伺服调试的标准 SOP，任何机械臂关节、CNC 主轴、AGV 轮毂电机、空调压缩机都用同一套流程。整定靠纪律不靠玄学：内→外严格顺序，带宽逐层降 5-10 倍，每层输出限幅，PI 加抗饱和，PWM 频率切换用增量式。下一模块进入无感 FOC——处理"没有编码器时角度从哪儿来"，这是把整套控制环架在更不可靠的反馈源上的挑战。',
      quiz: {
        q: '机器人关节伺服遇到"卡死后突然飞车"事故，最可能的代码缺陷是？',
        options: [
          '电流环 Kp 太大',
          '位置环加了 I 项但没做 anti-windup，机械卡死期间 I 项无限累积',
          '编码器分辨率不够',
          'PWM 频率太低',
        ],
        correct: 1,
        hint: '"飞车"= 速度参考瞬间巨大值。卡死时位置误差恒定不为零 → 位置环 I 项持续累加 → 解除卡死瞬间 I 项变速度参考飞车。这是工业伺服位置环禁加 I 项的核心理由；若要加 I 项必须严格 back-calculation 抗饱和。机器人安全标准 ISO 10218 把这一条列为强制审查项。',
      },
    },
  ],
  pitfalls: [
    {
      id: 'tune-outside-first',
      label: '试错：先调位置环 Kp 到 20',
      symptom: '位置剧烈过冲然后振荡不收敛；电流环 Iq* 命令疯狂跳变',
      why: '内环（电流环 / 速度环）还没整定，里面响应慢又不准；外面位置环 Kp 给得越大，越是用一个"快指令"驱动一个"慢系统"，必然振荡。生产铁律：先把电流环阶跃响应调到上升 < 1 ms，再调速度环到 100 Hz 带宽，最后才碰位置环。顺序错了就是一晚上白干。',
    },
    {
      id: 'same-bandwidth',
      label: '试错：速度环 Kp 推到接近电流环带宽',
      symptom: '速度持续高频振荡，Iq* 在电流上下限来回撞；振荡频率 ≈ 速度环带宽',
      why: '外环带宽 ≥ 内环带宽时，外环命令变化频率高过内环跟踪能力 → 内环永远落后 → 误差不收敛只是来回摆。经验法则：外环 ≤ 内环 / 5。这条法则在电压环 + 电流环（DC-DC）、速度环 + 电流环（伺服）、位置环 + 速度环上都同样成立——它是级联控制的物理上限，不是建议值。',
      presetId: 'speed-loop-osc',
    },
    {
      id: 'no-output-clamp',
      label: '试错：位置环输出不限幅 + 大位置阶跃',
      symptom: '电机起步瞬间过流保护跳闸；偶尔触发 BKIN 直接关 PWM',
      why: 'Kp_p × 360° 误差 = 数千 rpm 的速度参考，远超电机能力 → 速度环输出超大 Iq* → 撞过流保护。即使没撞保护，积分饱和也会在到位瞬间过冲。修复：位置环输出 clamp 到 ±SPEED_MAX，速度环输出 clamp 到 ±IQ_MAX，电流环输出 clamp 到 ±0.95·Udc/√3；每个 clamp 都配 anti-windup（输出饱和时 I 项停止累加或反向退积）。',
    },
    {
      id: 'ts-mismatch',
      label: '试错：把 PWM 从 16 kHz 升到 20 kHz 不重算位置式 Ki',
      symptom: '原本健康的电流环曲线变成振荡或拖沓，移植代码完全不能用',
      why: '位置式 I = Ki·Ts·Σe，Ts 是参数的"刻度尺"。从 16 k 升到 20 k（Ts 从 62.5 μs 缩到 50 μs）等效 Ki 缩 0.8 倍 → 积分等效增益变小 → 稳态收敛慢；如果 Kp 同时变化方向相反就直接振荡。修复有二：① 等比例调整 Ki（保持 Ki·Ts 不变）；② 改用增量式 PID 把 Ts 内嵌进公式，从根上消除 Ts 显式依赖。后者是工业 PID 库（如 TI motorware、ST FOC SDK）的标准选择。',
    },
  ],
  nextModuleHook: '现在你能让三闭环协同稳定跑了，并且知道抗饱和、增量式 PID、按物理量限幅、速度反馈滤波四道工业级细节。下一步：10 无感 FOC——把"假设有编码器"的拐杖丢掉，看反电动势观测器和 PLL 怎么从相电压/相电流里反推出转子角度 θe。',
  nextModuleHookEn: 'You can now run the three-loop cascade stably and know four industrial details: anti-windup, incremental PID, saturation by physical units, and speed-feedback filtering. Module 10 (sensorless FOC) discards the "assume an encoder" crutch and shows how the back-EMF observer and PLL recover rotor angle θe from phase voltages and currents.',
};
