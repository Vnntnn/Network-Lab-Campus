import { useEffect } from "react";
import { usePodLockStore } from "@/stores/podLockStore";
import { buildWsUrl } from "@/api/ws";

type PushFeedEvent = {
  type?: string;
  pod_id?: number;
  pod_name?: string;
  duration_ms?: number;
};

const RETRY_MS = 1500;
const CLEANUP_MS = 1000;
const LOCK_MS = 45_000;

export function usePodLockFeed() {
  const lockPod = usePodLockStore((s) => s.lockPod);
  const unlockPod = usePodLockStore((s) => s.unlockPod);
  const cleanupExpired = usePodLockStore((s) => s.cleanupExpired);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimer: number | null = null;
    let disposed = false;

    const connect = () => {
      ws = new WebSocket(buildWsUrl("/api/v1/instructor/feed"));

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as PushFeedEvent;
          if (typeof payload.pod_id !== "number") return;

          if (payload.type === "pod.unlock") {
            unlockPod(payload.pod_id);
            return;
          }

          if (payload.type === "pod.lock") {
            lockPod(payload.pod_id, payload.pod_name, payload.duration_ms ?? LOCK_MS);
            return;
          }

          if (payload.type === "push") {
            // Compatibility with older backend payloads that only emit "push".
            lockPod(payload.pod_id, payload.pod_name, LOCK_MS);
          }
        } catch {
          // Ignore malformed feed events.
        }
      };

      ws.onerror = () => {
        ws?.close();
      };

      ws.onclose = () => {
        if (disposed) return;
        retryTimer = window.setTimeout(connect, RETRY_MS);
      };
    };

    connect();
    const gcTimer = window.setInterval(() => cleanupExpired(), CLEANUP_MS);

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      window.clearInterval(gcTimer);
      ws?.close();
    };
  }, [cleanupExpired, lockPod, unlockPod]);
}
