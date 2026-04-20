import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers,
  Loader2,
  Play,
  XCircle,
} from "lucide-react";
import { useMultiPush, usePods } from "@/api/queries";
import { useAppStore } from "@/stores/appStore";
import { useOrchStore } from "@/stores/orchestrationStore";
import { cn } from "@/components/ui/cn";
import { ViewLoading } from "@/components/ui/ViewLoading";

const DEVICE_LABELS: Record<string, string> = {
  arista_eos: "Arista EOS",
  cisco_iosxe: "Cisco IOS-XE",
  cisco_iosxr: "Cisco IOS-XR",
};

export function OrchestratorPanel() {
  const setView = useAppStore((s) => s.setView);

  const selectedPodIds = useOrchStore((s) => s.selectedPodIds);
  const results = useOrchStore((s) => s.results);
  const togglePod = useOrchStore((s) => s.togglePod);
  const selectAll = useOrchStore((s) => s.selectAll);
  const clearSelection = useOrchStore((s) => s.clearSelection);
  const setResults = useOrchStore((s) => s.setResults);

  const { data: pods, isLoading, isError, error } = usePods();
  const multiPush = useMultiPush();

  const [rawCommands, setRawCommands] = useState("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const selectedCount = selectedPodIds.size;
  const commands = useMemo(
    () =>
      rawCommands
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0),
    [rawCommands]
  );

  const canPush = selectedCount > 0 && commands.length > 0 && !multiPush.isPending;

  const runOrchestration = () => {
    if (!canPush) return;
    const podIds = Array.from(selectedPodIds);
    multiPush.mutate(
      { pod_ids: podIds, commands },
      {
        onSuccess: (data) => {
          setResults(data);
        },
      }
    );
  };

  return (
    <div className="w-screen h-screen bg-abyss flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 bg-circuit opacity-25 pointer-events-none" />
      <div className="absolute inset-0 bg-grid-cyan opacity-15 pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-edge-dim bg-void/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView("selector")}
            className="btn-ghost text-xs px-3 py-1.5 gap-1.5 micro-tap"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> 3D Campus
          </button>
          <div className="w-px h-4 bg-edge-subtle" />
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-300" />
            <h1 className="text-sm font-semibold text-ink-bright">Multi-Node Orchestrator</h1>
            <span className="tag tag-cyan">{selectedCount} selected nodes</span>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[40%_60%]">
        <section className="border-r border-edge-dim min-h-0 flex flex-col">
          <div className="px-4 py-3 border-b border-edge-dim flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-ink-bright">Node Selection</p>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => selectAll((pods ?? []).map((pod) => pod.id))}
                className="btn-ghost text-2xs px-2.5 py-1 micro-tap"
                disabled={!pods || pods.length === 0}
              >
                Select All Nodes
              </button>
              <button
                onClick={clearSelection}
                className="btn-ghost text-2xs px-2.5 py-1 micro-tap"
                disabled={selectedCount === 0}
              >
                Clear
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {isLoading && <ViewLoading compact title="Loading Nodes" subtitle="Syncing orchestration targets..." />}

            {isError && (
              <div className="glass p-3 text-xs text-crimson">
                Failed to load nodes: {(error as Error)?.message}
              </div>
            )}

            {!isLoading && !isError && (pods?.length ?? 0) === 0 && (
              <div className="h-full grid place-items-center text-center px-4">
                <p className="text-sm text-ink-secondary">No nodes available.</p>
              </div>
            )}

            {!isLoading && !isError && (pods?.length ?? 0) > 0 && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2.5">
                {pods?.map((pod) => {
                  const checked = selectedPodIds.has(pod.id);
                  return (
                    <div
                      key={pod.id}
                      onClick={() => togglePod(pod.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          togglePod(pod.id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "relative text-left rounded-lg border p-3 transition-all",
                        checked
                          ? "border-edge-glow bg-cyan-glow"
                          : "border-edge-dim bg-depth/80 hover:border-edge-subtle"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs text-ink-bright font-medium">{pod.pod_name}</p>
                          <p className="text-2xs text-ink-muted font-mono mt-0.5">{pod.device_ip}</p>
                        </div>
                        <span
                          aria-hidden="true"
                          className={cn(
                            "mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded border text-2xs font-bold",
                            checked
                              ? "border-cyan-300 bg-cyan-300/15 text-cyan-200"
                              : "border-edge-subtle bg-depth/80 text-transparent"
                          )}
                        >
                          ✓
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="tag">node {pod.pod_number}</span>
                        <span className="tag">{DEVICE_LABELS[pod.device_type] ?? pod.device_type}</span>
                      </div>

                      {multiPush.isPending && checked && (
                        <div className="absolute inset-0 rounded-lg bg-void/35 backdrop-blur-[1px] grid place-items-center">
                          <Loader2 className="w-4 h-4 text-cyan-300 animate-spin" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="min-h-0 flex flex-col">
          <div className="px-4 py-3 border-b border-edge-dim">
            <p className="text-xs font-semibold text-ink-bright">Command Payload</p>
            <p className="text-2xs text-ink-muted mt-0.5">One command per line. Executed concurrently on selected nodes.</p>
          </div>

          <div className="p-4 space-y-3 border-b border-edge-dim">
            <textarea
              className="input-field font-mono resize-none h-36"
              value={rawCommands}
              onChange={(event) => setRawCommands(event.target.value)}
              placeholder={"conf t\nhostname CLASSROOM\nend\nwrite memory"}
            />
            <button
              onClick={runOrchestration}
              disabled={!canPush}
              className="btn-primary w-full justify-center"
            >
              {multiPush.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" /> Push to {selectedCount} Nodes
                </>
              )}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {results.length === 0 ? (
              <div className="h-full grid place-items-center text-center px-4">
                <div>
                  <p className="text-sm text-ink-secondary">No orchestration results yet.</p>
                  <p className="text-2xs text-ink-muted mt-1">Run a multi-node push to populate results.</p>
                </div>
              </div>
            ) : (
              results.map((row) => {
                const rowOpen = !!expanded[row.pod_id];
                return (
                  <div
                    key={row.pod_id}
                    className={cn(
                      "rounded-lg border",
                      row.success
                        ? "border-matrix/35 bg-matrix/7"
                        : "border-crimson/35 bg-crimson/7"
                    )}
                  >
                    <div className="px-3 py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {row.success ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-matrix" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-crimson" />
                        )}
                        <div>
                          <p className="text-xs text-ink-bright">{row.pod_name}</p>
                          <p className="text-2xs text-ink-muted font-mono">{Math.round(row.elapsed_ms)}ms</p>
                        </div>
                      </div>

                      <button
                        onClick={() => setExpanded((state) => ({ ...state, [row.pod_id]: !rowOpen }))}
                        className="btn-ghost text-2xs px-2 py-1 gap-1.5 micro-tap"
                      >
                        {rowOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />} Output
                      </button>
                    </div>

                    {row.error && (
                      <div className="px-3 pb-2 text-2xs text-crimson font-mono">{row.error}</div>
                    )}

                    {rowOpen && (
                      <div className="px-3 pb-3 animate-fade-up">
                        <pre className="terminal-block max-h-56 overflow-auto p-2.5 text-2xs whitespace-pre-wrap break-words">
                          {row.output || "(no output)"}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
