import { AssemblyWorkshop } from '../../components/workshop/AssemblyWorkshop';

/**
 * 17 号模块：整机搭建工作台。
 *
 * 复用 AssemblyWorkshop 组件，传 `embedded` 跳过 modal 壳，直接嵌入模块页面布局。
 * 工作台自带 6 槽位 + 3 模式 tab（自由搭建 / 挑战 / 历史），所以本模块页面
 * 不需要 ParameterPanel / ConceptNotes 等标准模块脚手架。
 */
export function AssemblyWorkshopModule() {
  return (
    <div className="space-y-3">
      <AssemblyWorkshop embedded />
    </div>
  );
}
