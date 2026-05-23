import { useSimulationStore } from '../../store/simulationStore';
import { useBenchHxStore, type BenchHxState } from '../../store/benchHxStore';
import { useBenchComplianceStore, type ComplianceKey } from '../../store/benchComplianceStore';
import { simulateCycle, type CycleResult, type CycleInput } from '../../simulation/math/vaporCycle';
import {
  createComplianceState,
  stepCompliance,
  resonanceFrequencies,
  sampleComplianceParams,
} from '../../simulation/math/mechanicalCompliance';
import type { RefrigerationParams } from '../../simulation/engine/types';

/**
 * 单源 Bench 循环结果。
 *
 * 之前 9 个组件各写一份 `useMemo(() => simulateCycle({...}), [refrig, motor.rpm])`，
 * 同一 refrigeration patch 之后 6-7 个订阅者会在同帧内重复跑 ~1.5–2 ms 的 simulateCycle。
 *
 * 这里用模块级 fingerprint 缓存：同帧内首个订阅者计算后，其它订阅者直接命中缓存。
 * 性能审计估算可省 ~1.5 ms/frame。
 *
 * 单元测试与一次性快照请用 `runBenchCycle(refrig, rpm)`（无缓存的纯函数版本）。
 */

/** useBenchCycle 扩展字段：开启传动柔性后附带的瞬态扭矩峰值 + 共振频率。 */
export interface BenchMechCompliance {
  /** 反液击瞬态轴扭簧 Tspring 峰值 (N·m) */
  peakTorqueNm: number;
  /** 共振频率 (Hz) */
  resonanceHz: number;
  /** 反共振频率 (Hz)；速度环带宽上限约为此值 / 5 */
  antiResonanceHz: number;
  /** 当前选用的传动预设 key */
  preset: ComplianceKey;
}

/**
 * useBenchCycle 实际返回的复合结果：CycleResult + 可选 mechCompliance。
 * mechCompliance 仅在 benchComplianceStore.enabled = true 时存在，
 * 调用方读时务必 narrow（result.mechCompliance && ...）。
 */
export type BenchCycleResult = CycleResult & { mechCompliance?: BenchMechCompliance };

/**
 * 反液击瞬态仿真：稳态在 torqueLoad，t=50ms 阶跃到 2× torqueLoad（5 ms 持续）→ 观察 Tspring。
 * 学员目的：同一稳态 KPI 在直驱 / 皮带 / 谐波减速器下，反液击瞬态扭矩峰值差异巨大。
 */
function computeMechCompliance(torqueLoadNm: number, preset: ComplianceKey): BenchMechCompliance {
  const params = sampleComplianceParams[preset];
  // 起步：把双质量预扭到稳态（Tspring ≈ torqueLoad）以避免 0→Tload 自身的冲击
  let state = createComplianceState();
  state = { ...state, thetaMotor: torqueLoadNm / Math.max(1, params.Ks) };

  let peak = 0;
  const dt = 1e-4; // 100 μs 子步上限，stepCompliance 内部按共振再细分
  const N = 1000;  // 共 100 ms
  for (let i = 0; i < N; i += 1) {
    // 50 ms 后做一个 5 ms 的 2× 扭矩反液击脉冲
    const inPulse = i >= 500 && i < 550;
    const TloadExt = inPulse ? 2 * torqueLoadNm : torqueLoadNm;
    state = stepCompliance({ Tem: torqueLoadNm, TloadExt, dt, params, state });
    const mag = Math.abs(state.Tspring);
    if (mag > peak) peak = mag;
  }

  const { resonanceHz, antiResonanceHz } = resonanceFrequencies(params);
  return { peakTorqueNm: peak, resonanceHz, antiResonanceHz, preset };
}

let cachedFp = '';
let cachedResult: BenchCycleResult | null = null;

/** export 给单测；UI 不应直接用，请走 useBenchCycle / runBenchCycle */
export function _buildCycleInput(
  refrig: RefrigerationParams,
  rpm: number,
  hx?: BenchHxState | null,
): CycleInput {
  const base: CycleInput = {
    refrigerant: refrig.refrigerant,
    Te: refrig.Te,
    Tc: refrig.Tc,
    superheatK: refrig.superheatK,
    subcoolK: refrig.subcoolK,
    displacementCc: refrig.displacementCc,
    clearanceRatio: refrig.clearanceRatio,
    // rpm 低于 100 视为停转，循环模型在这种工况下没有意义，统一用 3000 rpm 兜底
    rpm: rpm > 100 ? rpm : 3000,
    isentropicEff: refrig.isentropicEff,
    eevOpening: refrig.eevOpening,
  };
  if (hx?.enabled) {
    base.useHeatExchanger = {
      evap: { kind: 'evaporator', uaKWperK: hx.uaEvapKWperK, airFlowM3perS: hx.airFlowEvapM3perS },
      cond: { kind: 'condenser', uaKWperK: hx.uaCondKWperK, airFlowM3perS: hx.airFlowCondM3perS },
      TindoorC: hx.indoorC,
      ToutdoorC: hx.outdoorC,
    };
  }
  return base;
}

/** export 给单测；fingerprint 用 | 分隔避免 (1,23) 与 (12,3) 撞 */
export function _cycleFingerprint(
  refrig: RefrigerationParams,
  rpm: number,
  hx?: BenchHxState | null,
  mech?: { enabled: boolean; preset: ComplianceKey } | null,
): string {
  const baseFp = [
    refrig.refrigerant, refrig.Te, refrig.Tc,
    refrig.superheatK, refrig.subcoolK,
    refrig.displacementCc, refrig.clearanceRatio,
    refrig.isentropicEff, refrig.eevOpening,
    rpm,
  ].join('|');
  const hxFp = !hx?.enabled
    ? '|noHX'
    : '|' + [
        'hx',
        hx.uaEvapKWperK, hx.airFlowEvapM3perS,
        hx.uaCondKWperK, hx.airFlowCondM3perS,
        hx.indoorC, hx.outdoorC,
      ].join('|');
  const mechFp = !mech?.enabled ? '|noMech' : `|mech|${mech.preset}`;
  return baseFp + hxFp + mechFp;
}

/** Hook：订阅 refrigeration + motor.rpm（+ HX / 机械柔性状态如启用），返回当前帧的 Bench 循环结果。 */
export function useBenchCycle(): BenchCycleResult {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const rpm = useSimulationStore((s) => s.motorBasics.rpm);
  const hx = useBenchHxStore();
  const mechEnabled = useBenchComplianceStore((s) => s.enabled);
  const mechPreset = useBenchComplianceStore((s) => s.preset);
  const mech = { enabled: mechEnabled, preset: mechPreset };
  const fp = _cycleFingerprint(refrig, rpm, hx, mech);
  if (fp === cachedFp && cachedResult) return cachedResult;
  const cycle = simulateCycle(_buildCycleInput(refrig, rpm, hx));
  const result: BenchCycleResult = mechEnabled
    ? { ...cycle, mechCompliance: computeMechCompliance(cycle.torqueLoad, mechPreset) }
    : cycle;
  cachedFp = fp;
  cachedResult = result;
  return result;
}

/** 一次性运行（不进缓存，给 SnapshotComparePanel 等点击-触发场景用） */
export function runBenchCycle(
  refrig: RefrigerationParams,
  rpm: number,
  hx?: BenchHxState | null,
): CycleResult {
  return simulateCycle(_buildCycleInput(refrig, rpm, hx));
}
