import { useState } from 'react';
import { AssemblyWorkshop } from '../../components/workshop/AssemblyWorkshop';
import { ProjectExporter } from '../../components/lab/ProjectExporter';
import { SolutionReplay } from '../../components/workshop/SolutionReplay';
import { SnapshotDiffPanel } from '../../components/workshop/SnapshotDiffPanel';
import { CalibrationDocExporter } from '../../components/workshop/CalibrationDocExporter';
import { SerialBenchPanel } from '../../components/lab/SerialBenchPanel';
import { ShareSnapshotPanel } from '../../components/share/ShareSnapshotPanel';
import { Tabs } from '../../components/ui/Tabs';
import { useI18n } from '../../i18n/useI18n';
import { MotorAssembly3D } from '../../components/three/MotorAssembly3D';
import { RotorEccentricityCard } from './RotorEccentricityCard';
import { WindingDiagramCard } from './WindingDiagramCard';

type WorkshopTab = 'workshop' | 'serial';

/**
 * 17 号模块：整机搭建工作台。
 *
 * 复用 AssemblyWorkshop 组件，传 `embedded` 跳过 modal 壳，直接嵌入模块页面布局。
 * 工作台自带 6 槽位 + 3 模式 tab（自由搭建 / 挑战 / 历史），所以本模块页面
 * 不需要 ParameterPanel / ConceptNotes 等标准模块脚手架。
 *
 * 顶层加一个"虚拟搭建 / 实测对照"切换：
 *  - 虚拟搭建：原有 AssemblyWorkshop + Phase C 四大功能
 *  - 实测对照：SerialBenchPanel（Web Serial 连真板 STM32 + 仿真曲线并排比对）
 *
 * 选 A 而非新开 sidebar 入口：实测对照天然属于"搭好板子后跑起来对比"这条
 * 实验路径，留在 17 号模块里上下游连续；新开顶层入口会让 sidebar 16+1+1
 * 失衡，并且需要改 Sidebar / SimulationPanel / uiStore 三处 layout 壳层。
 */
export function AssemblyWorkshopModule() {
  const { t } = useI18n();
  const [tab, setTab] = useState<WorkshopTab>('workshop');
  return (
    <div className="space-y-3">
      <Tabs<WorkshopTab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'workshop', label: t('assemblyWorkshop.tabWorkshop') },
          { value: 'serial', label: t('assemblyWorkshop.tabSerial') },
        ]}
      />
      {tab === 'workshop' ? (
        <>
          <MotorAssembly3D />
          <AssemblyWorkshop embedded />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <RotorEccentricityCard />
            <WindingDiagramCard />
          </div>
          <SolutionReplay />
          <SnapshotDiffPanel />
          <ShareSnapshotPanel />
          <ProjectExporter />
          <CalibrationDocExporter />
        </>
      ) : (
        <SerialBenchPanel />
      )}
    </div>
  );
}
