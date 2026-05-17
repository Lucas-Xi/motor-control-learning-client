import { compressorBundles } from './compressorLibrary';
import {
  controlStrategies,
  inverterPlatforms,
  liquidSeparators,
  loadConditions,
  pfcPlatforms,
  type AssemblyResult,
} from './assemblyLibraries';

/**
 * 整机搭建·挑战模式题库
 *
 * 每道题：故意把 4 个槽位的某些选项配错，让用户通过切换槽位把诊断 verdict 调到 pass / pass-warn。
 *
 * 通关条件：runAssembly 的 verdict >= minVerdict，并且 mustResolveKeywords 列出的诊断 message
 * 全部不再出现在 items 中。
 */

export interface AssemblyChallenge {
  id: string;
  level: 1 | 2 | 3 | 4;       // 难度等级
  title: string;
  brief: string;               // 一句话引子（场景包装）
  goal: string;                // 目标（用户要解决什么）
  hint: string;                // 提示（给新手用，可显隐）
  initial: {
    compressorBundleId: string;
    inverterPartNo: string;
    strategyId: string;
    loadId: string;
    pfcId?: string;            // 可选：PFC 前级
    separatorId?: string;      // 可选：液气分离器
  };
  passCondition: {
    minVerdict: 'pass' | 'pass-warn';
    /** 必须解决的诊断（按 message 子串匹配）；若任何一条仍出现在 items 中视为未通关 */
    mustResolveKeywords: string[];
  };
}

export const assemblyChallenges: AssemblyChallenge[] = [
  // —— Lv.1 · 单一问题 ————————————————————————————————————————
  {
    id: 'undersized-inverter',
    level: 1,
    title: '逆变器选小了',
    brief: '客户用 1.5HP 海立压缩机，但订错了功率模块——选了一颗冰箱用的小 IPM。',
    goal: '把逆变器换成能匹配 1.5HP 压缩机额定电流的型号。',
    hint: '海立 BSA325CV 额定 7A。逆变器额定一般要在压缩机额定的 1.5 倍以上（启动冲击留余量），所以至少 11A，推荐 14A+。',
    initial: {
      compressorBundleId: 'highly-15hp-r32-sanken',
      inverterPartNo: 'STGIPN3H60A',   // 3A 冰箱 IPM，远不够 7A 压缩机
      strategyId: 'foc-hfi-bemf',
      loadId: 'cooling-summer-typical',
    },
    passCondition: {
      minVerdict: 'pass-warn',
      mustResolveKeywords: ['逆变器额定'],
    },
  },

  // —— Lv.1 · 单一问题 ————————————————————————————————————————
  {
    id: 'wrong-refrigerant',
    level: 1,
    title: '冰箱压缩机装到空调上',
    brief: '工厂装配线出错，把 R134a 冰箱压缩机装到了 R32 空调外机的位置。',
    goal: '把工况或压缩机换成冷媒一致的搭配。',
    hint: '空调主流 R32，冰箱主流 R134a/R600a。两者饱和压力差 2-3 倍，强制运行会损坏阀片或导致排温失控。',
    initial: {
      compressorBundleId: 'embraco-fridge-r134a-st',
      inverterPartNo: 'NFAM5065L4B',
      strategyId: 'foc-hfi-bemf',
      loadId: 'cooling-summer-typical',  // R32 工况配 R134a 压缩机
    },
    passCondition: {
      minVerdict: 'pass-warn',
      mustResolveKeywords: ['冷媒不匹配'],
    },
  },

  // —— Lv.2 · 启动策略问题 ————————————————————————————————————
  {
    id: 'cannot-zero-start',
    level: 2,
    title: '客户："开机就报启动失败"',
    brief: '现场工程师反馈，外机一上电就报"启动失败 / 失步告警"。',
    goal: '修改控制策略，让压缩机能从零速启动。',
    hint: '反电动势无感 (BEMF) 需要 ω≠0 才有信号 → 零速时观测器拿不到角度。要么叠开环 V/f 起转，要么用 HFI 高频注入凸极解调。',
    initial: {
      compressorBundleId: 'highly-15hp-r32-sanken',
      inverterPartNo: 'SCM1241MF',
      strategyId: 'foc-bemf',  // 纯 BEMF 不能零速
      loadId: 'cooling-summer-typical',
    },
    passCondition: {
      minVerdict: 'pass-warn',
      mustResolveKeywords: ['零速启动'],
    },
  },

  // —— Lv.2 · 弱磁问题 ————————————————————————————————————————
  {
    id: 'no-fieldweak-max-rpm',
    level: 2,
    title: '"7500 rpm 怎么都到不了"',
    brief: '客户要求强冷启动，目标转速 7500 rpm，但 仿真显示卡在 6500。',
    goal: '让 8 秒内 reachedTarget = true，同时不破其他指标。',
    hint: '高转速段反电动势 ωψ 占主导，需求电压超过 SVPWM 线性区 (≈ 0.866 × Vdc)。要么提升母线，要么开弱磁注入负 Id —— 注意 V/f 和无编码器 BEMF 都不支持弱磁。',
    initial: {
      compressorBundleId: 'highly-15hp-r32-sanken',
      inverterPartNo: 'SCM1241MF',
      strategyId: 'spwm-vf',  // V/f 不支持弱磁
      loadId: 'startup-stress',  // target 7500
    },
    passCondition: {
      minVerdict: 'pass-warn',
      mustResolveKeywords: ['弱磁', '未达到目标转速'],
    },
  },

  // —— Lv.3 · 凸极比偏低 (warn) ————————————————————————————————
  {
    id: 'low-saliency-hfi',
    level: 3,
    title: 'HFI 标定但凸极比不够',
    brief: '研发把 FOC + HFI + BEMF 烧进了一颗主控做样机，但凸极比只有 1.13。',
    goal: '让 HFI 解调可靠工作（凸极比 > 1.2），或换不依赖凸极的启动方案。',
    hint: 'HFI 靠 IPM 的 Lq > Ld 解调角度。若选 SPM（表贴式磁体）或弱凸极 IPM，要么换"开环 V/f → BEMF"策略，要么换有凸极的压缩机。',
    initial: {
      // Mitsubishi 2HP 的 Ld/Lq = 3.0/4.5 → 凸极比 1.5，没问题；
      // 但 Embraco R134a 的 Ld/Lq = 30/35 → 凸极比 1.17，刚好打边界
      compressorBundleId: 'embraco-fridge-r134a-st',
      inverterPartNo: 'STGIPN3H60A',
      strategyId: 'foc-hfi-bemf',
      loadId: 'fridge-r134a',  // 冷媒匹配
    },
    passCondition: {
      minVerdict: 'pass-warn',
      mustResolveKeywords: ['凸极比'],
    },
  },

  // —— Lv.2 · PFC 合规 ————————————————————————————————————————
  {
    id: 'no-pfc-thd-violation',
    level: 2,
    title: 'GB 17625 谐波认证不过',
    brief: '研发样机用了"整流桥直供"省成本，进认证实验室一测 THD 110%、PF 0.6，全条不过。',
    goal: '加一颗 PFC 让 THD 合规，且不让母线掉电导致弱磁失效。',
    hint: 'PFC 不仅能压低 THD/PF 满足 GB 17625，还能把母线电压稳到 380V（甚至 600V）— 给 SVPWM 更多电压余量。家用主流是 Boost 单相 PFC。',
    initial: {
      compressorBundleId: 'highly-15hp-r32-sanken',
      inverterPartNo: 'SCM1241MF',
      strategyId: 'foc-hfi-bemf',
      loadId: 'cooling-summer-typical',
      pfcId: 'none',                  // 无 PFC → THD 超标
      separatorId: 'standard',
    },
    passCondition: {
      minVerdict: 'pass-warn',
      mustResolveKeywords: ['GB 17625'],
    },
  },

  // —— Lv.2 · 液气分离器 ————————————————————————————————————————
  {
    id: 'no-separator-liquid-slug',
    level: 2,
    title: '冷启动液击警告',
    brief: '商用机型设计师贪图省料没加液气分离器，工况选了"启动应力测试"(2500 rpm/s 斜坡)。',
    goal: '加分离器让斜坡可承受，或者降斜坡到无分离器能承受的范围。',
    hint: '液击 = 液态冷媒进入压缩腔被强行压缩 → 阀片秒坏。分离器越大，可承受的 rpm 斜坡越高（无 = 800 rpm/s；标准 = 1500 rpm/s；大容量 = 3000 rpm/s）。',
    initial: {
      compressorBundleId: 'mitsubishi-2hp-r410-dipipm',
      inverterPartNo: 'PSS15S92F6（DIPIPM）',
      strategyId: 'foc-hfi-bemf',
      loadId: 'startup-stress',       // 斜坡 2500 rpm/s
      pfcId: 'boost-single',
      separatorId: 'none',             // 无分离器，承受 800 rpm/s
    },
    passCondition: {
      minVerdict: 'pass-warn',
      mustResolveKeywords: ['液击'],
    },
  },

  // —— Lv.1 · 逆变器余量恰好不够 ————————————————————————————
  {
    id: 'marginal-inverter',
    level: 1,
    title: '"差一点就够" 的逆变器',
    brief: '工程师选了 Panasonic MIP6P011W (10A) 配海立 1.5HP (7A 额定)。运行测试时压缩机启动冲击就触发 OCP 报警。',
    goal: '换更大额定电流的逆变器把"余量不足 1.5×"修掉。',
    hint: '行业经验：逆变器额定 / 压缩机额定 至少 1.5 倍，启动冲击 + 高温重载留余量。当前 10/7 = 1.43× 刚好不够。Sanken / Onsemi 的 15A 系列是安全选择。',
    initial: {
      compressorBundleId: 'highly-15hp-r32-sanken',
      inverterPartNo: 'MIP6P011W',                    // 10A < 7A × 1.5 = 10.5A
      strategyId: 'foc-hfi-bemf',
      loadId: 'cooling-summer-typical',
      pfcId: 'boost-single',
      separatorId: 'standard',
    },
    passCondition: {
      minVerdict: 'pass-warn',
      mustResolveKeywords: ['逆变器额定'],
    },
  },

  // —— Lv.4 · 工业大功率 + 调速比 ———————————————————————————
  {
    id: 'industrial-wide-speed',
    level: 4,
    title: '商用机型宽调速范围',
    brief: '3HP 商用多联机要从 1500 rpm 部分负荷一路开到 7500 rpm 满负荷。一份方案给到工业级 Vincotech 30A，但 PFC + 控制策略选了家用配置。',
    goal: '让母线电压 + 控制策略 + 启动方案配齐，能在 8s 内到 7500 rpm 且无 fault。',
    hint: '7500 rpm 高速段反电动势峰值 ~230V，Boost 单相 380V × 0.866 = 329V 也许够；但 V/f 调制因子只有 0.5 = 190V 远不够。要么选三相 Vienna PFC (600V) 撑出大电压余量，要么把控制策略换成支持 SVPWM + 弱磁的 FOC 全套。',
    initial: {
      compressorBundleId: 'mitsubishi-2hp-r410-dipipm',  // 用 2HP Mitsubishi（4 极对数 + R410A）
      inverterPartNo: 'P935-T3F',                        // Vincotech 工业级 30A
      strategyId: 'spwm-vf',                              // V/f 调制限制
      loadId: 'startup-stress',                           // target 7500, ramp 2500
      pfcId: 'boost-single',                              // 单相 PFC 380V
      separatorId: 'large-low-temp',                      // 商用大分离器（3000 rpm/s 承载）
    },
    passCondition: {
      minVerdict: 'pass-warn',
      mustResolveKeywords: ['未达到目标转速', '无法到目标转速'],
    },
  },

  // —— Lv.3 · 多种问题叠 ————————————————————————————————————
  {
    id: 'no-pfc-no-separator-stress',
    level: 3,
    title: '"出厂检"全踩坑：无 PFC + 无分离器 + 启动应力',
    brief: '研发机型为了省成本砍掉了 PFC 和液气分离器，又用了 V/f 开环走极速 7500 rpm 启动测试，整机一上电连报三个 fault。',
    goal: '把至少其中两个 fault 修掉（PFC 合规 + 液击 + 母线撞顶）。',
    hint: '"无 PFC" 让 GB 17625 不合规，且 V_dc 只 300V → SPWM 线性区 150V，高 rpm 直接撞顶；"无分离器" 让 2500 rpm/s 斜坡触发液击。换 Boost PFC + 标准分离器 + FOC 全套可以一并解决。',
    initial: {
      compressorBundleId: 'highly-15hp-r32-sanken',
      inverterPartNo: 'SCM1241MF',
      strategyId: 'spwm-vf',
      loadId: 'startup-stress',
      pfcId: 'none',
      separatorId: 'none',
    },
    passCondition: {
      minVerdict: 'pass-warn',
      mustResolveKeywords: ['GB 17625', '液击'],
    },
  },

  // —— Lv.4 · 综合诊断（最难） ——————————————————————————————
  {
    id: 'triple-fault',
    level: 4,
    title: '故障三连：售后机型大返修',
    brief: '一台 2HP 机型出厂时被错配：冷媒错、控制策略错、逆变器电流也不够。',
    goal: '排查并解决全部三个 fault 级问题，让 verdict 从 fail → pass / pass-warn。',
    hint: '从上往下逐项看诊断清单：(1) 冷媒是否匹配 (2) 启动策略是否支持零速 (3) 逆变器电流余量是否 ≥ 1.5×。每改一个 slot 重跑诊断观察红项变化。',
    initial: {
      compressorBundleId: 'mitsubishi-2hp-r410-dipipm',  // R410A，9A 额定
      inverterPartNo: 'STGIPN3H60A',                       // 3A，远不够 9A
      strategyId: 'foc-bemf',                               // 不能零速
      loadId: 'fridge-r134a',                               // R134a 工况，但压缩机 R410A
    },
    passCondition: {
      minVerdict: 'pass-warn',
      mustResolveKeywords: ['冷媒不匹配', '零速启动', '逆变器额定'],
    },
  },
];

/** 检查当前结果是否满足挑战通关条件 */
export function checkChallengePass(challenge: AssemblyChallenge, result: AssemblyResult): boolean {
  // 1) verdict 至少达到 minVerdict
  const verdictOrder = { fail: 0, 'pass-warn': 1, pass: 2 } as const;
  if (verdictOrder[result.verdict] < verdictOrder[challenge.passCondition.minVerdict]) return false;
  // 2) 所有 mustResolveKeywords 不再出现在 items 中（无论 ok/warn/fault 都算"已解决"如果不出现）
  // 改判定：要求 mustResolveKeywords 不再出现在 fault 级条目里（warn 级允许，因为 pass-warn 本身就是允许 warn 的）
  const faultMessages = result.items.filter((i) => i.level === 'fault').map((i) => i.message);
  for (const kw of challenge.passCondition.mustResolveKeywords) {
    if (faultMessages.some((m) => m.includes(kw))) return false;
  }
  return true;
}

/** 统计挑战进度：未解决的 fault 中有几个属于本题的必修项 */
export function challengeProgress(challenge: AssemblyChallenge, result: AssemblyResult | null): {
  total: number;
  resolved: number;
} {
  const total = challenge.passCondition.mustResolveKeywords.length;
  if (!result) return { total, resolved: 0 };
  const faultMessages = result.items.filter((i) => i.level === 'fault').map((i) => i.message);
  let resolved = 0;
  for (const kw of challenge.passCondition.mustResolveKeywords) {
    if (!faultMessages.some((m) => m.includes(kw))) resolved += 1;
  }
  return { total, resolved };
}

/** 给 ID 反查 6 槽位的索引（供 Workshop 加载挑战时填表）。
 *  题目里 pfcId / separatorId 可选 — 缺省时返回默认（Boost 单相 PFC / 标准分离器）的索引。
 */
export function lookupChallengeIndices(challenge: AssemblyChallenge): {
  compressorIdx: number;
  inverterIdx: number;
  strategyIdx: number;
  loadIdx: number;
  pfcIdx: number;
  separatorIdx: number;
} | null {
  const compressorIdx = compressorBundles.findIndex((b) => b.id === challenge.initial.compressorBundleId);
  const inverterIdx = inverterPlatforms.findIndex((i) => i.ipmPartNo === challenge.initial.inverterPartNo);
  const strategyIdx = controlStrategies.findIndex((s) => s.id === challenge.initial.strategyId);
  const loadIdx = loadConditions.findIndex((l) => l.id === challenge.initial.loadId);
  // PFC / 分离器默认：Boost 单相 / 标准
  const pfcDefaultIdx = pfcPlatforms.findIndex((p) => p.id === 'boost-single');
  const separatorDefaultIdx = liquidSeparators.findIndex((s) => s.id === 'standard');
  const pfcIdx = challenge.initial.pfcId
    ? pfcPlatforms.findIndex((p) => p.id === challenge.initial.pfcId)
    : pfcDefaultIdx;
  const separatorIdx = challenge.initial.separatorId
    ? liquidSeparators.findIndex((s) => s.id === challenge.initial.separatorId)
    : separatorDefaultIdx;
  if (compressorIdx < 0 || inverterIdx < 0 || strategyIdx < 0 || loadIdx < 0 || pfcIdx < 0 || separatorIdx < 0) return null;
  return { compressorIdx, inverterIdx, strategyIdx, loadIdx, pfcIdx, separatorIdx };
}
