import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useRouteAnalytics } from "@/api/queries";
import { cn } from "@/components/ui/cn";

const PROTOCOL_STYLES: Record<string, string> = {
  OSPF:      "bg-amber-500/15 text-amber-300 border-amber-500/25",
  BGP:       "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
  STATIC:    "bg-violet-500/15 text-violet-300 border-violet-500/25",
  CONNECTED: "bg-matrix/15 text-matrix border-matrix/25",
  LOCAL:     "bg-ink-muted/15 text-ink-muted border-ink-muted/25",
};

function protocolStyle(proto: string) {
  return PROTOCOL_STYLES[proto.toUpperCase()] ?? "bg-depth text-ink-secondary border-edge-subtle";
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {[60, 110, 100, 80].map((w, i) => (
        <td key={i} className="px-3 py-2">
          <div className="h-2.5 rounded bg-depth" style={{ width: w }} />
        </td>
      ))}
    </tr>
  );
}

interface RouteAnalyticsPanelProps {
  podId: number;
}

export function RouteAnalyticsPanel({ podId }: RouteAnalyticsPanelProps) {
  const qc   = useQueryClient();
  const { data, isLoading, isError } = useRouteAnalytics(podId, true);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["route-analytics", podId] });
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden rounded-xl border border-edge-dim bg-abyss/90">
      <div className="px-4 py-3 border-b border-edge-dim flex items-center justify-between gap-3 flex-shrink-0">
        <div>
          <p className="text-xs font-semibold text-ink-bright">Routing Table</p>
          {data && (
            <p className="text-2xs font-mono text-ink-muted">
              {new Date(data.generated_at).toLocaleTimeString()} · {data.total_routes} routes
            </p>
          )}
        </div>
        <button
          onClick={refresh}
          className="btn-ghost text-2xs px-2 py-1 gap-1.5 micro-tap"
          title="Refresh routing table"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading && (
          <div className="p-4 space-y-2">
            <div className="flex gap-2 mb-3">
              {["w-16", "w-12", "w-14", "w-20", "w-10"].map((w, i) => (
                <div key={i} className={cn("h-5 rounded border animate-pulse bg-depth", w)} />
              ))}
            </div>
            <table className="w-full">
              <tbody>
                {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
              </tbody>
            </table>
          </div>
        )}

        {isError && (
          <div className="p-4 text-xs text-crimson font-mono">
            Failed to load routing table.
          </div>
        )}

        {data && (
          <div className="p-3 space-y-3">
            {/* Protocol summary */}
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(data.protocol_counts).map(([proto, count]) => (
                <span
                  key={proto}
                  className={cn("inline-flex items-center gap-1 rounded border px-2 py-0.5 text-2xs font-mono", protocolStyle(proto))}
                >
                  {proto} <span className="opacity-70">({count})</span>
                </span>
              ))}
            </div>

            {/* Default route + warnings */}
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn(
                "flex items-center gap-1 text-2xs font-mono",
                data.default_route_present ? "text-matrix" : "text-crimson"
              )}>
                {data.default_route_present
                  ? <><CheckCircle2 className="w-3 h-3" /> Default route present</>
                  : <><XCircle className="w-3 h-3" /> No default route</>}
              </span>
            </div>

            {data.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-400/25 bg-amber-400/8 px-3 py-2 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-300 flex-shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  {data.warnings.map((w, i) => (
                    <p key={i} className="text-2xs text-amber-200 font-mono">{w}</p>
                  ))}
                </div>
              </div>
            )}

            {/* Routes table */}
            <div className="rounded-lg border border-edge-dim overflow-hidden">
              <table className="w-full text-2xs font-mono">
                <thead>
                  <tr className="border-b border-edge-dim bg-depth/80">
                    <th className="text-left px-3 py-2 text-ink-muted uppercase tracking-wider text-[10px]">Proto</th>
                    <th className="text-left px-3 py-2 text-ink-muted uppercase tracking-wider text-[10px]">Prefix</th>
                    <th className="text-left px-3 py-2 text-ink-muted uppercase tracking-wider text-[10px]">Next Hop</th>
                    <th className="text-left px-3 py-2 text-ink-muted uppercase tracking-wider text-[10px]">Interface</th>
                  </tr>
                </thead>
                <tbody>
                  {data.routes.map((route, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-edge-dim/40 last:border-0",
                        route.protocol.toUpperCase() === "OSPF"      ? "bg-amber-500/5"   :
                        route.protocol.toUpperCase() === "BGP"       ? "bg-cyan-500/5"    :
                        route.protocol.toUpperCase() === "STATIC"    ? "bg-violet-500/5"  :
                        route.protocol.toUpperCase() === "CONNECTED" ? "bg-matrix/5"      :
                        ""
                      )}
                    >
                      <td className="px-3 py-1.5">
                        <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", protocolStyle(route.protocol))}>
                          {route.protocol}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-ink-bright">{route.prefix}</td>
                      <td className="px-3 py-1.5 text-ink-secondary">{route.next_hop ?? "—"}</td>
                      <td className="px-3 py-1.5 text-ink-muted">{route.interface ?? "—"}</td>
                    </tr>
                  ))}
                  {data.routes.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-3 py-4 text-center text-ink-muted">No routes found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
