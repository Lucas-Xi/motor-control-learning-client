import { useSimulationStore } from '../../store/simulationStore';
import { simulateCycle, type CycleResult, type CycleInput } from '../../simulation/math/vaporCycle';
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

let cachedFp = '';
let cachedResult: CycleResult | null = null;

/** export 给单测；UI 不应直接用，请走 useBenchCycle / runBenchCycle */
export function _buildCycleInput(refrig: RefrigerationParams, rpm: number): CycleInput {
  return {
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
}

/** export 给单测；fingerprint 用 | 分隔避免 (1,23) 与 (12,3) 撞 */
export function _cycleFingerprint(refrig: RefrigerationParams, rpm: number): string {
  return [
    refrig.refrigerant, refrig.Te, refrig.Tc,
    refrig.superheatK, refrig.subcoolK,
    refrig.displacementCc, refrig.clearanceRatio,
    refrig.isentropicEff, refrig.eevOpening,
    rpm,
  ].join('|');
}

/** Hook：订阅 refrigeration + motor.rpm，返回当前帧的 Bench 循环结果。 */
export function useBenchCycle(): CycleResult {
  const refrig = useSimulationStore((s) => s.refrigeration);
  const rpm = useSimulationStore((s) => s.motorBasics.rpm);
  const fp = _cycleFingerprint(refrig, rpm);
  if (fp === cachedFp && cachedResult) return cachedResult;
  const result = simulateCycle(_buildCycleInput(refrig, rpm));
  cachedFp = fp;
  cachedResult = result;
  return result;
}

/** 一次性运行（不进缓存，给 SnapshotComparePanel 等点击-触发场景用） */
export function runBenchCycle(refrig: RefrigerationParams, rpm: number): CycleResult {
  return simulateCycle(_buildCycleInput(refrig, rpm));
}
