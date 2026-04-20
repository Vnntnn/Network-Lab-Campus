import { create } from "zustand";

interface LabPod {
  id: number;
  pod_number: number;
  pod_name: string;
  device_ip: string;
  device_type: "arista_eos" | "cisco_iosxe" | "cisco_iosxr";
  description: string;
}

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
