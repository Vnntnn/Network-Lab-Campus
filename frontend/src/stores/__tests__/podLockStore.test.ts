import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePodLockStore } from "@/stores/podLockStore";

describe("podLockStore", () => {
  beforeEach(() => {
    usePodLockStore.setState({ locks: {} });
  });

  it("locks a pod for a bounded duration", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00.000Z");
    vi.setSystemTime(now);

    usePodLockStore.getState().lockPod(7, "pod-7", 5000);
    expect(usePodLockStore.getState().isLocked(7)).toBe(true);

    vi.setSystemTime(new Date(now.getTime() + 6000));
    usePodLockStore.getState().cleanupExpired();

    expect(usePodLockStore.getState().isLocked(7)).toBe(false);
    vi.useRealTimers();
  });

  it("unlocks immediately when an explicit unlock event arrives", () => {
    usePodLockStore.getState().lockPod(3, "pod-3", 30_000);
    expect(usePodLockStore.getState().isLocked(3)).toBe(true);

    usePodLockStore.getState().unlockPod(3);

    expect(usePodLockStore.getState().isLocked(3)).toBe(false);
  });
});
