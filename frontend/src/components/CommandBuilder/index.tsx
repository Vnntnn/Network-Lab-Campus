import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Send, Server, AlertCircle, CheckCircle2,
  PanelRightOpen, PanelRightClose, Wifi, WifiOff, Camera,
  ChevronRight,
} from "lucide-react";
import { usePodStore } from "@/stores/podStore";
import { usePushCommands, useBackendHealth } from "@/api/queries";
import { useAppStore } from "@/stores/appStore";
import { Badge } from "@/components/ui/Badge";
import { ViewLoading } from "@/components/ui/ViewLoading";
import { GuiPane } from "./GuiPane";
import { TerminalPane } from "./TerminalPane";
import { HistoryPanel } from "./HistoryPanel";
import { SnapshotDrawer } from "./SnapshotDrawer";
import { type Feature } from "./verifyCommands";
import { cn } from "@/components/ui/cn";

const DEVICE_LABELS: Record<string, string> = {
  arista_eos:  "Arista EOS",
  cisco_iosxe: "Cisco IOS-XE",
  cisco_iosxr: "Cisco IOS-XR",
};

const DEVICE_ACCENT: Record<string, string> = {
  arista_eos:  "#2de6aa",
  cisco_iosxe: "#31c4ff",
  cisco_iosxr: "#8594ff",
};

function ConnectionBadge() {
  const { data, isError, isPending } = useBackendHealth();
  if (isPending)
    return (
      <span className="flex items-center gap-1.5 text-2xs font-mono text-ink-muted">
        <span className="status-dot status-dot-pending" /> Connecting…
      </span>
    );
  if (isError || data?.status !== "ok")
    return (
      <span className="flex items-center gap-1.5 text-2xs font-mono text-crimson">
        <WifiOff className="h-3 w-3" /> Offline
      </span>
    );
  return (
    <Badge variant="matrix">
      <Wifi className="mr-1 h-3 w-3" /> Live
    </Badge>
  );
}

export function CommandBuilder() {
  const pod        = usePodStore((s) => s.selectedPod);
  const clearPod   = usePodStore((s) => s.clearPod);
  const setView    = useAppStore((s) => s.setView);

  const [commands,      setCommands]      = useState<string[]>([]);
  const [showHistory,   setShowHistory]   = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [activeFeature, setActiveFeature] = useState<Feature>("interface");

  const { mutate: push, isPending, data: pushResult, error: pushError, reset } = usePushCommands();

  const handlePush = useCallback(() => {
    if (!pod || commands.length === 0 || isPending) return;
    const activePod = pod;
    reset();
    push(
      { pod_id: activePod.id, commands },
      {
        onSettled: () => {
          if (!showHistory) setShowHistory(true);
        },
      }
    );
  }, [commands, isPending, reset, push, pod, showHistory]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handlePush();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlePush]);

  useEffect(() => {
    if (!pod) setView("selector");
  }, [pod, setView]);

  if (!pod) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-abyss">
        <ViewLoading compact title="Returning To Node Selection" subtitle="Rehydrating main workspace…" />
      </div>
    );
  }

  const pushOutput = pushResult?.output ?? (pushError ? `Error: ${pushError.message}` : null);
  const accent = DEVICE_ACCENT[pod.device_type] ?? "#31c4ff";

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-abyss">

      {/* ── Animated grid background ──────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 bg-grid-animated opacity-100" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(49,196,255,0.07),transparent)]" />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="relative z-10 flex flex-shrink-0 items-center justify-between gap-4 glass-nav px-6 py-3.5">
        {/* Left: navigation + pod identity */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={clearPod}
            className="flex flex-shrink-0 items-center gap-1 text-xs font-mono text-ink-muted transition-colors hover:text-cyan-300 micro-tap"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">nodes</span>
          </button>

          <ChevronRight className="h-3 w-3 flex-shrink-0 text-ink-muted/40" />

          {/* Device icon + name */}
          <div className="flex min-w-0 items-center gap-2.5">
            <div
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border"
              style={{ borderColor: accent + "55", background: accent + "14" }}
            >
              <Server className="h-4 w-4" style={{ color: accent }} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-ink-bright">
                {pod.pod_name}
              </p>
              <p className="text-2xs font-mono text-ink-muted">{pod.device_ip}</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            <Badge variant="cyan" className="flex-shrink-0">
              {DEVICE_LABELS[pod.device_type] ?? pod.device_type}
            </Badge>
            <ConnectionBadge />
          </div>
        </div>

        {/* Right: push status + panel toggles + push button */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {/* Push result pill */}
          <AnimatePresence>
            {pushResult && (
              <motion.div
                initial={{ opacity: 0, scale: 0.92, x: 8 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.92, x: 8 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  "hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono sm:flex",
                  pushResult.success
                    ? "border-matrix/25 bg-matrix/10 text-matrix"
                    : "border-crimson/25 bg-crimson/10 text-crimson"
                )}
              >
                {pushResult.success
                  ? <CheckCircle2 className="h-3.5 w-3.5" />
                  : <AlertCircle  className="h-3.5 w-3.5" />}
                {pushResult.success
                  ? `OK · ${pushResult.elapsed_ms.toFixed(0)} ms`
                  : "Push failed"}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            onClick={() => setShowHistory((v) => !v)}
            className={cn("btn-ghost gap-1.5 text-xs", showHistory && "border-edge-bright text-ink")}
          >
            {showHistory ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">History</span>
          </button>

          <button
            onClick={() => setShowSnapshots((v) => !v)}
            className={cn("btn-ghost gap-1.5 text-xs", showSnapshots && "border-edge-bright text-ink")}
          >
            <Camera className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Snapshots</span>
          </button>

          <button
            onClick={handlePush}
            disabled={commands.length === 0 || isPending}
            className="btn-primary"
            title="Push to device (Ctrl + Enter)"
          >
            <Send className="h-3.5 w-3.5" />
            {isPending ? "Pushing…" : "Push"}
          </button>
        </div>
      </header>

      {/* ── Device accent line under header ─────────────────────────────── */}
      <div
        className="h-[2px] flex-shrink-0"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${accent}99 25%, ${accent}cc 50%, ${accent}55 75%, transparent 100%)`,
          boxShadow: `0 0 12px 0 ${accent}55`,
        }}
      />

      {/* ── Workspace ───────────────────────────────────────────────────── */}
      <main className="relative z-10 flex min-h-0 flex-1 overflow-hidden">

        {/* LEFT — Configuration (GuiPane, no extra wrapper) */}
        <section
          className={cn(
            "overflow-y-auto border-r border-edge-dim transition-[width] duration-[320ms] ease-out",
            showHistory ? "w-[34%]" : "w-1/2"
          )}
        >
          <div className="h-full p-4">
            <GuiPane
              deviceType={pod.device_type}
              onCommandsChange={setCommands}
              onFeatureChange={setActiveFeature}
            />
          </div>
        </section>

        {/* CENTER — Terminal */}
        <section
          className={cn(
            "overflow-hidden transition-[width] duration-[320ms] ease-out",
            showHistory ? "w-[36%] border-r border-edge-dim" : "w-1/2"
          )}
        >
          <div className="flex h-full min-h-0 flex-col p-4">
            <div className="min-h-0 flex-1">
              <TerminalPane
                podId={pod.id}
                hostname={pod.pod_name}
                deviceType={pod.device_type}
                commands={commands}
                pushOutput={pushOutput}
                isPushing={isPending}
                elapsedMs={pushResult?.elapsed_ms}
                activeFeature={activeFeature}
              />
            </div>
          </div>
        </section>

        {/* RIGHT — History panel (slide-in) */}
        <AnimatePresence initial={false}>
          {showHistory && (
            <motion.section
              key="history-panel"
              initial={{ width: 0, opacity: 0, x: 14 }}
              animate={{ width: "30%", opacity: 1, x: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ width: 0, opacity: 0, x: 14, transition: { duration: 0.18, ease: "easeInOut" } }}
              className="overflow-hidden"
            >
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: 0.18, delay: 0.06 } }}
                exit={{ opacity: 0, y: 8, transition: { duration: 0.1 } }}
                className="flex h-full flex-col p-4"
              >
                <HistoryPanel deviceKey={pod.device_ip} />
              </motion.div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* ── Footer keyboard hint ─────────────────────────────────────────── */}
      <footer className="relative z-10 flex flex-shrink-0 items-center justify-between border-t border-edge-dim/60 px-6 py-2">
        <span className="text-2xs font-mono text-ink-muted">
          <kbd className="rounded border border-edge-subtle bg-depth px-1.5 py-0.5 text-ink-muted">Ctrl</kbd>
          {" + "}
          <kbd className="rounded border border-edge-subtle bg-depth px-1.5 py-0.5 text-ink-muted">↵</kbd>
          {" push to device"}
        </span>
        <span className="text-2xs font-mono text-ink-muted">
          Preview · Verify · Show Run
        </span>
      </footer>

      <SnapshotDrawer
        open={showSnapshots}
        onClose={() => setShowSnapshots(false)}
        podId={pod.id}
      />
    </div>
  );
}
