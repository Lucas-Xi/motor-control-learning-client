import { useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { StartupStateGraph } from '../../components/charts/StartupStateGraph';
import { useI18n } from '../../i18n/useI18n';
import { simulateStartup } from '../../simulation/math/startup';
import type { StartupState } from '../../simulation/engine/types';
import { useSimulationStore } from '../../store/simulationStore';

/**
 * 启动状态转移图（卡片包装）
 *
 * 数据源：
 *   - 当前 state / rpm 来自 store.startup（仿真重放：取仿真到当前 time 处的样本）
 *   - 阈值参数（hfiHandoffRpm 等）直接来自 store.startup
 *
 * 已访问状态在组件内 useState 累积，时间回退或参数变化时重置。
 *
 * 比例 hack：viewBox 720×360 = 2:1，用 padding-top: 50% 维持。
 */
export function StateGraphCard() {
  const { t } = useI18n();
  const params = useSimulationStore((s) => s.startup);
  const time = useSimulationStore((s) => s.time);

  const samples = useMemo(() => simulateStartup(params), [params]);

  // 取当前 time 对应的仿真样本
  const idx = Math.max(0, Math.min(samples.length - 1, Math.floor((time * 1000) / 10)));
  const sample = samples[idx];
  const currentState: StartupState = sample?.state ?? 'idle';
  const currentRpm = sample?.rpm ?? 0;

  // 已访问状态累积
  const [visited, setVisited] = useState<StartupState[]>([currentState]);
  const lastTimeRef = useRef(time);
  const lastParamsRef = useRef(params);

  useEffect(() => {
    // 时间回退（用户重置）或参数变化 → 清空已访问历史
    if (time < lastTimeRef.current || lastParamsRef.current !== params) {
      setVisited([currentState]);
      lastTimeRef.current = time;
      lastParamsRef.current = params;
      return;
    }
    lastTimeRef.current = time;
    setVisited((prev) => (prev.includes(currentState) ? prev : [...prev, currentState]));
  }, [currentState, time, params]);

  return (
    <Card title={t('startupStateMachine.stateGraphTitle')} eyebrow="state graph" density="compact">
      {/* padding-top hack 维持 2:1 比例 */}
      <div className="relative w-full" style={{ paddingTop: '50%' }}>
        <div className="absolute inset-0">
          <StartupStateGraph
            currentState={currentState}
            visitedStates={visited}
            currentRpm={currentRpm}
            hfiHandoffRpm={params.hfiHandoffRpm}
            bemfHandoffRpm={params.bemfHandoffRpm}
            fieldweakRpm={params.fieldweakRpm}
          />
        </div>
      </div>
    </Card>
  );
}
