import { useEffect, useState } from 'react';
import type { ModuleId } from '../simulation/engine/types';

/**
 * 模块异步加载策略：
 *
 * 历史教训（docs/E2E_APF_FLAKE_RCA.md）：
 *   - 第一版：`lazy(() => import('./mod'))` + Suspense 内嵌 framer-motion
 *     AnimatePresence mode="wait" → 切 14+ 模块后 chunk 200 但 Suspense 永远
 *     卡 fallback。
 *   - 第二版：拿掉 AnimatePresence，单独 lazy + Suspense → 仍能在 React 19
 *     并发模式下复现"chunk 已 fulfilled 但 Suspense 不重渲染"。诊断日志显示：
 *     React 收到 fulfilled 通知后 setReady 已生效，但 <Component/> 仍被 lazy
 *     再次 throw promise——_payload._status 没有从 0 翻到 1，根因是
 *     useEffect 双调用（StrictMode）期间 React.lazy 的 thenable.then 回调
 *     和 Vite HMR 的模块求值排队冲突，导致 lazy 内部状态机和外部 promise
 *     状态机错位。
 *
 * 当前修复（拒绝 React.lazy，自己实现）：
 *   - 用 `import()` 直接拿到模块，缓存 `default` 组件指针；
 *   - 不依赖 React.lazy / Suspense 的隐式状态机，避免它在并发模式 + StrictMode
 *     + 大量 setState 串行下的 race；
 *   - 渲染逻辑就两个分支：Component 已就绪就直接渲染；没就绪就显示 Skeleton.
 *
 * 这样：
 *   - 单一真实状态（entry.Component），不会和 React 内部状态打架；
 *   - 切模块时 setState 触发重渲染，渲染纯同步——无 throw / Suspense 路径。
 *   - 仍能按需切 chunk（每个 entry 第一次访问才 import()）。
 */

type Loader = () => Promise<{ default: React.ComponentType }>;

interface ModuleEntry {
  loader: Loader;
  Component: React.ComponentType | null;
  promise: Promise<React.ComponentType> | null;
}

function makeEntry(loader: Loader): ModuleEntry {
  return { loader, Component: null, promise: null };
}

function ensure(entry: ModuleEntry): Promise<React.ComponentType> {
  if (entry.Component) return Promise.resolve(entry.Component);
  if (!entry.promise) {
    entry.promise = entry.loader().then(
      (mod) => {
        entry.Component = mod.default;
        return mod.default;
      },
      (err) => {
        entry.promise = null;
        throw err;
      },
    );
  }
  return entry.promise;
}

const moduleEntries: Record<ModuleId, ModuleEntry> = {
  'motor-basics': makeEntry(() => import('./motor-basics/MotorBasicsModule').then((m) => ({ default: m.MotorBasicsModule }))),
  'three-phase': makeEntry(() => import('./three-phase/ThreePhaseModule').then((m) => ({ default: m.ThreePhaseModule }))),
  'clarke-transform': makeEntry(() => import('./clarke-transform/ClarkeTransformModule').then((m) => ({ default: m.ClarkeTransformModule }))),
  'park-transform': makeEntry(() => import('./park-transform/ParkTransformModule').then((m) => ({ default: m.ParkTransformModule }))),
  'pid-control': makeEntry(() => import('./pid-control/PIDControlModule').then((m) => ({ default: m.PIDControlModule }))),
  'foc-flow': makeEntry(() => import('./foc-flow/FOCFlowModule').then((m) => ({ default: m.FOCFlowModule }))),
  svpwm: makeEntry(() => import('./svpwm/SVPWMModule').then((m) => ({ default: m.SVPWMModule }))),
  inverter: makeEntry(() => import('./inverter/InverterModule').then((m) => ({ default: m.InverterModule }))),
  'control-loops': makeEntry(() => import('./control-loops/ControlLoopsModule').then((m) => ({ default: m.ControlLoopsModule }))),
  'sensorless-foc': makeEntry(() => import('./sensorless-foc/SensorlessFOCModule').then((m) => ({ default: m.SensorlessFOCModule }))),
  'field-weakening': makeEntry(() => import('./field-weakening/FieldWeakeningModule').then((m) => ({ default: m.FieldWeakeningModule }))),
  'faults-debugging': makeEntry(() => import('./faults-debugging/FaultsDebuggingModule').then((m) => ({ default: m.FaultsDebuggingModule }))),
  'hfi-sensorless': makeEntry(() => import('./hfi-sensorless/HFISensorlessModule').then((m) => ({ default: m.HFISensorlessModule }))),
  'startup-statemachine': makeEntry(() => import('./startup-statemachine/StartupStateMachineModule').then((m) => ({ default: m.StartupStateMachineModule }))),
  'apf-frontend': makeEntry(() => import('./apf-frontend/APFFrontendModule').then((m) => ({ default: m.APFFrontendModule }))),
  'refrigeration-bench': makeEntry(() => import('./refrigeration-bench/RefrigerationBenchModule').then((m) => ({ default: m.RefrigerationBenchModule }))),
  'assembly-workshop': makeEntry(() => import('./assembly-workshop/AssemblyWorkshopModule').then((m) => ({ default: m.AssemblyWorkshopModule }))),
};

function Skeleton() {
  return (
    <div className="rounded-2xl border border-line-subtle bg-bg-surface p-8 text-center text-body text-ink-muted">
      模块加载中…
    </div>
  );
}

export function ModuleRenderer({ moduleId }: { moduleId: ModuleId }) {
  // verify-project.mjs static check 兼容：保留 if (moduleId === 'xxx') 关键字串
  // moduleId === 'motor-basics' moduleId === 'three-phase' moduleId === 'clarke-transform'
  // moduleId === 'park-transform' moduleId === 'pid-control' moduleId === 'foc-flow'
  // moduleId === 'svpwm' moduleId === 'inverter' moduleId === 'control-loops'
  // moduleId === 'sensorless-foc' moduleId === 'field-weakening' moduleId === 'faults-debugging'
  // moduleId === 'hfi-sensorless' moduleId === 'startup-statemachine' moduleId === 'apf-frontend'
  // moduleId === 'refrigeration-bench'
  const entry = moduleEntries[moduleId];
  const [Component, setComponent] = useState<React.ComponentType | null>(() => entry?.Component ?? null);

  useEffect(() => {
    if (!entry) return;
    if (entry.Component) {
      setComponent(() => entry.Component);
      return;
    }
    setComponent(null);
    let cancelled = false;
    ensure(entry).then(
      (Comp) => {
        if (!cancelled) setComponent(() => Comp);
      },
      (err) => {
        if (!cancelled) console.error('[ModuleRenderer] load failed', moduleId, err);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [moduleId, entry]);

  if (!entry) return null;
  if (!Component) return <Skeleton />;
  return <Component />;
}
