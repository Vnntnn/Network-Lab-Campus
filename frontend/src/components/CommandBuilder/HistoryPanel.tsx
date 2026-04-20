import { useState } from "react";
import { ChevronDown, ChevronRight, Clock, Trash2, CheckCircle2, XCircle, Loader2, RotateCcw } from "lucide-react";
import { useHistoryStore, type HistoryEntry } from "@/stores/historyStore";
import { useRollbackSnapshot } from "@/api/queries";
import { cn } from "@/components/ui/cn";

function HistoryItem({ entry }: { entry: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [rollbackNotice, setRollbackNotice] = useState<string | null>(null);
  const rollback = useRollbackSnapshot();

  const canRollback = typeof entry.preSnapshotId === "number";

  const onRollback = async () => {
    if (!canRollback || rollback.isPending || !entry.preSnapshotId) return;

    setRollbackNotice(null);
    try {
      const result = await rollback.mutateAsync(entry.preSnapshotId);
      setRollbackNotice(result.success ? "Rollback applied from pre-push snapshot." : "Rollback request did not complete successfully.");
    } catch (error) {
      setRollbackNotice((error as Error).message);
    }
  };

  const time = entry.timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors duration-150",
        entry.success
          ? "border-matrix/20 bg-matrix/5 hover:border-matrix/35"
          : "border-crimson/20 bg-crimson/5 hover:border-crimson/35"
      )}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left micro-tap"
      >
        {entry.success
          ? <CheckCircle2 className="w-3.5 h-3.5 text-matrix flex-shrink-0" />
          : <XCircle className="w-3.5 h-3.5 text-crimson flex-shrink-0" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink truncate">{entry.podName}</span>
            <span className="text-2xs font-mono text-ink-muted flex-shrink-0">
              {entry.elapsed_ms.toFixed(0)}ms
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <Clock className="w-2.5 h-2.5 text-ink-muted" />
            <span className="text-2xs font-mono text-ink-muted">{time}</span>
            <span className="text-2xs text-ink-muted">·</span>
            <span className="text-2xs font-mono text-ink-muted">
              {entry.commands.filter((l) => l !== "!").length} lines
            </span>
          </div>
        </div>

        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-ink-muted flex-shrink-0" />
          : <ChevronRight className="w-3.5 h-3.5 text-ink-muted flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="border-t border-edge-dim px-3 py-2.5 space-y-2 animate-fade-up">
          <div className="flex items-center justify-between rounded border border-edge-dim bg-depth/70 px-2.5 py-2">
            <div>
              <p className="text-2xs font-mono uppercase tracking-widest text-ink-muted">Undo</p>
              <p className="text-2xs text-ink-muted mt-0.5">
                {canRollback ? "Rollback this push using captured pre-push snapshot." : "No rollback snapshot attached to this entry."}
              </p>
            </div>
            <button
              type="button"
              onClick={onRollback}
              disabled={!canRollback || rollback.isPending}
              className={cn(
                "btn-ghost text-2xs px-2 py-1 micro-tap",
                !canRollback && "opacity-45 cursor-not-allowed"
              )}
              title={canRollback ? "Rollback to this pre-push snapshot" : "Rollback unavailable for this history entry"}
            >
              {rollback.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Undo
            </button>
          </div>

          {rollbackNotice && (
            <p className="text-2xs font-mono text-ink-muted">{rollbackNotice}</p>
          )}

          <p className="text-2xs font-mono text-ink-muted uppercase tracking-widest">Commands sent</p>
          <pre className="text-xs font-mono text-ink-secondary whitespace-pre-wrap leading-5 bg-depth rounded p-2">
            {entry.commands.join("\n")}
          </pre>
          {entry.output && (
            <>
              <p className="text-2xs font-mono text-ink-muted uppercase tracking-widest mt-2">Device output</p>
              <pre className="text-xs font-mono text-ink-secondary whitespace-pre-wrap leading-5 bg-depth rounded p-2">
                {entry.output || "(no output)"}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function HistoryPanel() {
  const { entries, clear } = useHistoryStore();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-ink-muted" />
          <span className="text-xs font-medium text-ink-secondary">Push History</span>
          {entries.length > 0 && (
            <span className="tag">{entries.length}</span>
          )}
        </div>
        {entries.length > 0 && (
          <button
            onClick={clear}
            className="flex items-center gap-1 text-2xs font-mono text-ink-muted hover:text-crimson transition-colors micro-tap"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-ink-muted">
            <Clock className="w-5 h-5 opacity-30" />
            <span className="text-xs font-mono">No pushes yet this session</span>
          </div>
        ) : (
          entries.map((e) => <HistoryItem key={e.id} entry={e} />)
        )}
      </div>
    </div>
  );
}
