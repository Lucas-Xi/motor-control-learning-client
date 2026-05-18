import { create } from 'zustand';

type PanelId = 'formula' | 'code' | 'experiments';

/**
 * 中央 SimulationPanel 的视图模式：
 *  - 'module'：渲染当前 activeModule（默认）
 *  - 'curriculum'：展示课程主线（CurriculumPanel）；从 Sidebar 顶部入口切入
 *
 * 用 uiStore 而非 simulationStore：这是纯 UI 状态，跟仿真时钟无关，
 * 避免污染高频更新的 simulationStore。
 */
export type SimPanelView = 'module' | 'curriculum';

interface UIStore {
  expandedPanels: Record<PanelId, boolean>;
  togglePanel: (panel: PanelId) => void;
  simPanelView: SimPanelView;
  setSimPanelView: (view: SimPanelView) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  expandedPanels: { formula: true, code: false, experiments: true },
  togglePanel: (panel) => set((state) => ({ expandedPanels: { ...state.expandedPanels, [panel]: !state.expandedPanels[panel] } })),
  simPanelView: 'module',
  setSimPanelView: (simPanelView) => set({ simPanelView }),
}));
