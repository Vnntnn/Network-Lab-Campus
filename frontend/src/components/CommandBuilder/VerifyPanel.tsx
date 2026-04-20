import { useState } from "react";
import { Play, Loader2, ChevronDown, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import { useRunShow, type ShowResult } from "@/api/queries";
import { SHOW_COMMANDS, type Feature } from "./verifyCommands";
import { cn } from "@/components/ui/cn";

interface VerifyPanelProps {
  podId: number;
  activeFeature: Feature;
}

function ResultBlock({ result }: { result: ShowResult }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-lg border border-edge-subtle bg-depth overflow-hidden animate-fade-up">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-raised transition-colors"
      >
        {open
          ? <ChevronDown  className="w-3 h-3 text-ink-muted flex-shrink-0" />
          : <ChevronRight className="w-3 h-3 text-ink-muted flex-shrink-0" />}
        <span className="font-mono text-xs text-cyan-400 flex-1 truncate">{result.command}</span>
      </button>
      {open && (
        <div className="border-t border-edge-dim px-3 py-2.5">
          <pre className="font-mono text-xs text-ink-secondary whitespace-pre-wrap leading-5 max-h-48 overflow-y-auto">
            {result.output || "(no output)"}
          </pre>
        </div>
      )}
    </div>
  );
}

export function VerifyPanel({ podId, activeFeature }: VerifyPanelProps) {
  const commands = SHOW_COMMANDS[activeFeature] ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { mutate: runShow, isPending, data, error } = useRunShow();

  const toggle = (cmd: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(cmd) ? next.delete(cmd) : next.add(cmd);
      return next;
    });

  const runSelected = () => {
    const toRun = [...selected];
    if (toRun.length === 0) return;
    runShow({ pod_id: podId, commands: toRun });
  };

  const runAll = () => {
    runShow({ pod_id: podId, commands: commands.map((c) => c.cmd) });
    setSelected(new Set(commands.map((c) => c.cmd)));
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Command chips */}
      <div className="flex-shrink-0">
        <div className="section-label mb-3">
          Verification Commands — {activeFeature}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {commands.map(({ label, cmd }) => (
            <button
              key={cmd}
              onClick={() => toggle(cmd)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-mono border transition-all duration-150",
                selected.has(cmd)
                  ? "bg-cyan-glow border-edge-glow text-cyan-400 shadow-glow-cyan-sm"
                  : "bg-depth border-edge-subtle text-ink-muted hover:text-ink-secondary hover:border-edge-bright"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={runSelected}
            disabled={selected.size === 0 || isPending}
            className="btn-primary text-xs py-2 px-4"
          >
            {isPending
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running…</>
              : <><Play className="w-3.5 h-3.5" /> Run Selected ({selected.size})</>}
          </button>
          <button
            onClick={runAll}
            disabled={isPending}
            className="btn-ghost text-xs"
          >
            Run All
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg border border-crimson/25 bg-crimson/5 text-xs text-crimson font-mono">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            {error.message}
          </div>
        )}

        {data && (
          <>
            <div className="flex items-center gap-2 text-2xs font-mono text-ink-muted">
              {data.success
                ? <CheckCircle2 className="w-3 h-3 text-matrix" />
                : <XCircle className="w-3 h-3 text-crimson" />}
              {data.results.length} command{data.results.length !== 1 ? "s" : ""} ·{" "}
              {data.elapsed_ms.toFixed(0)}ms
            </div>
            {data.results.map((r, i) => (
              <ResultBlock key={i} result={r} />
            ))}
          </>
        )}

        {!data && !error && !isPending && (
          <div className="flex flex-col items-center justify-center h-32 gap-2 text-ink-muted">
            <Play className="w-5 h-5 opacity-30" />
            <span className="text-xs font-mono">Select commands and run to verify</span>
          </div>
        )}
      </div>
    </div>
  );
}
