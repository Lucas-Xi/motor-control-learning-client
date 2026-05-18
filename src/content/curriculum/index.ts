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
  | { kind: 'read'; label: string }                          // 通读模块内容
  | { kind: 'walkthrough-step'; step: number; label: string } // 走到 walkthrough 第 N 步
  | { kind: 'walkthrough-finish'; label: string }            // 走完 walkthrough 整条
  | { kind: 'challenge'; challengeId: string; label: string } // 通关挑战 X
  | { kind: 'experiment-preset'; presetId: string; label: string }; // 套用某实验预设观察

export interface CurriculumCheckpoint {
  /** 在所属路径内唯一；用 `${pathId}::${checkpointId}` 作完成集合的 key */
  id: string;
  /** 学员看到的中文短标题 */
  title: string;
  /** 一句话目标，60 字内 */
  goal: string;
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
  /** Hero 卡上一句话副标题 */
  tagline: string;
  /** 100 字以内的路径介绍 */
  description: string;
  /** 估计耗时，文案 */
  durationHint: string;
  /** 给谁看的 1 行画像 */
  audience: string;
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
  tagline: '从电机结构到全闭环 FOC，理论 + 仿真 + 上板',
  description:
    '面向第一次接触 FOC 的工程师：先把"电角度 / 机械角度 / 极对数"搞清楚，再分别打通 Clarke、Park、PI、SVPWM 四个数学积木，最后串成完整的电流环 + 速度环。',
  durationHint: '约 7 天 · 每天 1-2 小时',
  audience: '刚拿到 STM32 / GD32 PMSM 开发板的新手',
  tone: 'foc-fundamentals',
  checkpoints: [
    {
      id: 'mb-anatomy',
      title: '认识 PMSM 结构',
      goal: '看清定子绕组、转子永磁体、极对数 vs 极数的区别',
      moduleId: 'motor-basics',
      optionalWalkthroughStepRange: [1, 3],
      requirements: [{ kind: 'walkthrough-step', step: 3, label: '走到 motor-basics walkthrough 第 3 步' }],
    },
    {
      id: 'tp-rotating-field',
      title: '三相合成旋转磁场',
      goal: '理解 120° 相位差 + 等幅正弦 = 等幅旋转磁场矢量',
      moduleId: 'three-phase',
      presetId: 'rotating-field',
      requirements: [{ kind: 'experiment-preset', presetId: 'rotating-field', label: '套用旋转磁场预设观察 30 s' }],
    },
    {
      id: 'clarke-basic',
      title: 'Clarke 投影到 αβ',
      goal: '把 3 个标量电流投影成 2 维静止坐标，省一个自由度',
      moduleId: 'clarke-transform',
      presetId: 'clarke-balanced',
      optionalWalkthroughStepRange: [1, 2],
      requirements: [{ kind: 'read', label: '通读 Clarke 模块讲义 + 套用 balanced 预设' }],
    },
    {
      id: 'park-align',
      title: 'Park 旋转到 dq',
      goal: '理解 dq 同步旋转坐标系如何把交流量变成直流量',
      moduleId: 'park-transform',
      presetId: 'park-align',
      optionalWalkthroughStepRange: [1, 3],
      requirements: [{ kind: 'walkthrough-step', step: 3, label: '走到 park-transform walkthrough 第 3 步' }],
    },
    {
      id: 'pid-loop',
      title: 'PI 整定与抗积分饱和',
      goal: '搞定 Kp/Ki 的物理意义，会用 anti-windup',
      moduleId: 'pid-control',
      presetId: 'pi-balanced',
      optionalChallengeIds: ['pid-fast-no-overshoot', 'pid-antiwindup'],
      requirements: [{ kind: 'challenge', challengeId: 'pid-fast-no-overshoot', label: '通关：电流环 PI 4 ms 无超调' }],
    },
    {
      id: 'foc-chain',
      title: 'FOC 全链路串通',
      goal: '看采样 → Clarke → Park → PI → 反 Park → SVPWM 串成闭环',
      moduleId: 'foc-flow',
      presetId: 'foc-current-loop',
      optionalChallengeIds: ['foc-fast-iq-tracking'],
      optionalWalkthroughStepRange: [1, 5],
      requirements: [{ kind: 'walkthrough-finish', label: '走完 foc-flow 整条 walkthrough' }],
    },
    {
      id: 'svpwm-sector',
      title: 'SVPWM 7 段扇区',
      goal: '理解扇区判定 + T1/T2/T0 时间分配 + 调制比上限',
      moduleId: 'svpwm',
      presetId: 'svpwm-sector',
      optionalChallengeIds: ['svpwm-utilization'],
      requirements: [{ kind: 'challenge', challengeId: 'svpwm-utilization', label: '通关：SVPWM 母线利用率达标' }],
    },
    {
      id: 'inverter-deadtime',
      title: '逆变器与死区效应',
      goal: '认识桥臂、PWM、死区如何影响相电压波形',
      moduleId: 'inverter',
      presetId: 'inverter-deadtime',
      optionalWalkthroughStepRange: [1, 3],
      requirements: [{ kind: 'experiment-preset', presetId: 'inverter-deadtime', label: '套用 deadtime 预设对比波形' }],
    },
    {
      id: 'loops-three',
      title: '三闭环带宽配比',
      goal: '电流环 > 速度环 > 位置环 10 倍带宽间隔的设计原则',
      moduleId: 'control-loops',
      presetId: 'loops-stable',
      requirements: [{ kind: 'walkthrough-finish', label: '走完 control-loops walkthrough' }],
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
  tagline: '从电机参数到 V/f → HFI → BEMF → 弱磁全状态机',
  description:
    '面向做空调 / 冰箱 / 工业制冷压缩机的工程师：在 FOC 基础上叠加启动状态机（V/f → HFI → BEMF）、弱磁恒功率区、制冷台架性能验证，最后对接整机搭建工作台。',
  durationHint: '约 10 天 · 跨电机 / 控制 / 系统',
  audience: '已经会 FOC、要做压缩机产品落地的工程师',
  tone: 'compressor-product',
  checkpoints: [
    {
      id: 'mb-rated',
      title: '配齐电机铭牌参数',
      goal: '把极对数 / Rs / Ld / Lq / ψf / 额定电流写对',
      moduleId: 'motor-basics',
      presetId: 'motor-rated',
      requirements: [{ kind: 'experiment-preset', presetId: 'motor-rated', label: '套用额定参数预设并核对单位' }],
    },
    {
      id: 'foc-baseline',
      title: 'FOC 电流环跑稳',
      goal: '在 Iq 阶跃下取得 ≤ 4 ms 上升时间且 ≤ 10% 超调',
      moduleId: 'foc-flow',
      presetId: 'foc-output',
      optionalChallengeIds: ['foc-fast-iq-tracking'],
      requirements: [{ kind: 'challenge', challengeId: 'foc-fast-iq-tracking', label: '通关：Iq 阶跃 4 ms 内追上' }],
    },
    {
      id: 'svpwm-saturate',
      title: 'SVPWM 过调避坑',
      goal: '理解线性区上限 0.9069，调制比过 1 会发生什么',
      moduleId: 'svpwm',
      presetId: 'svpwm-saturation',
      requirements: [{ kind: 'experiment-preset', presetId: 'svpwm-saturation', label: '套用过调预设观察波形畸变' }],
    },
    {
      id: 'inverter-clean',
      title: '逆变器死区与母线',
      goal: '6 kHz IGBT + 2 μs 死区下 dutyA/B/C 与线电压',
      moduleId: 'inverter',
      presetId: 'inverter-clean',
      requirements: [{ kind: 'read', label: '通读逆变器讲义并对照 demo 波形' }],
    },
    {
      id: 'startup-vf',
      title: 'V/f 启动 → 速度合拍',
      goal: '让压缩机从 0 转上到 3000 rpm 切换到 BEMF 闭环',
      moduleId: 'startup-statemachine',
      optionalChallengeIds: ['startup-reach-3000'],
      requirements: [{ kind: 'challenge', challengeId: 'startup-reach-3000', label: '通关：启动到 3000 rpm 不卡' }],
    },
    {
      id: 'hfi-zero-speed',
      title: 'HFI 零速无感',
      goal: '高频注入 + 凸极比解调，让 0-200 rpm 也能闭环',
      moduleId: 'hfi-sensorless',
      optionalWalkthroughStepRange: [1, 5],
      requirements: [{ kind: 'walkthrough-finish', label: '走完 hfi-sensorless walkthrough' }],
    },
    {
      id: 'sensorless-bemf',
      title: '反电动势观测器收敛',
      goal: '中高速段 BEMF + PLL 锁定，与 HFI 平滑交接',
      moduleId: 'sensorless-foc',
      presetId: 'sensorless-lock',
      optionalChallengeIds: ['sensorless-lock-high-speed'],
      requirements: [{ kind: 'challenge', challengeId: 'sensorless-lock-high-speed', label: '通关：高速段 PLL 锁角误差达标' }],
    },
    {
      id: 'weak-id-neg',
      title: '弱磁恒功率区',
      goal: '用负 Id 突破 V_bus 限制，把转速顶到 7200 rpm',
      moduleId: 'field-weakening',
      presetId: 'weak-negative-id',
      optionalChallengeIds: ['field-weak-7200'],
      requirements: [{ kind: 'challenge', challengeId: 'field-weak-7200', label: '通关：弱磁到 7200 rpm' }],
    },
    {
      id: 'fridge-cop',
      title: '制冷台架性能验证',
      goal: '调蒸发 / 冷凝温度 / 过热度，把 COP 推到目标值',
      moduleId: 'refrigeration-bench',
      presetId: 'fridge-low-load',
      optionalChallengeIds: ['fridge-cop-above-3', 'fridge-discharge-safe'],
      requirements: [{ kind: 'challenge', challengeId: 'fridge-cop-above-3', label: '通关：COP ≥ 3' }],
    },
    {
      id: 'assembly-wire',
      title: '整机搭建工作台',
      goal: '在搭建台拼出"压缩机 + 变频器 + PFC + 策略"完整电控',
      moduleId: 'assembly-workshop',
      requirements: [{ kind: 'read', label: '在搭建工作台跑一次完整组合' }],
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
  tagline: '从波形现象倒推到根因，专治"上电就过流"',
  description:
    '面向上岗后专门救火的调试工程师：以"故障与调试"模块为大本营，分别串入相序错 / 电流偏置 / 死区不足 / PID 振荡 / 弱磁拉爆等典型故障，训练"看波形猜原因"的肌肉记忆。',
  durationHint: '约 5-7 天 · 每天 1 个典型故障',
  audience: '已经写过 FOC 但调试还在试错的工程师',
  tone: 'debugging',
  checkpoints: [
    {
      id: 'fault-overview',
      title: '故障与调试总览',
      goal: '熟悉故障类别 + 现象 → 原因 → 排查路径模板',
      moduleId: 'faults-debugging',
      optionalWalkthroughStepRange: [1, 2],
      requirements: [{ kind: 'walkthrough-step', step: 2, label: '走到 faults-debugging walkthrough 第 2 步' }],
    },
    {
      id: 'fault-over-current',
      title: '过流故障',
      goal: 'IGBT 上下管直通 / 短路引发的过流如何在波形里识别',
      moduleId: 'faults-debugging',
      presetId: 'fault-over-current',
      requirements: [{ kind: 'experiment-preset', presetId: 'fault-over-current', label: '套用过流预设观察 Ia/Ib/Ic' }],
    },
    {
      id: 'fault-phase-order',
      title: '相序错',
      goal: '电机反转 / 起动失败的相序错故障定位',
      moduleId: 'faults-debugging',
      presetId: 'phase-order-error',
      requirements: [{ kind: 'experiment-preset', presetId: 'phase-order-error', label: '套用相序错预设并改回正常' }],
    },
    {
      id: 'fault-offset',
      title: '电流采样偏置',
      goal: 'ADC 偏置如何让 Iq 出现工频纹波',
      moduleId: 'faults-debugging',
      presetId: 'current-offset',
      requirements: [{ kind: 'experiment-preset', presetId: 'current-offset', label: '套用电流偏置预设观察 Iq' }],
    },
    {
      id: 'pid-oscillate',
      title: 'PID 振荡演练',
      goal: 'Kp / Ki 设大后的极限环振荡，对照看积分饱和',
      moduleId: 'pid-control',
      presetId: 'pi-oscillate',
      optionalChallengeIds: ['pid-antiwindup'],
      requirements: [{ kind: 'challenge', challengeId: 'pid-antiwindup', label: '通关：anti-windup 抑制饱和' }],
    },
    {
      id: 'inverter-deadtime-fault',
      title: '死区不足故障',
      goal: '把死区设太小看上下管直通导致的电流尖峰',
      moduleId: 'inverter',
      presetId: 'inverter-deadtime',
      requirements: [{ kind: 'experiment-preset', presetId: 'inverter-deadtime', label: '套用 deadtime 预设并加大死区改善' }],
    },
    {
      id: 'svpwm-overmod',
      title: 'SVPWM 过调饱和',
      goal: '调制比 > 1 时 dutyA/B/C 被夹断造成的电流畸变',
      moduleId: 'svpwm',
      presetId: 'svpwm-saturation',
      requirements: [{ kind: 'experiment-preset', presetId: 'svpwm-saturation', label: '套用 svpwm-saturation 对比线性区' }],
    },
    {
      id: 'sensorless-fail',
      title: '低速无感失锁',
      goal: '低速 BEMF 信噪比差导致的角度漂移与 PLL 失锁',
      moduleId: 'sensorless-foc',
      presetId: 'low-speed-sensorless',
      requirements: [{ kind: 'experiment-preset', presetId: 'low-speed-sensorless', label: '套用低速预设观察 θ 误差' }],
    },
    {
      id: 'startup-stall',
      title: '启动卡死复盘',
      goal: '液击 / 转矩不足导致的启动失败状态机回退',
      moduleId: 'startup-statemachine',
      optionalChallengeIds: ['startup-anti-slugging'],
      requirements: [{ kind: 'challenge', challengeId: 'startup-anti-slugging', label: '通关：抗液击启动' }],
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
  tagline: '从 220V 整流到 PFC + APF 谐波抑制',
  description:
    '面向做 PFC 板 / APF 谐波抑制 / 电网侧谐波治理的工程师：先打通三相 / Clarke / Park 这些通用工具，再聚焦 APF 前级、PID 跟踪、SVPWM 调制，最后用故障模块做 EMC 与浪涌排查。',
  durationHint: '约 6-8 天',
  audience: '做 Boost PFC / 单相 APF / 三相 APF 的电力电子工程师',
  tone: 'power-electronics',
  checkpoints: [
    {
      id: 'tp-grid',
      title: '电网三相波形',
      goal: '理解三相不平衡 / 谐波 / 噪声叠加',
      moduleId: 'three-phase',
      presetId: 'three-phase-distort',
      requirements: [{ kind: 'experiment-preset', presetId: 'three-phase-distort', label: '套用畸变预设观察 THD' }],
    },
    {
      id: 'clarke-grid',
      title: 'Clarke 投到 αβ',
      goal: '把电网三相投到 αβ 静止坐标，为后续 PR / 谐波分离铺路',
      moduleId: 'clarke-transform',
      presetId: 'clarke-projection',
      requirements: [{ kind: 'read', label: '通读 Clarke 讲义 + 套用 projection 预设' }],
    },
    {
      id: 'park-grid',
      title: 'Park 锁电网相位',
      goal: '同步旋转坐标系下电网基波变直流，方便闭环',
      moduleId: 'park-transform',
      presetId: 'park-dc',
      requirements: [{ kind: 'experiment-preset', presetId: 'park-dc', label: '套用 park-dc 预设观察 Id/Iq' }],
    },
    {
      id: 'pid-current',
      title: 'PI 电流跟踪',
      goal: 'APF 输出电流跟踪谐波指令的 PI 整定',
      moduleId: 'pid-control',
      presetId: 'pi-balanced',
      optionalChallengeIds: ['pid-fast-no-overshoot'],
      requirements: [{ kind: 'challenge', challengeId: 'pid-fast-no-overshoot', label: '通关：PI 快速且无超调' }],
    },
    {
      id: 'svpwm-grid',
      title: 'SVPWM 三电平/两电平',
      goal: '电网侧 SVPWM 调制策略与扇区判定',
      moduleId: 'svpwm',
      presetId: 'svpwm-sector',
      requirements: [{ kind: 'walkthrough-finish', label: '走完 svpwm walkthrough' }],
    },
    {
      id: 'inverter-bridge',
      title: '三相 H 桥功率级',
      goal: '认识半桥 / 全桥 / IGBT 选型与死区匹配',
      moduleId: 'inverter',
      presetId: 'inverter-clean',
      requirements: [{ kind: 'read', label: '通读逆变器拓扑章节' }],
    },
    {
      id: 'apf-pfc',
      title: 'APF 前级 Boost PFC',
      goal: '单相 220V → Boost PFC → 直流母线，功率因数 + 谐波抑制',
      moduleId: 'apf-frontend',
      optionalWalkthroughStepRange: [1, 5],
      requirements: [{ kind: 'walkthrough-finish', label: '走完 apf-frontend walkthrough' }],
    },
    {
      id: 'fault-emc',
      title: 'EMC / 浪涌故障演练',
      goal: '用故障模块复现过流 / 偏置 / 死区类典型问题',
      moduleId: 'faults-debugging',
      presetId: 'fault-over-current',
      requirements: [{ kind: 'experiment-preset', presetId: 'fault-over-current', label: '套用过流预设并写排查清单' }],
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
