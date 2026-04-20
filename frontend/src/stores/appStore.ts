import { create } from "zustand";

type AppView = "selector" | "builder" | "admin" | "topology" | "instructor" | "orchestrator";

interface AppStore {
  view: AppView;
  setView: (v: AppView) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  view: "selector",
  setView: (view) => set({ view }),
}));
