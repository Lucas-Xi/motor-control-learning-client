import type { ModuleWalkthrough } from './types';

/**
 * 06 FOC 全流程 —— 把前 5 个模块（电机基础 / 三相 / Clarke / Park / PID）串成一条
 * 真实在 STM32 PWM 中断里跑的流水线：ADC 采样 → Clarke → Park → 电流 PI → 反 Park →
 * SVPWM → 写 CCR。
 *
 * 教学重点：
 *   ① "中断里跑什么、低频任务跑什么"——这是嵌入式工程师上手 FOC 的第一道坎；
 *   ② 采样延迟 / 角度滞后这两个工业常见误差源对电流环的实际影响；
 *   ③ 高速下的 dq 交叉耦合和解耦前馈；
 *   ④ 角度误差 Δθ 引起的 Id/Iq 串扰——产线诊断"编码器零位是否对齐"的实战手段。
 */
export const focFlowWalkthrough: ModuleWalkthrough = {
  moduleId: 'foc-flow',
  bigPicture: 'FOC = 每个 PWM 周期跑一遍的纯函数流水线；学会拆解每段，故障定位就只是几行代码的事。',
  successCriteria: [
    '能背出 FOC 每个 PWM 周期里依次发生的 7 件事（采样 → Clarke → Park → PI → 反 Park → SVPWM → 写 CCR）',
    '能解释为什么 PI 要放在 dq 域而不是 abc 域（直流量 vs 交流量，零稳态误差）',
    '能定位电流环 3 类典型故障：振荡（Kp/延迟）、串扰（Δθ）、高速发软（缺解耦）',
    '能判断哪些代码必须放在 ADC 中断里、哪些必须放到低频任务里（按时间预算 < 10μs / PWM 周期）',
    '理解 ADC 采样点必须放在 PWM 中点的硬件原因（电流纹波最小）',
  ],
  steps: [
    {
      id: 'pipeline-map',
      title: '看流水线',
      goal: '建立"7 段流水线"的整体心智模型',
      action: '点击顶部"数据流水线"标签，看 6 个步骤节点：abc 采样 → Clarke → Park → 电流 PI → 反 Park → SVPWM。点中任一节点可锁定探针看输入/输出。',
      observe: '每个节点上方是该步骤的精确公式，下方是工程意义；点节点后右侧探针显示该段的实时输入/输出数值。',
      whyMatters: '工业 FOC 调试的第一原则就是"按段冻结"——先 ADC 校零、再 Clarke、再 Park、再电流环。把每段看成独立的纯函数，错了就知道在哪段；如果整段往里塞业务逻辑，调试时只能靠运气。',
    },
    {
      id: 'interrupt-budget',
      title: '中断预算',
      goal: '理解 PWM 16kHz 下中断里能做什么不能做什么',
      action: '看代码示例（concept 区底部 codeExample），数一下 ISR 里一共做了几步：采样 → 读角 → Clarke → Park → PI → 解耦 → 限幅 → 反 Park → SVPWM → 写 CCR。',
      observe: '16kHz PWM 单周期 62.5μs；ARM Cortex-M4F + FPU 跑完这一套大约 4-6μs，占 CPU 不到 10%。',
      whyMatters: '中断里**只放快环**（电流环 + SVPWM）。printf / HAL_Delay / 浮点除法 / malloc 都不能放——一个超时就 PWM 错节拍，桥臂直通烧管子。速度环、位置环、通信、日志全部进低频任务（1kHz Timer 或 RTOS task）。',
      quiz: {
        q: '在 16kHz PWM 中断里调用 HAL_Delay(1) 会发生什么？',
        options: [
          '什么都不会发生',
          '中断耗时 1ms 远超 62.5μs 周期，下一次 PWM 中断错过，桥臂时序错乱，可能直通',
          '只是稍微慢一点',
          'STM32 自动跳过',
        ],
        correct: 1,
        hint: 'HAL_Delay 内部是 SysTick 阻塞循环，最小粒度 1ms。在 62.5μs 周期里 delay 1ms 等于错过 16 个 PWM 周期——硬件上是灾难。中断里禁止任何阻塞调用。',
      },
    },
    {
      id: 'sample-timing',
      title: 'ADC 采样点',
      goal: '理解为什么 ADC 触发要放在 PWM 中点',
      action: '切回"电流环响应"标签。把"采样延迟"从 0 拉到 4 个周期，观察 Iq 阶跃响应的变化。',
      observe: '采样延迟越大，相同 Kp 下振荡越明显；延迟 4 周期时几乎无法稳定。',
      whyMatters: '硬件上 ADC 触发由 TIM1 中心对齐计数器达到 ARR 时产生；那一刻所有桥臂上下管都处于稳定状态（要么 000 要么 111），电流处于"纹波谷"，采样误差最小。如果采样点放在开关边沿附近，电流正在剧烈跳变，ADC 读到的是含噪声的瞬态值，等效相位延迟 → 电流环必须降带宽。',
    },
    {
      id: 'angle-error',
      title: '角度误差',
      goal: '看清 Δθ 怎么把 Iq 漏到 Id',
      action: '保持 Iq 阶跃 = 5A、Id 指令 = 0A、Δθ = 0。运行后把"角度误差 Δθ"从 0 慢慢拉到 +15°。',
      observe: 'Iq 阶跃时 Id（蓝线）会被拉起来一个峰值；稳态时 Id 不再是 0 而是约 1-2 A。Iq 也达不到 5A。',
      whyMatters: '这就是著名的"dq 串扰"。Park 投影 Id = cos(θ+Δθ)·Iα + sin(θ+Δθ)·Iβ 中的 Δθ 让一部分 Iq 投到了 Id 轴上。产线诊断口诀："Iq 阶跃 Id 翘 → 编码器零位错"。修复 = 重做对齐流程，不是改 PI 参数。',
      quiz: {
        q: '现场调 FOC 发现 Iq 命令 5A 但实测 Id ≈ 1.3A、Iq ≈ 4.8A，最优先该查什么？',
        options: [
          '电流环 Kp 太小',
          '编码器零位 / Park 角度，先做对齐流程；改 PI 是按错了药方',
          'ADC 采样点',
          'PWM 频率太低',
        ],
        correct: 1,
        hint: 'Id 不为 0 是 Park 投影出错的几何后果，与 PI 增益无关。Δθ ≈ atan(Id/Iq) ≈ 15° 是典型的编码器零位偏移量级。',
      },
    },
    {
      id: 'cross-coupling',
      title: '高速耦合',
      goal: '理解高速下 vd / vq 之间的交叉耦合项',
      action: '把"电频率 ω"从 0 拉到 400 Hz（接近压缩机额定）。给 Iq 阶跃 5A，观察 Iq 上升过程。',
      observe: 'ω = 0 时 Iq 干净上升；ω = 400 Hz 时 Iq 上升过程带"晃动"或下垂，Id 也跟着波动。',
      whyMatters: 'PMSM dq 模型有交叉项：vd = R·id + Ld·did/dt − ω·Lq·iq；vq = R·iq + Lq·diq/dt + ω·(Ld·id + ψf)。速度越高 ω·L·i 越大，PI 输出要先"对抗"这一项才能控住电流。工业方案是加**解耦前馈**：在 PI 输出后直接减 ω·Lq·iq、加 ω·(Ld·id+ψf)，让 PI 只对剩下的小扰动负责。',
    },
    {
      id: 'pi-tuning',
      title: '调电流环',
      goal: '用 ω_bw = Kp/L、Ki/Kp = R/L 两条公式判断 PI 是否合理',
      action: '当前电机参数 Rs ≈ 0.2 Ω、Ld ≈ 1 mH。目标电流环带宽 1 kHz。算一下 Kp = ω_bw·L = 6283 × 0.001 ≈ 6.3，Ki = ω_bw·R = 6283 × 0.2 ≈ 1257。先把 Kp 拉到 6、Ki 拉到 1200 试。',
      observe: 'Iq 阶跃约 1 ms 内进入 5% 误差带，几乎无超调；这是带宽 1kHz 的典型表现。',
      whyMatters: 'Ki/Kp = R/L 让 PI 零点抵消电机电气极点 R/L，剩下纯一阶系统，闭环带宽就是 Kp/L。这是电机控制最重要的一条解析整定公式——比试错调参快 10 倍。注意采样延迟 / 滤波器额外的相位裕度损失，实际取 0.5-0.7 倍解析值更稳。',
      quiz: {
        q: '想要电流环带宽 2 kHz，电机 L = 0.5 mH、R = 0.1 Ω，Kp 应取多少？',
        options: ['Kp = 6.3', 'Kp ≈ 4π × 0.0005 ≈ 6.28', 'Kp = 100', 'Kp = 0.5'],
        correct: 1,
        hint: 'Kp = ω_bw × L = 2π × 2000 × 0.0005 ≈ 6.28。低电感电机要小 Kp，高电感要大 Kp——和直觉相反，因为带宽 = Kp/L。',
      },
    },
    {
      id: 'voltage-saturation',
      title: '电压饱和',
      goal: '理解电压限幅圆与 SVPWM 线性区的关系',
      action: '把"电压限幅"从 240 V 拉到 80 V，Iq 阶跃 = 10A，运行。',
      observe: 'Iq 无法跟到 10A，稳态卡在 4-5 A；PI 积分项会一直涨（如果没抗饱和）。',
      whyMatters: 'SVPWM 线性区上限是 Udc/√3 ≈ 0.577 Udc。310 V 母线对应约 179 V 线性区。当 PI 输出 √(vd²+vq²) > 这个值，硬件就只能输出 179 V，电流跟不上指令。两种应对：① 抗积分饱和（PI 输出撞限时冻结积分）；② 给 Id 注负值进入弱磁——这是下一个模块要学的。',
    },
    {
      id: 'recap',
      title: '回到全局',
      goal: '把 FOC 流水线接回硬件视角',
      action: '回顾：一个完整的 PWM 中断里，ADC 触发在哪个时刻？写 CCR 后什么时候生效？',
      observe: '答：ADC 在 TIM1 计数到 ARR（PWM 中点）注入触发；CCR 写入在 update 事件预装载，**下一个** PWM 周期才生效——所以电流环天然带一个 PWM 周期的延迟。',
      whyMatters: '理解这一个周期的延迟是 FOC 稳定性的关键：电流环带宽不能超过 1/(2π × PWM 周期) 的一半左右，否则采样-计算-生效的总延迟耗光相位裕度。16 kHz PWM 理论上限 ~2.5 kHz，实际工程 1-1.5 kHz 是稳态甜区。',
      quiz: {
        q: 'PWM 16 kHz、ADC 注入在 PWM 中点触发，电流环写 CCR 后实际生效时间是？',
        options: [
          '立即生效',
          '下一个 PWM 周期开始时生效（约 62.5 μs 后）',
          '下一个采样点',
          '永远滞后 1ms',
        ],
        correct: 1,
        hint: 'TIM1 的 CCR 寄存器有预装载（preload）功能，写入后等到下一次 update 事件（PWM 周期末）才装载到比较器。这一周期延迟必须放进电流环的延迟预算里。',
      },
    },
  ],
  pitfalls: [
    {
      id: 'printf-in-isr',
      label: '试错：中断里加 printf 调试',
      symptom: 'PWM 输出错节拍、电机异响或母线电压报警',
      why: 'printf 走 USART/SWO，单字符 ~10μs，单次调用 100μs+，远超 PWM 周期 62.5μs。下一次中断到来时上一次还没退出，中断嵌套或丢失，桥臂时序乱套。生产代码 ISR 里只允许：寄存器读写、纯算术、限幅。',
    },
    {
      id: 'sample-at-edge',
      label: '试错：ADC 采样点放在 PWM 边沿',
      symptom: 'ia/ib 噪声极大，电流环必须降到 200 Hz 带宽才不振荡',
      why: '开关边沿瞬间桥臂在切换，电流正经历 di/dt 最大的瞬态，外加 IGBT/MOS 切换噪声耦合进 ADC。读到的是"瞬态值 + 共模噪声"，等效引入大相位延迟。修复 = 用 TIM1 update 事件（PWM 中点）触发 ADC 注入，让采样窗对齐"开关稳态期"。',
    },
    {
      id: 'wrong-pole-pairs',
      label: '试错：极对数从 4 改成 8 不重新校准',
      symptom: 'θe 速度翻倍，Park 投影完全错乱；Iq 指令变正负震荡，电机抖动卡转',
      why: 'θe = polePairs × θm，极对数错就让 dq 坐标旋转速率错；PI 在"漂移的旋转系"里控制，Iq 命令一会儿投到 +d 轴一会儿投到 −d 轴。这是出厂调试时"上电不转"最常见的根因，不是 PI 不好。',
    },
    {
      id: 'no-decoupling-highspeed',
      label: '试错：高速段不加 dq 解耦前馈',
      symptom: '低速好好的电机，转速一过 3000 rpm 电流环开始晃，Iq 跟踪带稳态振荡',
      why: '高速下 ω·Lq·iq 项数十伏量级，PI 输出全花在抵消这一项，剩下的余量不够动态响应。加前馈 vd -= ω·Lq·iq、vq += ω·(Ld·id + ψf) 让 PI 只处理建模残差，性能立刻回来。空调压缩机 6000 rpm + 高极对数场景必加。',
    },
  ],
  nextModuleHook: '现在你能跑一遍完整 FOC 流水线了。最后一段"反 Park → SVPWM"实际上是把 Uα/Uβ 翻译成 6 个桥臂开关状态——下一模块 SVPWM 详解扇区判断、T1/T2/T0 时间分配，以及为什么 SVPWM 比 SPWM 多 ~15% 母线利用率。',
};
