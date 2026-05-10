import { create } from 'zustand';

type PanelId = 'formula' | 'code' | 'experiments';

interface UIStore {
  expandedPanels: Record<PanelId, boolean>;
  togglePanel: (panel: PanelId) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  expandedPanels: { formula: true, code: false, experiments: true },
  togglePanel: (panel) => set((state) => ({ expandedPanels: { ...state.expandedPanels, [panel]: !state.expandedPanels[panel] } })),
}));
