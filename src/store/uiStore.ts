import { create } from 'zustand';

type PanelId = 'formula' | 'code' | 'experiments';

/**
 * 中央 SimulationPanel 的视图模式：
 *  - 'module'：渲染当前 activeModule（默认）
 *  - 'curriculum'：展示课程主线（CurriculumPanel）；从 Sidebar 顶部入口切入
 *  - 'insights'：展示学习洞察（错题本 / 热力图 / 弱项推荐）；从 Sidebar 入口切入
 *
 * 用 uiStore 而非 simulationStore：这是纯 UI 状态，跟仿真时钟无关，
 * 避免污染高频更新的 simulationStore。
 */
export type SimPanelView = 'module' | 'curriculum' | 'insights';

interface UIStore {
  expandedPanels: Record<PanelId, boolean>;
  togglePanel: (panel: PanelId) => void;
  simPanelView: SimPanelView;
  setSimPanelView: (view: SimPanelView) => void;

  /* —— v0.2 双栏沉浸壳层状态 —— */
  /** 参数坞（桌面右侧 dock / 移动端底部抽屉）是否展开；默认收起，内容优先 */
  paramsDockOpen: boolean;
  setParamsDockOpen: (open: boolean) => void;
  toggleParamsDock: () => void;
  /** 底部波形区是否展开；收起时保留一条可点击的摘要栏 */
  waveformOpen: boolean;
  toggleWaveform: () => void;
  /** 命令面板（Ctrl+K 快速跳转模块 / 动作） */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** 新手引导是否已完成（localStorage 持久化由组件侧负责） */
  tourDone: boolean;
  setTourDone: (done: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  expandedPanels: { formula: true, code: false, experiments: true },
  togglePanel: (panel) => set((state) => ({ expandedPanels: { ...state.expandedPanels, [panel]: !state.expandedPanels[panel] } })),
  simPanelView: 'module',
  setSimPanelView: (simPanelView) => set({ simPanelView }),

  paramsDockOpen: false,
  setParamsDockOpen: (paramsDockOpen) => set({ paramsDockOpen }),
  toggleParamsDock: () => set((state) => ({ paramsDockOpen: !state.paramsDockOpen })),
  waveformOpen: true,
  toggleWaveform: () => set((state) => ({ waveformOpen: !state.waveformOpen })),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  tourDone: false,
  setTourDone: (tourDone) => set({ tourDone }),
}));
