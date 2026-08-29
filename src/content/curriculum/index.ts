import type { ModuleId } from '../../simulation/engine/types';

/**
 * 课程主线（Curriculum Track）
 *
 * 把 16 模块 + 10 道实验挑战 + 9 个深度 walkthrough 串成 4 条主题路径，
 * 让自学的初级工程师可以按"7 天 FOC 入门"或"压缩机变频器一条龙"之类的
 * 任务目标推进，而不是面对 16 个并列模块按钮无所适从。
 *
 * 每条路径含 8-12 个 checkpoint；checkpoint 在不同路径之间可复用。
 * checkpoint 完成判定走"自报式"——学员在 `CurriculumPanel` 点"标记完成"，
 * 我们只是在 localStorage 记一个 Set。是否真的看懂由学员自己负责，
 * 这套设计参考 Coursera / GitHub Learning Lab 的轻量进度条思路。
 */

/** checkpoint 的完成要求语义；当前 UI 只渲染文案，不做强制校验 */
export type CheckpointRequirement =
  | { kind: 'read'; label: string; labelEn?: string }                          // 通读模块内容
  | { kind: 'walkthrough-step'; step: number; label: string; labelEn?: string } // 走到 walkthrough 第 N 步
  | { kind: 'walkthrough-finish'; label: string; labelEn?: string }            // 走完 walkthrough 整条
  | { kind: 'challenge'; challengeId: string; label: string; labelEn?: string } // 通关挑战 X
  | { kind: 'experiment-preset'; presetId: string; label: string; labelEn?: string }; // 套用某实验预设观察

export interface CurriculumCheckpoint {
  /** 在所属路径内唯一；用 `${pathId}::${checkpointId}` 作完成集合的 key */
  id: string;
  /** 学员看到的中文短标题 */
  title: string;
  /** 英文短标题；en-US 下缺失时回退中文 */
  titleEn?: string;
  /** 一句话目标，60 字内 */
  goal: string;
  /** 英文一句话目标；en-US 下缺失时回退中文 */
  goalEn?: string;
  /** 跳转到的核心模块 */
  moduleId: ModuleId;
  /** 可选：点 checkpoint 时自动 applyExperimentPreset 的 presetId */
  presetId?: string;
  /** 可选：建议通关的挑战 id（来自 src/content/challenges） */
  optionalChallengeIds?: string[];
  /** 可选：建议查看的 walkthrough 步骤区间 [start, end]，1-indexed */
  optionalWalkthroughStepRange?: [number, number];
  /** 完成要求文案（多条 OR 关系）；至少 1 条 */
  requirements: CheckpointRequirement[];
}

export type CurriculumTone = 'foc-fundamentals' | 'compressor-product' | 'debugging' | 'power-electronics';

export interface CurriculumTrack {
  id: string;
  title: string;
  /** 英文标题；en-US 下缺失时回退中文 */
  titleEn?: string;
  /** Hero 卡上一句话副标题 */
  tagline: string;
  /** 英文副标题；en-US 下缺失时回退中文 */
  taglineEn?: string;
  /** 100 字以内的路径介绍 */
  description: string;
  /** 英文路径介绍；en-US 下缺失时回退中文 */
  descriptionEn?: string;
  /** 估计耗时，文案 */
  durationHint: string;
  /** 英文估计耗时；en-US 下缺失时回退中文 */
  durationHintEn?: string;
  /** 给谁看的 1 行画像 */
  audience: string;
  /** 英文受众画像；en-US 下缺失时回退中文 */
  audienceEn?: string;
  /** 视觉令牌：tone → accent.* class（仅控制进度环 / 按钮高亮色） */
  tone: CurriculumTone;
  checkpoints: CurriculumCheckpoint[];
}

/**
 * A. FOC 入门 7 天
 * 目标：从"为什么三相电流能合成旋转磁场"一路到"全闭环 FOC 跑起来"。
 * 适合刚拿到 STM32 + PMSM 的新手；不涉及无感 / 弱磁 / 制冷台架。
 */
const trackFocFundamentals: CurriculumTrack = {
  id: 'foc-fundamentals',
  title: 'A. FOC 入门 7 天',
  titleEn: 'A. FOC Fundamentals in 7 Days',
  tagline: '从电机结构到全闭环 FOC，理论 + 仿真 + 上板',
  taglineEn: 'From motor structure to fully closed-loop FOC: theory + simulation + hardware',
  description:
    '面向第一次接触 FOC 的工程师：先把“电角度 / 机械角度 / 极对数”搞清楚，再分别打通 Clarke、Park、PI、SVPWM 四个数学积木，最后串成完整的电流环 + 速度环。',
  descriptionEn:
    'For engineers meeting FOC for the first time: pin down electrical vs mechanical angle and pole pairs, work through the four mathematical building blocks (Clarke, Park, PI, SVPWM), then chain them into a complete current loop plus speed loop.',
  durationHint: '约 7 天 · 每天 1-2 小时',
  durationHintEn: 'About 7 days · 1-2 hours per day',
  audience: '刚拿到 STM32 / GD32 PMSM 开发板的新手',
  audienceEn: 'Beginners who just got an STM32 / GD32 PMSM dev board',
  tone: 'foc-fundamentals',
  checkpoints: [
    {
      id: 'mb-anatomy',
      title: '认识 PMSM 结构',
      titleEn: 'Understanding PMSM Structure',
      goal: '看清定子绕组、转子永磁体、极对数 vs 极数的区别',
      goalEn: 'Tell apart stator windings, rotor magnets, and pole pairs vs pole count',
      moduleId: 'motor-basics',
      optionalWalkthroughStepRange: [1, 3],
      requirements: [{ kind: 'walkthrough-step', step: 3, label: '走到 motor-basics walkthrough 第 3 步', labelEn: 'Reach step 3 of the motor-basics walkthrough' }],
    },
    {
      id: 'tp-rotating-field',
      title: '三相合成旋转磁场',
      titleEn: 'The Three-Phase Rotating Field',
      goal: '理解 120° 相位差 + 等幅正弦 = 等幅旋转磁场矢量',
      goalEn: 'See why 120° phase shift + equal-amplitude sines = a constant-amplitude rotating field vector',
      moduleId: 'three-phase',
      presetId: 'rotating-field',
      requirements: [{ kind: 'experiment-preset', presetId: 'rotating-field', label: '套用旋转磁场预设观察 30 s', labelEn: 'Apply the rotating-field preset and observe for 30 s' }],
    },
    {
      id: 'clarke-basic',
      title: 'Clarke 投影到 αβ',
      titleEn: 'Clarke Projection to αβ',
      goal: '把 3 个标量电流投影成 2 维静止坐标，省一个自由度',
      goalEn: 'Project three scalar currents onto the 2D stationary frame and drop one degree of freedom',
      moduleId: 'clarke-transform',
      presetId: 'clarke-balanced',
      optionalWalkthroughStepRange: [1, 2],
      requirements: [{ kind: 'read', label: '通读 Clarke 模块讲义 + 套用 balanced 预设', labelEn: 'Read the Clarke lesson and apply the balanced preset' }],
    },
    {
      id: 'park-align',
      title: 'Park 旋转到 dq',
      titleEn: 'Park Rotation into dq',
      goal: '理解 dq 同步旋转坐标系如何把交流量变成直流量',
      goalEn: 'Understand how the dq synchronous frame turns AC quantities into DC',
      moduleId: 'park-transform',
      presetId: 'park-align',
      optionalWalkthroughStepRange: [1, 3],
      requirements: [{ kind: 'walkthrough-step', step: 3, label: '走到 park-transform walkthrough 第 3 步', labelEn: 'Reach step 3 of the park-transform walkthrough' }],
    },
    {
      id: 'pid-loop',
      title: 'PI 整定与抗积分饱和',
      titleEn: 'PI Tuning and Anti-Windup',
      goal: '搞定 Kp/Ki 的物理意义，会用 anti-windup',
      goalEn: 'Nail the physical meaning of Kp/Ki and learn to use anti-windup',
      moduleId: 'pid-control',
      presetId: 'pi-balanced',
      optionalChallengeIds: ['pid-fast-no-overshoot', 'pid-antiwindup'],
      requirements: [{ kind: 'challenge', challengeId: 'pid-fast-no-overshoot', label: '通关：电流环 PI 4 ms 无超调', labelEn: 'Pass the challenge: current-loop PI settles in 4 ms with no overshoot' }],
    },
    {
      id: 'foc-chain',
      title: 'FOC 全链路串通',
      titleEn: 'Chaining the Full FOC Pipeline',
      goal: '看采样 → Clarke → Park → PI → 反 Park → SVPWM 串成闭环',
      goalEn: 'Watch sampling → Clarke → Park → PI → inverse Park → SVPWM close the loop',
      moduleId: 'foc-flow',
      presetId: 'foc-current-loop',
      optionalChallengeIds: ['foc-fast-iq-tracking'],
      optionalWalkthroughStepRange: [1, 5],
      requirements: [{ kind: 'walkthrough-finish', label: '走完 foc-flow 整条 walkthrough', labelEn: 'Finish the entire foc-flow walkthrough' }],
    },
    {
      id: 'svpwm-sector',
      title: 'SVPWM 7 段扇区',
      titleEn: 'SVPWM Seven-Segment Switching',
      goal: '理解扇区判定 + T1/T2/T0 时间分配 + 调制比上限',
      goalEn: 'Understand sector identification, T1/T2/T0 time allocation, and the modulation-index ceiling',
      moduleId: 'svpwm',
      presetId: 'svpwm-sector',
      optionalChallengeIds: ['svpwm-utilization'],
      requirements: [{ kind: 'challenge', challengeId: 'svpwm-utilization', label: '通关：SVPWM 母线利用率达标', labelEn: 'Pass the challenge: SVPWM DC-bus utilization on target' }],
    },
    {
      id: 'inverter-deadtime',
      title: '逆变器与死区效应',
      titleEn: 'Inverter Dead-Time Effects',
      goal: '认识桥臂、PWM、死区如何影响相电压波形',
      goalEn: 'See how bridge legs, PWM, and dead time shape the phase-voltage waveform',
      moduleId: 'inverter',
      presetId: 'inverter-deadtime',
      optionalWalkthroughStepRange: [1, 3],
      requirements: [{ kind: 'experiment-preset', presetId: 'inverter-deadtime', label: '套用 deadtime 预设对比波形', labelEn: 'Apply the deadtime preset and compare waveforms' }],
    },
    {
      id: 'loops-three',
      title: '三闭环带宽配比',
      titleEn: 'Cascaded Loop Bandwidth Ratios',
      goal: '电流环 > 速度环 > 位置环 10 倍带宽间隔的设计原则',
      goalEn: 'The design rule of 10x bandwidth spacing: current loop > speed loop > position loop',
      moduleId: 'control-loops',
      presetId: 'loops-stable',
      requirements: [{ kind: 'walkthrough-finish', label: '走完 control-loops walkthrough', labelEn: 'Finish the control-loops walkthrough' }],
    },
  ],
};

/**
 * B. 压缩机变频器一条龙（产品向）
 * 目标：以做出一个能跑的空调 / 冰箱变频器为目标，串入启动状态机、HFI、弱磁、制冷台架。
 */
const trackCompressorProduct: CurriculumTrack = {
  id: 'compressor-product',
  title: 'B. 压缩机变频器一条龙',
  titleEn: 'B. End-to-End Compressor Inverter Drive',
  tagline: '从电机参数到 V/f → HFI → BEMF → 弱磁全状态机',
  taglineEn: 'From motor parameters to V/f → HFI → BEMF → field weakening, the full state machine',
  description:
    '面向做空调 / 冰箱 / 工业制冷压缩机的工程师：在 FOC 基础上叠加启动状态机（V/f → HFI → BEMF）、弱磁恒功率区、制冷台架性能验证，最后对接整机搭建工作台。',
  descriptionEn:
    'For engineers building air-conditioner, refrigerator, or industrial refrigeration compressors: layer a startup state machine (V/f → HFI → BEMF), field-weakening constant-power operation, and refrigeration bench validation on top of FOC, then bring it together in the assembly workshop.',
  durationHint: '约 10 天 · 跨电机 / 控制 / 系统',
  durationHintEn: 'About 10 days · spans motor, control, and system',
  audience: '已经会 FOC、要做压缩机产品落地的工程师',
  audienceEn: 'Engineers who already know FOC and need to ship a compressor product',
  tone: 'compressor-product',
  checkpoints: [
    {
      id: 'mb-rated',
      title: '配齐电机铭牌参数',
      titleEn: 'Get the Motor Nameplate Right',
      goal: '把极对数 / Rs / Ld / Lq / ψf / 额定电流写对',
      goalEn: 'Get pole pairs, Rs, Ld, Lq, ψf, and rated current right',
      moduleId: 'motor-basics',
      presetId: 'motor-rated',
      requirements: [{ kind: 'experiment-preset', presetId: 'motor-rated', label: '套用额定参数预设并核对单位', labelEn: 'Apply the rated-parameters preset and double-check units' }],
    },
    {
      id: 'foc-baseline',
      title: 'FOC 电流环跑稳',
      titleEn: 'Stabilize the FOC Current Loop',
      goal: '在 Iq 阶跃下取得 ≤ 4 ms 上升时间且 ≤ 10% 超调',
      goalEn: 'Achieve ≤ 4 ms rise time and ≤ 10% overshoot on an Iq step',
      moduleId: 'foc-flow',
      presetId: 'foc-output',
      optionalChallengeIds: ['foc-fast-iq-tracking'],
      requirements: [{ kind: 'challenge', challengeId: 'foc-fast-iq-tracking', label: '通关：Iq 阶跃 4 ms 内追上', labelEn: 'Pass the challenge: track an Iq step within 4 ms' }],
    },
    {
      id: 'svpwm-saturate',
      title: 'SVPWM 过调避坑',
      titleEn: 'Avoiding SVPWM Overmodulation',
      goal: '理解线性区上限 0.9069，调制比过 1 会发生什么',
      goalEn: 'Understand the 0.9069 linear-region ceiling and what happens past modulation index 1',
      moduleId: 'svpwm',
      presetId: 'svpwm-saturation',
      requirements: [{ kind: 'experiment-preset', presetId: 'svpwm-saturation', label: '套用过调预设观察波形畸变', labelEn: 'Apply the overmodulation preset and watch waveform distortion' }],
    },
    {
      id: 'inverter-clean',
      title: '逆变器死区与母线',
      titleEn: 'Inverter Dead Time and DC Bus',
      goal: '6 kHz IGBT + 2 μs 死区下 dutyA/B/C 与线电压',
      goalEn: 'DutyA/B/C and line voltages under 6 kHz IGBT switching + 2 μs dead time',
      moduleId: 'inverter',
      presetId: 'inverter-clean',
      requirements: [{ kind: 'read', label: '通读逆变器讲义并对照 demo 波形', labelEn: 'Read the inverter lesson against the demo waveforms' }],
    },
    {
      id: 'startup-vf',
      title: 'V/f 启动 → 速度合拍',
      titleEn: 'V/f Startup to Speed Handover',
      goal: '让压缩机从 0 转上到 3000 rpm 切换到 BEMF 闭环',
      goalEn: 'Ramp the compressor from 0 to 3000 rpm and hand over to BEMF closed loop',
      moduleId: 'startup-statemachine',
      optionalChallengeIds: ['startup-reach-3000'],
      requirements: [{ kind: 'challenge', challengeId: 'startup-reach-3000', label: '通关：启动到 3000 rpm 不卡', labelEn: 'Pass the challenge: start to 3000 rpm without stalling' }],
    },
    {
      id: 'hfi-zero-speed',
      title: 'HFI 零速无感',
      titleEn: 'HFI Sensorless at Zero Speed',
      goal: '高频注入 + 凸极比解调，让 0-200 rpm 也能闭环',
      goalEn: 'High-frequency injection + saliency demodulation keep the loop closed down to 0-200 rpm',
      moduleId: 'hfi-sensorless',
      optionalWalkthroughStepRange: [1, 5],
      requirements: [{ kind: 'walkthrough-finish', label: '走完 hfi-sensorless walkthrough', labelEn: 'Finish the hfi-sensorless walkthrough' }],
    },
    {
      id: 'sensorless-bemf',
      title: '反电动势观测器收敛',
      titleEn: 'Back-EMF Observer Convergence',
      goal: '中高速段 BEMF + PLL 锁定，与 HFI 平滑交接',
      goalEn: 'BEMF + PLL lock at mid and high speed with smooth handover from HFI',
      moduleId: 'sensorless-foc',
      presetId: 'sensorless-lock',
      optionalChallengeIds: ['sensorless-lock-high-speed'],
      requirements: [{ kind: 'challenge', challengeId: 'sensorless-lock-high-speed', label: '通关：高速段 PLL 锁角误差达标', labelEn: 'Pass the challenge: high-speed PLL angle error on target' }],
    },
    {
      id: 'weak-id-neg',
      title: '弱磁恒功率区',
      titleEn: 'Field-Weakening Constant-Power Region',
      goal: '用负 Id 突破 V_bus 限制，把转速顶到 7200 rpm',
      goalEn: 'Break the V_bus limit with negative Id and push speed to 7200 rpm',
      moduleId: 'field-weakening',
      presetId: 'weak-negative-id',
      optionalChallengeIds: ['field-weak-7200'],
      requirements: [{ kind: 'challenge', challengeId: 'field-weak-7200', label: '通关：弱磁到 7200 rpm', labelEn: 'Pass the challenge: field-weaken to 7200 rpm' }],
    },
    {
      id: 'fridge-cop',
      title: '制冷台架性能验证',
      titleEn: 'Refrigeration Bench Performance',
      goal: '调蒸发 / 冷凝温度 / 过热度，把 COP 推到目标值',
      goalEn: 'Tune evaporation / condensation temperature and superheat to hit the COP target',
      moduleId: 'refrigeration-bench',
      presetId: 'fridge-low-load',
      optionalChallengeIds: ['fridge-cop-above-3', 'fridge-discharge-safe'],
      requirements: [{ kind: 'challenge', challengeId: 'fridge-cop-above-3', label: '通关：COP ≥ 3', labelEn: 'Pass the challenge: COP ≥ 3' }],
    },
    {
      id: 'assembly-wire',
      title: '整机搭建工作台',
      titleEn: 'Full-Drive Assembly Workshop',
      goal: '在搭建台拼出“压缩机 + 变频器 + PFC + 策略”完整电控',
      goalEn: 'Assemble a complete drive (compressor + inverter + PFC + strategy) on the workshop bench',
      moduleId: 'assembly-workshop',
      requirements: [{ kind: 'read', label: '在搭建工作台跑一次完整组合', labelEn: 'Run one full combination on the assembly workshop' }],
    },
  ],
};

/**
 * C. 调试工程师特训
 * 目标：把故障与调试模块当核心，倒推 inverter / svpwm / pid 各自的故障演练。
 */
const trackDebugging: CurriculumTrack = {
  id: 'debugging-engineer',
  title: 'C. 调试工程师特训',
  titleEn: 'C. Debug Engineer Bootcamp',
  tagline: '从波形现象倒推到根因，专治“上电就过流”',
  taglineEn: 'Trace waveform symptoms back to root causes and cure overcurrent trips at power-up',
  description:
    '面向上岗后专门救火的调试工程师：以“故障与调试”模块为大本营，分别串入相序错 / 电流偏置 / 死区不足 / PID 振荡 / 弱磁拉爆等典型故障，训练“看波形猜原因”的肌肉记忆。',
  descriptionEn:
    'For debug engineers on call to fight fires: base camp in the faults-and-debugging module, then drill typical failures such as phase-sequence errors, current-sense offset, insufficient dead time, PID oscillation, and field-weakening blow-ups, building the reflex of reading a waveform and naming the cause.',
  durationHint: '约 5-7 天 · 每天 1 个典型故障',
  durationHintEn: 'About 5-7 days · one typical fault per day',
  audience: '已经写过 FOC 但调试还在试错的工程师',
  audienceEn: 'Engineers who have written FOC but still debug by trial and error',
  tone: 'debugging',
  checkpoints: [
    {
      id: 'fault-overview',
      title: '故障与调试总览',
      titleEn: 'Faults and Debugging Overview',
      goal: '熟悉故障类别 + 现象 → 原因 → 排查路径模板',
      goalEn: 'Learn the fault taxonomy plus the symptom → cause → triage-path template',
      moduleId: 'faults-debugging',
      optionalWalkthroughStepRange: [1, 2],
      requirements: [{ kind: 'walkthrough-step', step: 2, label: '走到 faults-debugging walkthrough 第 2 步', labelEn: 'Reach step 2 of the faults-debugging walkthrough' }],
    },
    {
      id: 'fault-over-current',
      title: '过流故障',
      titleEn: 'Overcurrent Faults',
      goal: 'IGBT 上下管直通 / 短路引发的过流如何在波形里识别',
      goalEn: 'Spot shoot-through or short-circuit overcurrent in the waveforms',
      moduleId: 'faults-debugging',
      presetId: 'fault-over-current',
      requirements: [{ kind: 'experiment-preset', presetId: 'fault-over-current', label: '套用过流预设观察 Ia/Ib/Ic', labelEn: 'Apply the overcurrent preset and watch Ia/Ib/Ic' }],
    },
    {
      id: 'fault-phase-order',
      title: '相序错',
      titleEn: 'Phase-Sequence Errors',
      goal: '电机反转 / 起动失败的相序错故障定位',
      goalEn: 'Locate the phase-sequence fault behind reversed rotation or failed starts',
      moduleId: 'faults-debugging',
      presetId: 'phase-order-error',
      requirements: [{ kind: 'experiment-preset', presetId: 'phase-order-error', label: '套用相序错预设并改回正常', labelEn: 'Apply the phase-order preset and restore the correct order' }],
    },
    {
      id: 'fault-offset',
      title: '电流采样偏置',
      titleEn: 'Current-Sense Offset',
      goal: 'ADC 偏置如何让 Iq 出现工频纹波',
      goalEn: 'See how ADC offset puts line-frequency ripple on Iq',
      moduleId: 'faults-debugging',
      presetId: 'current-offset',
      requirements: [{ kind: 'experiment-preset', presetId: 'current-offset', label: '套用电流偏置预设观察 Iq', labelEn: 'Apply the current-offset preset and watch Iq' }],
    },
    {
      id: 'pid-oscillate',
      title: 'PID 振荡演练',
      titleEn: 'PID Oscillation Drill',
      goal: 'Kp / Ki 设大后的极限环振荡，对照看积分饱和',
      goalEn: 'Push Kp / Ki too high and study limit cycles versus windup',
      moduleId: 'pid-control',
      presetId: 'pi-oscillate',
      optionalChallengeIds: ['pid-antiwindup'],
      requirements: [{ kind: 'challenge', challengeId: 'pid-antiwindup', label: '通关：anti-windup 抑制饱和', labelEn: 'Pass the challenge: anti-windup tames saturation' }],
    },
    {
      id: 'inverter-deadtime-fault',
      title: '死区不足故障',
      titleEn: 'Insufficient Dead Time',
      goal: '把死区设太小看上下管直通导致的电流尖峰',
      goalEn: 'Shrink the dead time and watch shoot-through current spikes',
      moduleId: 'inverter',
      presetId: 'inverter-deadtime',
      requirements: [{ kind: 'experiment-preset', presetId: 'inverter-deadtime', label: '套用 deadtime 预设并加大死区改善', labelEn: 'Apply the deadtime preset, then widen dead time to improve it' }],
    },
    {
      id: 'svpwm-overmod',
      title: 'SVPWM 过调饱和',
      titleEn: 'SVPWM Overmodulation Saturation',
      goal: '调制比 > 1 时 dutyA/B/C 被夹断造成的电流畸变',
      goalEn: 'See current distortion when dutyA/B/C clips at modulation index > 1',
      moduleId: 'svpwm',
      presetId: 'svpwm-saturation',
      requirements: [{ kind: 'experiment-preset', presetId: 'svpwm-saturation', label: '套用 svpwm-saturation 对比线性区', labelEn: 'Apply svpwm-saturation and compare with the linear region' }],
    },
    {
      id: 'sensorless-fail',
      title: '低速无感失锁',
      titleEn: 'Low-Speed Sensorless Loss of Lock',
      goal: '低速 BEMF 信噪比差导致的角度漂移与 PLL 失锁',
      goalEn: 'Angle drift and PLL loss of lock from poor low-speed BEMF SNR',
      moduleId: 'sensorless-foc',
      presetId: 'low-speed-sensorless',
      requirements: [{ kind: 'experiment-preset', presetId: 'low-speed-sensorless', label: '套用低速预设观察 θ 误差', labelEn: 'Apply the low-speed preset and watch the θ error' }],
    },
    {
      id: 'startup-stall',
      title: '启动卡死复盘',
      titleEn: 'Startup Stall Post-Mortem',
      goal: '液击 / 转矩不足导致的启动失败状态机回退',
      goalEn: 'State-machine fallback after slugging or insufficient torque stalls the start',
      moduleId: 'startup-statemachine',
      optionalChallengeIds: ['startup-anti-slugging'],
      requirements: [{ kind: 'challenge', challengeId: 'startup-anti-slugging', label: '通关：抗液击启动', labelEn: 'Pass the challenge: anti-slugging start' }],
    },
  ],
};

/**
 * D. 电力电子前端 + APF
 * 目标：给做 PFC 板 / APF 谐波抑制的工程师，覆盖 inverter 反方向（AC → DC）和谐波治理。
 */
const trackPowerElectronics: CurriculumTrack = {
  id: 'power-electronics-frontend',
  title: 'D. 电力电子前端 + APF',
  titleEn: 'D. Power-Electronics Front End + APF',
  tagline: '从 220V 整流到 PFC + APF 谐波抑制',
  taglineEn: 'From 220 V rectification to PFC + APF harmonic suppression',
  description:
    '面向做 PFC 板 / APF 谐波抑制 / 电网侧谐波治理的工程师：先打通三相 / Clarke / Park 这些通用工具，再聚焦 APF 前级、PID 跟踪、SVPWM 调制，最后用故障模块做 EMC 与浪涌排查。',
  descriptionEn:
    'For engineers working on PFC boards, APF harmonic suppression, or grid-side harmonic mitigation: master the shared toolset first (three-phase, Clarke, Park), then focus on the APF front end, PI tracking, and SVPWM modulation, and finish with EMC and surge triage in the faults module.',
  durationHint: '约 6-8 天',
  durationHintEn: 'About 6-8 days',
  audience: '做 Boost PFC / 单相 APF / 三相 APF 的电力电子工程师',
  audienceEn: 'Power-electronics engineers building Boost PFC, single-phase APF, or three-phase APF',
  tone: 'power-electronics',
  checkpoints: [
    {
      id: 'tp-grid',
      title: '电网三相波形',
      titleEn: 'Grid-Side Three-Phase Waveforms',
      goal: '理解三相不平衡 / 谐波 / 噪声叠加',
      goalEn: 'Understand three-phase imbalance, harmonics, and noise stacking up',
      moduleId: 'three-phase',
      presetId: 'three-phase-distort',
      requirements: [{ kind: 'experiment-preset', presetId: 'three-phase-distort', label: '套用畸变预设观察 THD', labelEn: 'Apply the distortion preset and observe THD' }],
    },
    {
      id: 'clarke-grid',
      title: 'Clarke 投到 αβ',
      titleEn: 'Clarke onto the αβ Frame',
      goal: '把电网三相投到 αβ 静止坐标，为后续 PR / 谐波分离铺路',
      goalEn: 'Project the grid onto the αβ stationary frame to prepare PR control and harmonic separation',
      moduleId: 'clarke-transform',
      presetId: 'clarke-projection',
      requirements: [{ kind: 'read', label: '通读 Clarke 讲义 + 套用 projection 预设', labelEn: 'Read the Clarke lesson and apply the projection preset' }],
    },
    {
      id: 'park-grid',
      title: 'Park 锁电网相位',
      titleEn: 'Locking the Grid Phase with Park',
      goal: '同步旋转坐标系下电网基波变直流，方便闭环',
      goalEn: 'In the synchronous frame the grid fundamental becomes DC, ready for closed loop',
      moduleId: 'park-transform',
      presetId: 'park-dc',
      requirements: [{ kind: 'experiment-preset', presetId: 'park-dc', label: '套用 park-dc 预设观察 Id/Iq', labelEn: 'Apply the park-dc preset and watch Id/Iq' }],
    },
    {
      id: 'pid-current',
      title: 'PI 电流跟踪',
      titleEn: 'PI Current Tracking',
      goal: 'APF 输出电流跟踪谐波指令的 PI 整定',
      goalEn: 'Tune PI so the APF output tracks the harmonic reference',
      moduleId: 'pid-control',
      presetId: 'pi-balanced',
      optionalChallengeIds: ['pid-fast-no-overshoot'],
      requirements: [{ kind: 'challenge', challengeId: 'pid-fast-no-overshoot', label: '通关：PI 快速且无超调', labelEn: 'Pass the challenge: fast PI with no overshoot' }],
    },
    {
      id: 'svpwm-grid',
      title: 'SVPWM 三电平/两电平',
      titleEn: 'SVPWM: Two-Level vs Three-Level',
      goal: '电网侧 SVPWM 调制策略与扇区判定',
      goalEn: 'Grid-side SVPWM modulation strategy and sector identification',
      moduleId: 'svpwm',
      presetId: 'svpwm-sector',
      requirements: [{ kind: 'walkthrough-finish', label: '走完 svpwm walkthrough', labelEn: 'Finish the svpwm walkthrough' }],
    },
    {
      id: 'inverter-bridge',
      title: '三相 H 桥功率级',
      titleEn: 'Three-Phase Bridge Power Stage',
      goal: '认识半桥 / 全桥 / IGBT 选型与死区匹配',
      goalEn: 'Half-bridge vs full-bridge, IGBT selection, and dead-time matching',
      moduleId: 'inverter',
      presetId: 'inverter-clean',
      requirements: [{ kind: 'read', label: '通读逆变器拓扑章节', labelEn: 'Read the inverter topology section' }],
    },
    {
      id: 'apf-pfc',
      title: 'APF 前级 Boost PFC',
      titleEn: 'APF Front-End Boost PFC',
      goal: '单相 220V → Boost PFC → 直流母线，功率因数 + 谐波抑制',
      goalEn: 'Single-phase 220 V → Boost PFC → DC bus, power factor + harmonic suppression',
      moduleId: 'apf-frontend',
      optionalWalkthroughStepRange: [1, 5],
      requirements: [{ kind: 'walkthrough-finish', label: '走完 apf-frontend walkthrough', labelEn: 'Finish the apf-frontend walkthrough' }],
    },
    {
      id: 'fault-emc',
      title: 'EMC / 浪涌故障演练',
      titleEn: 'EMC and Surge Fault Drills',
      goal: '用故障模块复现过流 / 偏置 / 死区类典型问题',
      goalEn: 'Reproduce overcurrent, offset, and dead-time failures in the faults module',
      moduleId: 'faults-debugging',
      presetId: 'fault-over-current',
      requirements: [{ kind: 'experiment-preset', presetId: 'fault-over-current', label: '套用过流预设并写排查清单', labelEn: 'Apply the overcurrent preset and write a triage checklist' }],
    },
  ],
};

export const curriculumTracks: CurriculumTrack[] = [
  trackFocFundamentals,
  trackCompressorProduct,
  trackDebugging,
  trackPowerElectronics,
];

/** 按 id 查 */
export function getCurriculumTrack(trackId: string): CurriculumTrack | undefined {
  return curriculumTracks.find((t) => t.id === trackId);
}

/** 组合 key：用于完成集合（避免不同路径同名 checkpoint 撞键） */
export function checkpointKey(trackId: string, checkpointId: string): string {
  return `${trackId}::${checkpointId}`;
}

/** 按 locale 取路径文案（标题 / 标语 / 介绍 / 耗时 / 受众）；en-US 下缺字段回退中文。 */
export function localizeTrack(
  track: CurriculumTrack,
  locale: 'zh-CN' | 'en-US',
): {
  title: string;
  tagline: string;
  description: string;
  durationHint: string;
  audience: string;
} {
  if (locale !== 'en-US') {
    return {
      title: track.title,
      tagline: track.tagline,
      description: track.description,
      durationHint: track.durationHint,
      audience: track.audience,
    };
  }
  return {
    title: track.titleEn ?? track.title,
    tagline: track.taglineEn ?? track.tagline,
    description: track.descriptionEn ?? track.description,
    durationHint: track.durationHintEn ?? track.durationHint,
    audience: track.audienceEn ?? track.audience,
  };
}

/** 按 locale 取 checkpoint 短标题与一句话目标；en-US 下缺字段回退中文。 */
export function localizeCheckpoint(
  checkpoint: CurriculumCheckpoint,
  locale: 'zh-CN' | 'en-US',
): { title: string; goal: string } {
  if (locale !== 'en-US') {
    return { title: checkpoint.title, goal: checkpoint.goal };
  }
  return {
    title: checkpoint.titleEn ?? checkpoint.title,
    goal: checkpoint.goalEn ?? checkpoint.goal,
  };
}

/** 按 locale 取完成要求文案；en-US 下缺字段回退中文。 */
export function localizeRequirement(
  requirement: CheckpointRequirement,
  locale: 'zh-CN' | 'en-US',
): string {
  if (locale !== 'en-US') return requirement.label;
  return requirement.labelEn ?? requirement.label;
}
