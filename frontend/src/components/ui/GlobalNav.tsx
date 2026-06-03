import { Waypoints, Terminal, Database, Layers, ShieldCheck, LayoutGrid } from "lucide-react";
import { useAppStore } from "@/stores/appStore";
import { usePodStore } from "@/stores/podStore";
import { cn } from "@/components/ui/cn";

const NAV_ITEMS = [
  { view: "topology"     as const, icon: Waypoints,    label: "Topology",    alwaysEnabled: true },
  { view: "builder"      as const, icon: Terminal,      label: "Command Builder", alwaysEnabled: false },
  { view: "admin"        as const, icon: Database,      label: "Node Management", alwaysEnabled: true },
  { view: "orchestrator" as const, icon: Layers,        label: "Orchestrator",    alwaysEnabled: true },
  { view: "instructor"   as const, icon: ShieldCheck,   label: "Instructor",      alwaysEnabled: true },
  { view: "selector"     as const, icon: LayoutGrid,    label: "3D Campus",        alwaysEnabled: true },
] as const;

export function GlobalNav() {
  const view    = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const pod     = usePodStore((s) => s.selectedPod);

  const VIEW_LABELS: Record<string, string> = {
    selector:     "3D Campus",
    builder:      "Command Matrix",
    admin:        "Node Management",
    topology:     "Topology Intelligence",
    instructor:   "Instructor Dashboard",
    orchestrator: "Multi-Node Orchestrator",
  };

  const breadcrumb = VIEW_LABELS[view] ?? view;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 h-9 flex items-center justify-between px-4 glass-nav border-b border-edge-dim">
      <span className="text-2xs font-mono text-ink-muted truncate max-w-[40%]">
        <span className="text-cyan-300/60 mr-1.5">nexus /</span>
        <span className="text-ink-secondary">{breadcrumb}</span>
      </span>

      <div className="flex items-center gap-0.5">
        {NAV_ITEMS.map(({ view: v, icon: Icon, label, alwaysEnabled }) => {
          const enabled = alwaysEnabled || (v === "builder" && !!pod);
          const isActive = view === v;
          return (
            <div key={v} className="relative group">
              <button
                onClick={() => enabled && setView(v)}
                disabled={!enabled}
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 micro-tap",
                  isActive
                    ? "border border-cyan-300/50 bg-cyan-300/10 text-cyan-300 shadow-[0_0_8px_rgba(49,196,255,0.25)]"
                    : enabled
                      ? "text-ink-muted hover:text-ink-secondary hover:bg-depth/70"
                      : "text-ink-muted/30 cursor-not-allowed"
                )}
                aria-label={label}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 px-2 py-1 rounded bg-void border border-edge-subtle text-2xs font-mono text-ink-secondary whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-100 z-50">
                {label}
              </div>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
