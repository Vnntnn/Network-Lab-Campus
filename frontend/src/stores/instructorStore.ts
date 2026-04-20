import { create } from "zustand";

export interface PushEvent {
  type: "push";
  pod_id: number;
  pod_name: string;
  device_ip: string;
  success: boolean;
  elapsed_ms: number;
  command_count: number;
  ts: string;
}

interface InstructorStore {
  pin: string;
  authed: boolean;
  events: PushEvent[];
  wsStatus: "disconnected" | "connecting" | "authed" | "error";
  setPin: (pin: string) => void;
  setAuthed: (v: boolean) => void;
  setStatus: (s: InstructorStore["wsStatus"]) => void;
  addEvent: (e: PushEvent) => void;
  clearEvents: () => void;
}

export const useInstructorStore = create<InstructorStore>((set) => ({
  pin: localStorage.getItem("instructor-pin") ?? "",
  authed: false,
  events: [],
  wsStatus: "disconnected",
  setPin: (pin) => {
    localStorage.setItem("instructor-pin", pin);
    set({ pin });
  },
  setAuthed: (authed) => set({ authed }),
  setStatus: (wsStatus) => set({ wsStatus }),
  addEvent: (e) => set((s) => ({ events: [e, ...s.events].slice(0, 200) })),
  clearEvents: () => set({ events: [] }),
}));
