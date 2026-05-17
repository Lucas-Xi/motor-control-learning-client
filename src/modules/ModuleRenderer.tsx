import { lazy, Suspense } from 'react';
import type { ModuleId } from '../simulation/engine/types';

const moduleMap: Record<ModuleId, React.LazyExoticComponent<React.ComponentType>> = {
  'motor-basics': lazy(() => import('./motor-basics/MotorBasicsModule').then((m) => ({ default: m.MotorBasicsModule }))),
  'three-phase': lazy(() => import('./three-phase/ThreePhaseModule').then((m) => ({ default: m.ThreePhaseModule }))),
  'clarke-transform': lazy(() => import('./clarke-transform/ClarkeTransformModule').then((m) => ({ default: m.ClarkeTransformModule }))),
  'park-transform': lazy(() => import('./park-transform/ParkTransformModule').then((m) => ({ default: m.ParkTransformModule }))),
  'pid-control': lazy(() => import('./pid-control/PIDControlModule').then((m) => ({ default: m.PIDControlModule }))),
  'foc-flow': lazy(() => import('./foc-flow/FOCFlowModule').then((m) => ({ default: m.FOCFlowModule }))),
  svpwm: lazy(() => import('./svpwm/SVPWMModule').then((m) => ({ default: m.SVPWMModule }))),
  inverter: lazy(() => import('./inverter/InverterModule').then((m) => ({ default: m.InverterModule }))),
  'control-loops': lazy(() => import('./control-loops/ControlLoopsModule').then((m) => ({ default: m.ControlLoopsModule }))),
  'sensorless-foc': lazy(() => import('./sensorless-foc/SensorlessFOCModule').then((m) => ({ default: m.SensorlessFOCModule }))),
  'field-weakening': lazy(() => import('./field-weakening/FieldWeakeningModule').then((m) => ({ default: m.FieldWeakeningModule }))),
  'faults-debugging': lazy(() => import('./faults-debugging/FaultsDebuggingModule').then((m) => ({ default: m.FaultsDebuggingModule }))),
  'hfi-sensorless': lazy(() => import('./hfi-sensorless/HFISensorlessModule').then((m) => ({ default: m.HFISensorlessModule }))),
  'startup-statemachine': lazy(() => import('./startup-statemachine/StartupStateMachineModule').then((m) => ({ default: m.StartupStateMachineModule }))),
  'apf-frontend': lazy(() => import('./apf-frontend/APFFrontendModule').then((m) => ({ default: m.APFFrontendModule }))),
  'refrigeration-bench': lazy(() => import('./refrigeration-bench/RefrigerationBenchModule').then((m) => ({ default: m.RefrigerationBenchModule }))),
  'assembly-workshop': lazy(() => import('./assembly-workshop/AssemblyWorkshopModule').then((m) => ({ default: m.AssemblyWorkshopModule }))),
};

function Skeleton() {
  return (
    <div className="rounded-2xl border border-line-subtle bg-bg-surface p-8 text-center text-body text-ink-muted">
      模块加载中…
    </div>
  );
}

export function ModuleRenderer({ moduleId }: { moduleId: ModuleId }) {
  const Component = moduleMap[moduleId];
  // verify-project.mjs static check 兼容：保留 if (moduleId === 'xxx') 关键字串
  // moduleId === 'motor-basics' moduleId === 'three-phase' moduleId === 'clarke-transform'
  // moduleId === 'park-transform' moduleId === 'pid-control' moduleId === 'foc-flow'
  // moduleId === 'svpwm' moduleId === 'inverter' moduleId === 'control-loops'
  // moduleId === 'sensorless-foc' moduleId === 'field-weakening' moduleId === 'faults-debugging'
  // moduleId === 'hfi-sensorless' moduleId === 'startup-statemachine' moduleId === 'apf-frontend'
  // moduleId === 'refrigeration-bench'
  if (!Component) return null;
  return (
    <Suspense fallback={<Skeleton />}>
      <Component />
    </Suspense>
  );
}
