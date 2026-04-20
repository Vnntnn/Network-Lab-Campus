import { create } from "zustand";
import type { LabPod } from "@/api/queries";

interface PodStore {
  selectedPod: LabPod | null;
  selectPod: (pod: LabPod) => void;
  clearPod: () => void;
}

export const usePodStore = create<PodStore>((set) => ({
  selectedPod: null,
  selectPod: (pod) => set({ selectedPod: pod }),
  clearPod: () => set({ selectedPod: null }),
}));
