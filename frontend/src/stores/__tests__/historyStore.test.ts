import { beforeEach, describe, expect, it } from "vitest";
import { useHistoryStore } from "@/stores/historyStore";

describe("historyStore", () => {
  beforeEach(() => {
    useHistoryStore.getState().clear();
  });

  it("retains rollback metadata for multi-step undo", () => {
    useHistoryStore.getState().add({
      timestamp: new Date("2026-01-01T00:00:00.000Z"),
      podName: "pod-1",
      podId: 1,
      preSnapshotId: 42,
      commands: ["hostname edge1"],
      success: true,
      output: "ok",
      elapsed_ms: 12,
    });

    const first = useHistoryStore.getState().entries[0] as {
      podId?: number;
      preSnapshotId?: number;
    };

    expect(first.podId).toBe(1);
    expect(first.preSnapshotId).toBe(42);
  });
});
