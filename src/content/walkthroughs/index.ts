import type { ModuleId } from '../../simulation/engine/types';
import type { ModuleWalkthrough } from './types';

/**
 * 按需加载策略：16 个模块的 walkthrough 总和 ~50 KB gzip，
 * 全部同步引入会把首屏 index chunk 顶大。改成 `() => import(...)` 工厂，
 * 只有进入该模块时才下载对应 walkthrough chunk（与 lessons.ts 同套路）。
 *
 * GuidedExperimentBar 调用 `loadModuleWalkthrough(moduleId)` 拿 Promise，
 * 命中过的模块走 in-memory cache 不再请求。
 */

type Loader = () => Promise<{ default: ModuleWalkthrough }>;

const loaders: Partial<Record<ModuleId, Loader>> = {
  'motor-basics': () => import('./motor-basics').then((m) => ({ default: m.motorBasicsWalkthrough })),
  'three-phase': () => import('./three-phase').then((m) => ({ default: m.threePhaseWalkthrough })),
  'clarke-transform': () => import('./clarke-transform').then((m) => ({ default: m.clarkeTransformWalkthrough })),
  'park-transform': () => import('./park-transform').then((m) => ({ default: m.parkTransformWalkthrough })),
  'pid-control': () => import('./pid-control').then((m) => ({ default: m.pidControlWalkthrough })),
  'foc-flow': () => import('./foc-flow').then((m) => ({ default: m.focFlowWalkthrough })),
  svpwm: () => import('./svpwm').then((m) => ({ default: m.svpwmWalkthrough })),
  inverter: () => import('./inverter').then((m) => ({ default: m.inverterWalkthrough })),
  'control-loops': () => import('./control-loops').then((m) => ({ default: m.controlLoopsWalkthrough })),
  'sensorless-foc': () => import('./sensorless-foc').then((m) => ({ default: m.sensorlessFocWalkthrough })),
  'hfi-sensorless': () => import('./hfi-sensorless').then((m) => ({ default: m.hfiSensorlessWalkthrough })),
  'field-weakening': () => import('./field-weakening').then((m) => ({ default: m.fieldWeakeningWalkthrough })),
  'faults-debugging': () => import('./faults-debugging').then((m) => ({ default: m.faultsDebuggingWalkthrough })),
  'startup-statemachine': () => import('./startup-statemachine').then((m) => ({ default: m.startupStateMachineWalkthrough })),
  'apf-frontend': () => import('./apf-frontend').then((m) => ({ default: m.apfFrontendWalkthrough })),
  'refrigeration-bench': () => import('./refrigeration-bench').then((m) => ({ default: m.refrigerationBenchWalkthrough })),
  'assembly-workshop': () => import('./assembly-workshop').then((m) => ({ default: m.assemblyWorkshopWalkthrough })),
};

const cache = new Map<ModuleId, ModuleWalkthrough>();
// 在飞中请求池：用户快速切模块时同一 moduleId 可能被多次 load；
// 共享同一个 Promise 避免重复触发 dynamic import / 多次 setState。
const inFlight = new Map<ModuleId, Promise<ModuleWalkthrough | undefined>>();

/**
 * 异步拉本模块的 walkthrough；返回 Promise<ModuleWalkthrough | undefined>。
 * - 命中 cache：返回已 resolved promise（同步可用）
 * - 在飞中：共享同一 Promise
 * - 首次：下载 chunk → cache → 返回
 * - 没有 walkthrough 定义：返回 undefined（caller 自行回退到老 GuidedExperiment）
 */
export async function loadModuleWalkthrough(moduleId: ModuleId): Promise<ModuleWalkthrough | undefined> {
  const cached = cache.get(moduleId);
  if (cached) return cached;
  const flying = inFlight.get(moduleId);
  if (flying) return flying;
  const loader = loaders[moduleId];
  if (!loader) return undefined;
  const promise = loader().then((mod) => {
    cache.set(moduleId, mod.default);
    inFlight.delete(moduleId);
    return mod.default;
  }).catch((err) => {
    inFlight.delete(moduleId);  // 失败时清理，让下次重试能再发起
    throw err;
  });
  inFlight.set(moduleId, promise);
  return promise;
}

/** 同步检查 cache，命中才返回；用于避免重复 await */
export function getCachedWalkthrough(moduleId: ModuleId): ModuleWalkthrough | undefined {
  return cache.get(moduleId);
}

/** 哪些模块有 walkthrough（用于 UI 决定显示新 / 老引导条） */
export function hasWalkthrough(moduleId: ModuleId): boolean {
  return loaders[moduleId] !== undefined;
}

export type { ModuleWalkthrough, WalkthroughStep, Pitfall, QuizCheck } from './types';
