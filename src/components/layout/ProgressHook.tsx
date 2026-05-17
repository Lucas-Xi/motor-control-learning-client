import { useEffect, useRef } from 'react';
import { useSimulationStore } from '../../store/simulationStore';
import { emptyModuleProgress, useProgressStore } from '../../store/progressStore';

/**
 * 学习进度副作用 hook 组件（不渲染 UI）。
 *
 * 职责：
 *  1. 订阅 useSimulationStore.activeModule 变化 → 调 progressStore.recordVisit；
 *  2. 每 5 秒 tick 一次 totalActiveMs（仅 document.visibilityState === 'visible' 时）；
 *  3. 在切出当前模块时，把"上次进入到现在"的 delta 累加到该模块的 totalTimeMs。
 *
 * 集成方式：在 AppShell.tsx 里加 `<ProgressHook />`，渲染位置任意（返回 null）。
 */
export function ProgressHook(): null {
  const activeModule = useSimulationStore((s) => s.activeModule);
  const recordVisit = useProgressStore((s) => s.recordVisit);
  const tickActiveTime = useProgressStore((s) => s.tickActiveTime);

  // 跟踪当前模块进入时间，用于切换瞬间累加 totalTimeMs
  const enterAtRef = useRef<number>(Date.now());
  const lastModuleRef = useRef<string | null>(null);

  // (1) activeModule 变化 → 记录访问 + 把上一模块的停留时间结算
  useEffect(() => {
    const now = Date.now();
    const prevModule = lastModuleRef.current;
    if (prevModule && prevModule !== activeModule) {
      const delta = Math.max(0, now - enterAtRef.current);
      // 把停留时长写入上一模块（不污染当前新模块的 totalTimeMs）
      if (delta > 0) {
        useProgressStore.setState((state) => {
          const prev = state.perModule[prevModule] ?? emptyModuleProgress();
          return {
            perModule: {
              ...state.perModule,
              [prevModule]: { ...prev, totalTimeMs: prev.totalTimeMs + delta },
            },
          };
        });
      }
    }
    lastModuleRef.current = activeModule;
    enterAtRef.current = now;
    recordVisit(activeModule);
  }, [activeModule, recordVisit]);

  // (2) 每 5s tick 一次活跃时间，仅 visible 时累加
  useEffect(() => {
    const STEP_MS = 5000;
    const id = window.setInterval(() => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;
      tickActiveTime(STEP_MS);
      // 同步给当前模块的 totalTimeMs 加 5s
      const current = lastModuleRef.current;
      if (current) {
        useProgressStore.setState((state) => {
          const prev = state.perModule[current] ?? emptyModuleProgress();
          return {
            perModule: {
              ...state.perModule,
              [current]: { ...prev, totalTimeMs: prev.totalTimeMs + STEP_MS },
            },
          };
        });
        // 重置 enterAt 避免和切换 effect 的 delta 双重计数
        enterAtRef.current = Date.now();
      }
    }, STEP_MS);
    return () => window.clearInterval(id);
  }, [tickActiveTime]);

  // (3) 卸载时把残余 delta 结算（极端情况下整个 App 退出，浏览器关闭可能丢失，但够用）
  useEffect(() => {
    return () => {
      const current = lastModuleRef.current;
      if (!current) return;
      const delta = Math.max(0, Date.now() - enterAtRef.current);
      if (delta <= 0) return;
      useProgressStore.setState((state) => {
        const prev = state.perModule[current] ?? emptyModuleProgress();
        return {
          perModule: {
            ...state.perModule,
            [current]: { ...prev, totalTimeMs: prev.totalTimeMs + delta },
          },
        };
      });
    };
  }, []);

  return null;
}
