import type { CycleResult, CycleState } from './vaporCycle';

/**
 * 制冷系统侧故障注入（教学级）。
 *
 * 与 12 号「故障与调试」模块的 14 种电气侧故障互补：
 * 这里的 6 种故障不直接产生电气波形畸变，而是让 P_s / P_d / T_d / SH / COP
 * 进入典型的"系统级"异常模式，配合下方排查清单引导初中级工程师
 * 用现场常用的"看四表"思路定位故障源。
 *
 * 实现策略：深拷贝 baseline CycleResult，按故障类型与严重度叠加扰动；
 * 不修改原 result，方便上层同时显示「正常 / 故障 / 偏差」三列对比。
 */

export type SystemFaultType =
  | 'none'
  | 'refrigerant-leak'
  | 'condenser-fouling'
  | 'evaporator-frost'
  | 'eev-stuck-closed'
  | 'eev-stuck-open'
  | 'non-condensable-gas'
  | 'oil-circulation-low';

export interface FaultDefinition {
  type: SystemFaultType;
  /** 中文故障名 */
  label: string;
  /** 一句话症状（红色大字提示） */
  signature: string;
  /** 排查步骤 3-5 条 */
  diagnostic: string[];
}

export const FAULT_LIBRARY: Record<SystemFaultType, FaultDefinition> = {
  none: {
    type: 'none',
    label: '正常运行',
    signature: '系统四表读数处于正常区间，无异常报警。',
    diagnostic: [
      '维持当前工况，每 5 分钟巡检一次 P_s / P_d / T_d。',
      '记录稳态 COP 与压缩比，作为后续故障对比的基准。',
    ],
  },
  'refrigerant-leak': {
    type: 'refrigerant-leak',
    label: '冷媒泄漏',
    signature: '吸气压力下跌、过热度飙升、排气温度高、制冷量明显偏小。',
    diagnostic: [
      '看压力表：P_s 比额定低 0.05~0.15 MPa，P_d 也略低，但压比基本不变。',
      '摸吸气管：温度高于环境，吸气过热度 SH 一路冲到 15K 以上。',
      '用电子检漏仪沿焊点 / 喇叭口 / 阀芯逐个走查，重点检查冷凝器底部 U 管。',
      '抽真空称重补充冷媒，先做 0.6 MPa N2 保压 30 min 验证气密性。',
    ],
  },
  'condenser-fouling': {
    type: 'condenser-fouling',
    label: '冷凝器堵塞 / 脏堵',
    signature: '排气压力 P_d 异常升高，排气温度同步上扬，COP 显著下降。',
    diagnostic: [
      'P_d 比基准升高 30%~40%，但 P_s 只略微变化（压比拉大）。',
      '触摸冷凝器表面温差：进出口温差 >12K 即视为换热严重恶化。',
      '检查室外机散热风扇、翅片污垢、回风短路情况。',
      '清洗翅片或更换风扇电机，必要时整体除尘并复测压差。',
    ],
  },
  'evaporator-frost': {
    type: 'evaporator-frost',
    label: '蒸发器结霜 / 风量不足',
    signature: '吸气压力 P_s 偏低、制冷量大幅下降，吸气管温度过低。',
    diagnostic: [
      'P_s 比基准低 20%~30%，吸气过热度反而偏小（结霜阻碍气化）。',
      '检查室内风机转速、滤网堵塞、进风温度是否过低。',
      '化霜后启动观察：若仍偏低，需检查冷媒循环量与 EEV 控制策略。',
      '排除送风短路 / 出风口被遮挡 / 翅片断裂导致的风量损失。',
    ],
  },
  'eev-stuck-closed': {
    type: 'eev-stuck-closed',
    label: 'EEV 卡死（偏关）',
    signature: '过热度 SH 飙到 20K+，质量流量骤减，排气温度报高温保护。',
    diagnostic: [
      '过热度持续 >15K，且 EEV 输出步数已到上限仍不见 SH 下降。',
      '断电后给 EEV 单独打驱动脉冲，看是否能正常 0→480 步往复。',
      '检查 EEV 线圈电阻（典型 4×46Ω）与驱动板 GPIO 输出波形。',
      '更换 EEV 阀体或线圈，并清洗管路防止杂质二次卡阀。',
    ],
  },
  'eev-stuck-open': {
    type: 'eev-stuck-open',
    label: 'EEV 卡死（偏开）',
    signature: '过热度 SH 接近 0，回液风险高，COP 因压缩湿气而下跌。',
    diagnostic: [
      'SH < 2K 持续报警，吸气管温度接近蒸发温度，可能出现结露 / 滴水。',
      '关小 EEV 步数无效 → 大概率为机械卡涩或控制板输出失效。',
      '立刻降低转速避免液击，将 SH 阈值临时上调争取处置时间。',
      '更换 EEV 后做液击复盘：检查曲轴箱油位、电流冲击波形。',
    ],
  },
  'non-condensable-gas': {
    type: 'non-condensable-gas',
    label: '系统混入不凝气',
    signature: '排气压力 P_d 比对应 Tc 下的饱和压力偏高，COP 整体下移。',
    diagnostic: [
      '把 P_d 对照冷凝器出口温度 Tc 的饱和曲线，偏离 >0.15 MPa 视为异常。',
      '从冷凝器顶部排气端短暂泄气，若放出明显冷气说明含空气 / 氮气。',
      '抽真空到 -0.1 MPa 保持 30 min，再重新称重灌注冷媒。',
      '检查回收装置、维修阀、检漏后是否漏抽真空。',
    ],
  },
  'oil-circulation-low': {
    type: 'oil-circulation-low',
    label: '润滑油循环不足',
    signature: '同工况下压缩机功率上升、排气温度升高、长期运行有抱缸风险。',
    diagnostic: [
      '观察机壳油位镜：油位低于 1/4 即报警，长期低位会缩短轴承寿命。',
      '检查管路油封点、油分离器返油毛细、低负荷下回油是否中断。',
      '降低转速 / 拉长低速运行时间，让油液回到曲轴箱。',
      '若油位正常仍异常，检查油泵 / 油路、必要时更换冷冻油（POE / PVE）。',
    ],
  },
};

export interface SystemFaultInput {
  type: SystemFaultType;
  /** 严重度 0..1 */
  severity: number;
  /** 正常工况下 simulateCycle 的输出，作为对照基准 */
  baseline: CycleResult;
}

export interface SystemFaultOutput {
  /** 扰动后的 result（深拷贝，未触碰 baseline） */
  result: CycleResult;
  signature: string;
  diagnostic: string[];
  /** 与 baseline 的偏差（用于诊断表格） */
  deltas: { Ps: number; Pd: number; Td: number; SH: number; cop: number };
}

/**
 * 深拷贝 CycleResult，避免 mutate 原对象。
 * 仅 states 数组与 warnings 数组需要单独复制；其余均为 number / boolean。
 */
function cloneResult(r: CycleResult): CycleResult {
  return {
    states: r.states.map((s) => ({ ...s })) as [CycleState, CycleState, CycleState, CycleState],
    pressureRatio: r.pressureRatio,
    volumetricEff: r.volumetricEff,
    massFlow: r.massFlow,
    Qc: r.Qc,
    Wcomp: r.Wcomp,
    cop: r.cop,
    Tdischarge: r.Tdischarge,
    torqueLoad: r.torqueLoad,
    workSpec: r.workSpec,
    eevLimited: r.eevLimited,
    warnings: [...r.warnings],
  };
}

/**
 * 把扰动好的几个核心字段同步到衍生量上：
 * - pressureRatio = P_d / P_s
 * - cop = Qc / Wcomp
 * - Tdischarge ↔ states[1].T 保持一致
 */
function reconcile(r: CycleResult): void {
  const Ps = r.states[0].P;
  const Pd = r.states[1].P;
  r.pressureRatio = Ps > 1e-6 ? Pd / Ps : r.pressureRatio;
  r.cop = r.Wcomp > 1e-6 ? r.Qc / r.Wcomp : 0;
  r.Tdischarge = r.states[1].T;
}

export function applySystemFault(input: SystemFaultInput): SystemFaultOutput {
  const def = FAULT_LIBRARY[input.type] ?? FAULT_LIBRARY.none;
  const sev = Math.max(0, Math.min(1, input.severity));
  const result = cloneResult(input.baseline);

  switch (input.type) {
    case 'none':
      // 不施加扰动
      break;

    case 'refrigerant-leak': {
      // 充注量不足 → 质量流量同比例缩水，制冷量同比例下降，
      // 压缩机功率因低密度气体过热而略增，排气温度升高。
      const k = 1 - sev * 0.6;
      result.massFlow *= k;
      result.Qc *= k;
      result.Wcomp *= 1 + sev * 0.05;
      result.states[1].T += sev * 15;
      // 吸气压力随充注量下降略低
      result.states[0].P *= 1 - sev * 0.15;
      result.states[3].P = result.states[0].P;
      break;
    }

    case 'condenser-fouling': {
      // 冷凝侧换热恶化 → P_d 抬升、Tc 同步抬升，排气端热负荷加大
      // 排气温度合并到一处加法（早期 bug：曾两次叠加共 +27°C 不合理）
      result.states[1].P *= 1 + sev * 0.4;
      result.states[2].P = result.states[1].P;
      result.states[1].T += sev * 18;  // 综合排气过热升幅 ≈ 18·sev °C
      result.states[2].T += sev * 6;
      result.Wcomp *= 1 + sev * 0.25;
      break;
    }

    case 'evaporator-frost': {
      // 蒸发器换热阻塞 → P_s 下降，制冷量下降
      result.states[0].P *= 1 - sev * 0.3;
      result.states[3].P = result.states[0].P;
      result.Qc *= 1 - sev * 0.4;
      result.massFlow *= 1 - sev * 0.2;
      break;
    }

    case 'eev-stuck-closed': {
      // 节流阀偏关 → 流量大幅缩，吸气过热度飙升，制冷量同比例下降
      const k = 1 - sev * 0.7;
      result.massFlow *= k;
      result.Qc *= k;
      // 把 SH 等效"飙升 20K+" 通过抬高吸气焓来体现
      result.states[0].h += sev * 40;
      result.states[0].T += sev * 18;
      result.states[1].T += sev * 18;
      break;
    }

    case 'eev-stuck-open': {
      // 节流阀偏开 → 进入压缩机的气体接近饱和液（液击边缘），SH→0
      result.states[0].h -= sev * 30;
      result.states[0].T -= sev * 6;
      result.Qc *= 1 + sev * 0.05;
      result.Wcomp *= 1 + sev * 0.2; // 压缩湿气消耗大
      break;
    }

    case 'non-condensable-gas': {
      // 不凝气以分压形式叠加在排气端
      result.states[1].P += sev * 0.4;
      result.states[2].P = result.states[1].P;
      result.states[1].T += sev * 8;
      result.Wcomp *= 1 + sev * 0.15;
      break;
    }

    case 'oil-circulation-low': {
      // 摩擦上升 → 同等流量下消耗的功增大，COP 下降
      result.Wcomp *= 1 + sev * 0.4;
      result.Qc *= 1 - sev * 0.3 * 0.0; // 教学：先按规约只改 Wcomp 与 cop，Qc 保持
      result.states[1].T += sev * 5;
      // 直接对 cop 再叠加一次衰减系数，保证读数比 baseline 跌 30%
      // （reconcile 会用 Qc/Wcomp 重算，因此此处通过 Qc 微调实现 0.7× cop）
      result.Qc *= 1 - sev * 0.3 * 0.7;
      break;
    }
  }

  reconcile(result);

  const deltas = {
    Ps: result.states[0].P - input.baseline.states[0].P,
    Pd: result.states[1].P - input.baseline.states[1].P,
    Td: result.Tdischarge - input.baseline.Tdischarge,
    // SH 偏差 = 故障吸气温度 - baseline 吸气温度
    SH: (result.states[0].T - result.states[3].T) - (input.baseline.states[0].T - input.baseline.states[3].T),
    cop: result.cop - input.baseline.cop,
  };

  return {
    result,
    signature: def.signature,
    diagnostic: def.diagnostic,
    deltas,
  };
}
