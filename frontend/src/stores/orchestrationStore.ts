import { create } from "zustand";

export interface OrchestratorResult {
  pod_id: number;
  pod_name: string;
  success: boolean;
  elapsed_ms: number;
  output: string;
  error?: string;
}

interface OrchStore {
  selectedPodIds: Set<number>;
  results: OrchestratorResult[];
  togglePod: (id: number) => void;
  selectAll: (ids: number[]) => void;
  clearSelection: () => void;
  setResults: (r: OrchestratorResult[]) => void;
}

export const useOrchStore = create<OrchStore>((set) => ({
  selectedPodIds: new Set<number>(),
  results: [],
  togglePod: (id) =>
    set((state) => {
      const next = new Set(state.selectedPodIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedPodIds: next };
    }),
  selectAll: (ids) => set({ selectedPodIds: new Set(ids) }),
  clearSelection: () => set({ selectedPodIds: new Set<number>() }),
  setResults: (results) => set({ results }),
}));
