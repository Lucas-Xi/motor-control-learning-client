import { AssemblyWorkshop } from '../../components/workshop/AssemblyWorkshop';
import { ProjectExporter } from '../../components/lab/ProjectExporter';
import { SolutionReplay } from '../../components/workshop/SolutionReplay';
import { SnapshotDiffPanel } from '../../components/workshop/SnapshotDiffPanel';
import { CalibrationDocExporter } from '../../components/workshop/CalibrationDocExporter';

/**
 * 17 号模块：整机搭建工作台。
 *
 * 复用 AssemblyWorkshop 组件，传 `embedded` 跳过 modal 壳，直接嵌入模块页面布局。
 * 工作台自带 6 槽位 + 3 模式 tab（自由搭建 / 挑战 / 历史），所以本模块页面
 * 不需要 ParameterPanel / ConceptNotes 等标准模块脚手架。
 *
 * 工作台之下追加 Phase C 四大功能：
 *  - SolutionReplay：挑战模式解题路径回放（5s/step 自动播放，跨刷新持久化）
 *  - SnapshotDiffPanel：历史会话两两对比（6 slot + 4 KPI 并排）
 *  - ProjectExporter：STM32 C 工程骨架导出（含真 .zip 选项）
 *  - CalibrationDocExporter：Markdown 标定单 + 真 .zip 一键下发
 */
export function AssemblyWorkshopModule() {
  return (
    <div className="space-y-3">
      <AssemblyWorkshop embedded />
      <SolutionReplay />
      <SnapshotDiffPanel />
      <ProjectExporter />
      <CalibrationDocExporter />
    </div>
  );
}
