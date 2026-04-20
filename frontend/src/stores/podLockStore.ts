import { create } from "zustand";

export interface PodLock {
  podId: number;
  podName?: string;
  source: "instructor";
  expiresAt: number;
}

interface PodLockStore {
  locks: Record<number, PodLock>;
  lockPod: (podId: number, podName?: string, durationMs?: number) => void;
  unlockPod: (podId: number) => void;
  cleanupExpired: (nowMs?: number) => void;
  isLocked: (podId: number, nowMs?: number) => boolean;
}

const DEFAULT_LOCK_MS = 45_000;

export const usePodLockStore = create<PodLockStore>((set, get) => ({
  locks: {},

  lockPod: (podId, podName, durationMs = DEFAULT_LOCK_MS) => {
    const expiresAt = Date.now() + Math.max(1000, durationMs);
    set((state) => ({
      locks: {
        ...state.locks,
        [podId]: {
          podId,
          podName,
          source: "instructor",
          expiresAt,
        },
      },
    }));
  },

  unlockPod: (podId) => {
    set((state) => {
      if (!state.locks[podId]) return state;
      const next = { ...state.locks };
      delete next[podId];
      return { locks: next };
    });
  },

  cleanupExpired: (nowMs = Date.now()) => {
    set((state) => {
      const next: Record<number, PodLock> = {};
      let changed = false;

      for (const [rawPodId, lock] of Object.entries(state.locks)) {
        if (lock.expiresAt > nowMs) {
          next[Number(rawPodId)] = lock;
        } else {
          changed = true;
        }
      }

      return changed ? { locks: next } : state;
    });
  },

  isLocked: (podId, nowMs = Date.now()) => {
    const lock = get().locks[podId];
    return !!lock && lock.expiresAt > nowMs;
  },
}));
