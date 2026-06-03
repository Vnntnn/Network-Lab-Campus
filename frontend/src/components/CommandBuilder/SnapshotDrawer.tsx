import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ChevronDown, ChevronRight, Download, GitCompare, Loader2, Trash2, X } from "lucide-react";
import {
  useCaptureSnapshot,
  useDeleteSnapshot,
  useRollbackSnapshot,
  useSnapshots,
  type Snapshot,
} from "@/api/queries";
import { cn } from "@/components/ui/cn";
import { SnapshotDiff } from "./SnapshotDiff";

interface SnapshotDrawerProps {
  open: boolean;
  onClose: () => void;
  podId: number;
}

function relativeTime(ts: string) {
  const value = new Date(ts).getTime();
  if (!Number.isFinite(value)) return "unknown";
  const diffMs = Date.now() - value;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function downloadSnapshot(snap: Snapshot) {
  const blob = new Blob([snap.content], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `config_${snap.label}_${new Date(snap.created_at).toISOString().slice(0, 19)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

function SnapshotRow({
  snapshot,
  podId,
  compareMode,
  isBaseline,
  onCompareClick,
}: {
  snapshot: Snapshot;
  podId: number;
  compareMode: boolean;
  isBaseline: boolean;
  onCompareClick: (snap: Snapshot) => void;
}) {
  const [expanded,       setExpanded]       = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);

  const rollback = useRollbackSnapshot();
  const remove   = useDeleteSnapshot();

  const running = rollback.isPending || remove.isPending;

  const onRollback = async () => {
    if (!confirmRollback) { setConfirmRollback(true); return; }
    await rollback.mutateAsync(snapshot.id);
    setConfirmRollback(false);
  };

  const onDelete = async () => {
    await remove.mutateAsync({ snapId: snapshot.id, podId });
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-depth/75 transition-all duration-150",
        compareMode && isBaseline
          ? "border-cyan-300/50 ring-1 ring-cyan-300/25"
          : "border-edge-dim"
      )}
    >
      <div className="px-3 py-2.5 flex items-start gap-2">
        {!compareMode && (
          <button
            onClick={() => setExpanded((v) => !v)}
            className="btn-ghost text-2xs px-2 py-1 gap-1.5 micro-tap"
            title="Toggle snapshot content"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} View
          </button>
        )}

        {compareMode && (
          <button
            onClick={() => onCompareClick(snapshot)}
            className={cn(
              "btn-ghost text-2xs px-2 py-1 gap-1.5 micro-tap",
              isBaseline && "text-cyan-300 border-cyan-300/40"
            )}
            title={isBaseline ? "Baseline selected — click another to diff" : "Select for compare"}
          >
            {isBaseline ? "Baseline" : "Select"}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={snapshot.label === "pre-push" ? "tag tag-cyan" : "tag"}>{snapshot.label}</span>
            <span className="text-2xs font-mono text-ink-muted">{relativeTime(snapshot.created_at)}</span>
          </div>
          <p className="text-2xs font-mono text-ink-muted mt-1 truncate">snapshot #{snapshot.id}</p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => downloadSnapshot(snapshot)}
            className="btn-ghost text-2xs px-2 py-1 micro-tap"
            title="Download snapshot as text file"
          >
            <Download className="w-3 h-3" />
          </button>

          <button
            onClick={onRollback}
            disabled={running}
            className={cn(
              "btn-ghost text-2xs px-2 py-1 micro-tap",
              confirmRollback && "text-crimson border-crimson/30 hover:border-crimson/45 hover:text-crimson"
            )}
            title="Rollback this snapshot"
          >
            {rollback.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : confirmRollback ? "Confirm" : "Rollback"}
          </button>

          <button
            onClick={onDelete}
            disabled={running}
            className="btn-ghost text-2xs px-2 py-1 text-crimson border-crimson/25 hover:border-crimson/40 hover:text-crimson micro-tap"
            title="Delete snapshot"
          >
            {remove.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {!compareMode && expanded && (
        <div className="px-3 pb-3 animate-fade-up">
          <pre className="terminal-block max-h-56 overflow-auto p-2.5 text-2xs whitespace-pre-wrap break-words">
            {snapshot.content || "(snapshot content is empty)"}
          </pre>
        </div>
      )}
    </div>
  );
}

export function SnapshotDrawer({ open, onClose, podId }: SnapshotDrawerProps) {
  const list    = useSnapshots(podId);
  const capture = useCaptureSnapshot();

  const snapshots = useMemo(() => list.data ?? [], [list.data]);

  const [compareMode, setCompareMode] = useState(false);
  const [baseline,    setBaseline]    = useState<Snapshot | null>(null);
  const [diffPair,    setDiffPair]    = useState<{ before: Snapshot; after: Snapshot } | null>(null);

  const captureNow = async () => {
    await capture.mutateAsync({ podId, label: "manual" });
  };

  const handleCompareToggle = () => {
    setCompareMode((v) => {
      if (v) { setBaseline(null); setDiffPair(null); }
      return !v;
    });
  };

  const handleCompareClick = (snap: Snapshot) => {
    if (!baseline) {
      setBaseline(snap);
      setDiffPair(null);
    } else if (baseline.id === snap.id) {
      setBaseline(null);
      setDiffPair(null);
    } else {
      setDiffPair({ before: baseline, after: snap });
      setBaseline(null);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="absolute top-0 right-0 h-full w-[360px] z-30 border-l border-edge-dim bg-abyss/95 backdrop-blur-lg flex flex-col"
        >
          <div className="px-4 py-3 border-b border-edge-dim flex items-center gap-2">
            <div className="w-7 h-7 rounded-md border border-edge-glow bg-cyan-glow flex items-center justify-center">
              <Camera className="w-3.5 h-3.5 text-cyan-300" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-ink-bright">Snapshots</p>
              <p className="text-2xs text-ink-muted font-mono">pod {podId}</p>
            </div>

            <button
              onClick={handleCompareToggle}
              className={cn("btn-ghost text-2xs px-2 py-1 gap-1 micro-tap", compareMode && "border-edge-bright text-cyan-300")}
              title="Toggle compare mode"
            >
              <GitCompare className="w-3 h-3" /> Compare
            </button>

            <button
              onClick={captureNow}
              disabled={capture.isPending}
              className="btn-hud text-2xs px-2.5 py-1.5 micro-tap"
            >
              {capture.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Capture"}
            </button>

            <button
              onClick={onClose}
              className="btn-ghost text-2xs px-2 py-1 micro-tap"
              title="Close snapshots"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {compareMode && (
            <div className="px-4 py-2 border-b border-edge-dim bg-cyan-300/5 text-2xs font-mono text-cyan-300/80">
              {!baseline && !diffPair && "Click a snapshot to set baseline…"}
              {baseline && !diffPair && `Baseline: ${baseline.label} #${baseline.id} — click another to diff`}
              {diffPair && (
                <button
                  onClick={() => { setDiffPair(null); setBaseline(null); }}
                  className="text-ink-muted hover:text-ink-secondary transition-colors"
                >
                  Clear diff ×
                </button>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {list.isLoading && (
              <div className="h-full grid place-items-center">
                <div className="flex items-center gap-2 text-xs font-mono text-ink-muted">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading snapshots...
                </div>
              </div>
            )}

            {list.isError && (
              <div className="glass p-3 text-xs text-crimson">
                Failed to load snapshots.
              </div>
            )}

            {!list.isLoading && !list.isError && snapshots.length === 0 && (
              <div className="h-full grid place-items-center text-center px-4">
                <div>
                  <p className="text-sm text-ink-secondary">No snapshots yet.</p>
                  <p className="text-2xs text-ink-muted mt-1">Push to device to auto-capture.</p>
                </div>
              </div>
            )}

            {diffPair && (
              <div className="mb-2 animate-fade-up">
                <SnapshotDiff before={diffPair.before} after={diffPair.after} />
              </div>
            )}

            {snapshots.map((snapshot) => (
              <SnapshotRow
                key={snapshot.id}
                snapshot={snapshot}
                podId={podId}
                compareMode={compareMode}
                isBaseline={baseline?.id === snapshot.id}
                onCompareClick={handleCompareClick}
              />
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
