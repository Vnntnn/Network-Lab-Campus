import { create } from "zustand";

export interface HistoryEntry {
  id: string;
  timestamp: Date;
  podName: string;
  podId?: number;
  preSnapshotId?: number | null;
  commands: string[];
  success: boolean;
  output: string;
  elapsed_ms: number;
}

interface HistoryStore {
  entries: HistoryEntry[];
  add: (entry: Omit<HistoryEntry, "id">) => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryStore>((set) => ({
  entries: [],
  add: (entry) =>
    set((s) => ({
      entries: [
        { ...entry, id: crypto.randomUUID() },
        ...s.entries,
      ].slice(0, 50), // keep last 50
    })),
  clear: () => set({ entries: [] }),
}));
