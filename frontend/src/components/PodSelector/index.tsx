import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Database, Waypoints } from "lucide-react";
import { motion } from "framer-motion";
import { useQueries } from "@tanstack/react-query";
import { usePods } from "@/api/queries";
import type { LabPod, PingResponse } from "@/api/queries";
import { api } from "@/api/client";
import { usePodStore } from "@/stores/podStore";
import { usePodLockStore } from "@/stores/podLockStore";
import { useAppStore } from "@/stores/appStore";
import { usePodLockFeed } from "@/hooks/usePodLockFeed";
import { ViewLoading } from "@/components/ui/ViewLoading";
import { cn } from "@/components/ui/cn";
import { IsometricCampusMap, type PodCampusStatus } from "@/components/Scene/IsometricCampusMap";

const NAV_BUTTON =
  "inline-flex items-center gap-1.5 rounded-lg border border-edge-subtle bg-depth/75 px-3 py-1.5 text-2xs font-mono text-ink-muted transition-all hover:border-edge-glow hover:text-cyan-200 micro-tap";
const NAV_BAR =
  "absolute left-4 right-4 top-4 z-30 flex items-center justify-between gap-3 rounded-2xl border border-edge-subtle bg-surface/88 px-4 py-3 backdrop-blur-md";

export function PodSelector() {
  const { data: pods, isLoading, isError, error } = usePods();
  const setView = useAppStore((s) => s.setView);
  const selectPod = usePodStore((s) => s.selectPod);
  const selectedPod = usePodStore((s) => s.selectedPod);
  const activeLocks = usePodLockStore((s) => s.locks);
  const [lockNotice, setLockNotice] = useState<string | null>(null);

  usePodLockFeed();

  const previewNodes = pods ?? [];
  const totalNodes = previewNodes.length;
  const previewMode = totalNodes === 0;

  const pingQueries = useQueries({
    queries: previewNodes.map((pod) => ({
      queryKey: ["pod-ping", pod.id],
      queryFn: async () => (await api.get<PingResponse>(`/pods/${pod.id}/ping`)).data,
      enabled: !previewMode,
      refetchInterval: 30_000,
      retry: false,
    })),
  });

  const lockedPodIds = useMemo(() => {
    const now = Date.now();
    const ids = Object.values(activeLocks)
      .filter((lock) => lock.expiresAt > now)
      .map((lock) => lock.podId);
    return new Set(ids);
  }, [activeLocks]);

  const statusByPodId = useMemo(() => {
    const next: Partial<Record<number, PodCampusStatus>> = {};

    previewNodes.forEach((pod, index) => {
      if (lockedPodIds.has(pod.id)) {
        next[pod.id] = "locked";
        return;
      }

      const query = pingQueries[index];
      if (!query || query.isPending || query.isFetching) {
        next[pod.id] = "pending";
        return;
      }

      next[pod.id] = query.data?.reachable ? "online" : "offline";
    });

    return next;
  }, [previewNodes, pingQueries, lockedPodIds]);

  useEffect(() => {
    if (!lockNotice) return;
    const timer = window.setTimeout(() => setLockNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [lockNotice]);

  const handleSelectPod = (pod: LabPod) => {
    if (lockedPodIds.has(pod.id)) {
      setLockNotice(`${pod.pod_name} is temporarily locked while instructor push is in progress.`);
      return;
    }
    selectPod(pod);
    setView("builder");
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-void text-ink">
      <div className="pointer-events-none absolute inset-0 bg-grid-cyan opacity-15" />

      <div className="absolute inset-0 px-4 pb-4 pt-[84px]">
        <IsometricCampusMap
          pods={previewNodes}
          selectedPodId={selectedPod?.id ?? null}
          statusByPodId={statusByPodId}
          lockedPodIds={lockedPodIds}
          onSelectPod={handleSelectPod}
        />
      </div>

      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className={NAV_BAR}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-bright">Network Lab Campus</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView("topology")}
            className={cn(NAV_BUTTON, "border-edge-glow text-cyan-200 bg-cyan-glow/20")}
          >
            <Waypoints className="h-3 w-3" />
            Topology
          </button>
          <button
            type="button"
            onClick={() => setView("admin")}
            className={cn(NAV_BUTTON, "border-matrix/30 text-matrix bg-matrix/10")}
          >
            <Database className="h-3 w-3" />
            Manage Nodes
          </button>
        </div>
      </motion.header>

      <div className="absolute left-4 bottom-4 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-edge-subtle bg-surface/84 px-4 py-3 backdrop-blur-md">
        {selectedPod ? (
          <div className="flex items-center gap-2 text-xs font-mono text-ink-secondary">
            <span className="status-dot status-dot-online animate-status-ring" />
            selected node · {selectedPod.pod_name} · {selectedPod.device_ip}
          </div>
        ) : lockNotice ? (
          <div className="text-xs font-mono text-amber-200">{lockNotice}</div>
        ) : (
          <div className="text-xs font-mono text-ink-secondary">
            {previewMode ? "No seeded nodes yet. Run containerlab deploy and backend/seed.py to load the lab." : `Nodes loaded: ${totalNodes}. Click any labeled building to open config.`}
          </div>
        )}
      </div>

      {previewMode && (
        <div className="absolute left-4 top-[84px] z-30 rounded-2xl border border-amber-300/30 bg-amber-300/12 px-3 py-2 text-[11px] font-mono text-amber-100 backdrop-blur-md">
          Backend offline or empty. Seed from containerlab to load live nodes.
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-void/35 backdrop-blur-[2px]">
          <ViewLoading
            compact
            title="Rendering isometric campus"
            subtitle="Placing network blocks and live labels..."
          />
        </div>
      )}

      {isError && (
        <div className="absolute bottom-4 right-4 z-20 max-w-sm rounded-2xl border border-crimson/40 bg-crimson/10 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-crimson" />
            <div>
              <p className="text-sm font-semibold text-crimson">Backend unreachable</p>
              <p className="pt-0.5 text-xs text-ink-secondary">
                {(error as Error)?.message ?? "Backend is unreachable. Verify API service and proxy settings."}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
