import { useMemo } from 'react';
import { CodeLabCard } from '../../components/lab/CodeLabCard';
import { ConceptNotes } from '../../components/layout/ConceptNotes';
import { ModuleLayout } from '../../components/layout/ModuleLayout';
import { simulatePfcCycle } from '../../simulation/math/boostPfc';
import { useSimulationStore } from '../../store/simulationStore';
import { DualLoopBlockDiagram } from './DualLoopBlockDiagram';
import { PfcWaveformCard } from './PfcWaveformCard';
import { PfcSpectrumCard } from './PfcSpectrumCard';
import { SwitchingPfcCard } from './SwitchingPfcCard';
import { PfcCompareSummaryCard } from './PfcCompareSummaryCard';
import { PfcControlTuningCard } from './PfcControlTuningCard';
import { SerialComparePFCCard } from './SerialComparePFCCard';

/**
 * 15 号 · APF 前级（Boost PFC）—— 工程级双环 + 谐波抑制学习台。
 *
 * 布局（ModuleLayout 三槽）：
 *   primary：双环结构图 + 波形对比（PFC vs 裸整流）
 *   probe  ：频谱卡 + 开关级纹波卡 + 整定/阶跃响应卡
 *   concept：教学讲义（ConceptNotes，复用现有内容）
 *
 * 数据流：
 *   - 单一仿真源 = simulatePfcCycle(apf 参数)；
 *   - 所有"对比型"卡片消费同一份结果，UI 切换"PFC / 裸整流"只是选择不同
 *     数组列，不重跑仿真；
 *   - 整定卡独立跑一次"带负载阶跃"的仿真，关注的是动态响应而非稳态谐波。
 *   - SwitchingPfcCard 自跑开关级仿真（三角载波 × i_L 锯齿），不复用平均模型。
 */
export function APFFrontendModule() {
  const apf = useSimulationStore((s) => s.apf);

  // 主仿真：稳态、无阶跃；提供 PFC + 裸整流 两套电流序列
  const result = useMemo(
    () =>
      simulatePfcCycle({
        Vac_rms: apf.vAcRms,
        Vdc_ref: apf.udcRef,
        L_mH: apf.boostInductanceMh,
        C_uF: apf.boostCapacitanceUf,
        load_W: Math.max(50, apf.udcRef * apf.loadCurrent),
        Kpv: apf.voltageKp,
        Kiv: apf.voltageKi,
        Kpi: apf.currentKp,
        Kii: apf.currentKi,
      }),
    [apf],
  );

  return (
    <ModuleLayout
      primary={
        <div className="space-y-4">
          <DualLoopBlockDiagram />
          <PfcWaveformCard result={result} />
        </div>
      }
      probe={
        <>
          <PfcCompareSummaryCard result={result} />
          <PfcSpectrumCard result={result} />
          <SwitchingPfcCard />
          <PfcControlTuningCard />
          <SerialComparePFCCard />
          <CodeLabCard />
        </>
      }
      concept={<ConceptNotes moduleId="apf-frontend" />}
    />
  );
}
