import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, ChevronDown, ChevronRight, Loader2, Trash2, X } from "lucide-react";
import {
  useCaptureSnapshot,
  useDeleteSnapshot,
  useRollbackSnapshot,
  useSnapshots,
  type Snapshot,
} from "@/api/queries";
import { cn } from "@/components/ui/cn";

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

function SnapshotRow({
  snapshot,
  podId,
}: {
  snapshot: Snapshot;
  podId: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmRollback, setConfirmRollback] = useState(false);

  const rollback = useRollbackSnapshot();
  const remove = useDeleteSnapshot();

  const running = rollback.isPending || remove.isPending;

  const onRollback = async () => {
    if (!confirmRollback) {
      setConfirmRollback(true);
      return;
    }
    await rollback.mutateAsync(snapshot.id);
    setConfirmRollback(false);
  };

  const onDelete = async () => {
    await remove.mutateAsync({ snapId: snapshot.id, podId });
  };

  return (
    <div className="rounded-lg border border-edge-dim bg-depth/75">
      <div className="px-3 py-2.5 flex items-start gap-2">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="btn-ghost text-2xs px-2 py-1 gap-1.5 micro-tap"
          title="Toggle snapshot content"
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Diff
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={snapshot.label === "pre-push" ? "tag tag-cyan" : "tag"}>{snapshot.label}</span>
            <span className="text-2xs font-mono text-ink-muted">{relativeTime(snapshot.created_at)}</span>
          </div>
          <p className="text-2xs font-mono text-ink-muted mt-1 truncate">snapshot #{snapshot.id}</p>
        </div>

        <div className="flex items-center gap-1.5">
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

      {expanded && (
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
  const list = useSnapshots(podId);
  const capture = useCaptureSnapshot();

  const snapshots = useMemo(() => list.data ?? [], [list.data]);

  const captureNow = async () => {
    await capture.mutateAsync({ podId, label: "manual" });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="absolute top-0 right-0 h-full w-[340px] z-30 border-l border-edge-dim bg-abyss/95 backdrop-blur-lg flex flex-col"
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
              onClick={captureNow}
              disabled={capture.isPending}
              className="btn-hud text-2xs px-2.5 py-1.5 micro-tap"
            >
              {capture.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Capture Now"}
            </button>
            <button
              onClick={onClose}
              className="btn-ghost text-2xs px-2 py-1 micro-tap"
              title="Close snapshots"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

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

            {snapshots.map((snapshot) => (
              <SnapshotRow key={snapshot.id} snapshot={snapshot} podId={podId} />
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
