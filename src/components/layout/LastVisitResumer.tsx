import { useEffect, useRef } from 'react';
import type { ModuleId } from '../../simulation/engine/types';
import { useProgressStore } from '../../store/progressStore';
import { useSimulationStore } from '../../store/simulationStore';

/**
 * 自学场景下：冷启动时把 activeModule 恢复成上次访问最晚的那个模块。
 *
 * 设计取舍：
 *   - 只在初始挂载时跑一次（useRef 守 + `[]` deps），不要拦截用户后续的模块切换
 *   - 默认 `activeModule` 是 simulationStore 里硬编码的 'three-phase'；
 *     如果学员之前学到 10 号无感 FOC，应该回 10 号继续，不要每次从默认页找起
 *   - 必须在 ProgressHook 的 recordVisit 跑之前生效，否则首屏 activeModule 已经被算作"刚刚访问"
 *     —— 由 AppShell 里把 <LastVisitResumer/> 摆在 <ProgressHook/> 之前来保证 effect 顺序
 *   - 若用户从未访问过任何模块（首次打开），保持默认值不动
 *
 * 渲染 null，仅副作用。
 */
export function LastVisitResumer(): null {
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const perModule = useProgressStore.getState().perModule;
    const ids = Object.keys(perModule);
    if (ids.length === 0) return;  // 首次打开，留在默认页

    let bestId: ModuleId | null = null;
    let bestTs = 0;
    for (const id of ids) {
      const p = perModule[id];
      const ts = p?.lastVisited ?? 0;
      if (ts > bestTs) {
        bestTs = ts;
        bestId = id as ModuleId;
      }
    }
    if (!bestId) return;

    const sim = useSimulationStore.getState();
    if (sim.activeModule !== bestId) {
      sim.setActiveModule(bestId);
    }
  }, []);

  return null;
}
