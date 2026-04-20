import { Suspense, lazy, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { usePodStore } from "@/stores/podStore";
import { useAppStore } from "@/stores/appStore";
import { ViewLoading } from "@/components/ui/ViewLoading";

const PodSelector = lazy(() =>
  import("@/components/PodSelector").then((m) => ({ default: m.PodSelector }))
);
const CommandBuilder = lazy(() =>
  import("@/components/CommandBuilder").then((m) => ({ default: m.CommandBuilder }))
);
const AdminPanel = lazy(() =>
  import("@/components/AdminPanel").then((m) => ({ default: m.AdminPanel }))
);
const TopologyView = lazy(() =>
  import("@/components/Topology").then((m) => ({ default: m.TopologyView }))
);
const InstructorView = lazy(() =>
  import("@/components/InstructorView").then((m) => ({ default: m.InstructorView }))
);
const OrchestratorPanel = lazy(() =>
  import("@/components/OrchestratorPanel").then((m) => ({ default: m.OrchestratorPanel }))
);
const NetworkBackground = lazy(() =>
  import("@/components/Scene/NetworkBackground").then((m) => ({ default: m.NetworkBackground }))
);

const PAGE_VARIANTS = {
  initial: (dir: number) => ({
    opacity: 0, x: dir * 28, y: 8, scale: 0.992, filter: "blur(5px)",
  }),
  animate: {
    opacity: 1, x: 0, y: 0, scale: 1, filter: "blur(0px)",
    transition: { duration: 0.30, ease: [0.22, 1, 0.36, 1] as const },
  },
  exit: (dir: number) => ({
    opacity: 0, x: dir * -22, y: -6, scale: 0.992, filter: "blur(4px)",
    transition: { duration: 0.18, ease: "easeIn" as const },
  }),
};

const VIEW_META = {
  selector:     { label: "3D Campus"              },
  builder:      { label: "Command Matrix"         },
  admin:        { label: "Node Management"        },
  topology:     { label: "Topology Intelligence"  },
  instructor:   { label: "Instructor Dashboard"   },
  orchestrator: { label: "Multi-Node Orchestrator"},
} as const;

const VIEW_ORDER = {
  selector: 0, builder: 1, topology: 2,
  admin: 3, instructor: 4, orchestrator: 5,
} as const;

function ViewFallback({ label }: { label: string }) {
  return (
    <div className="h-full w-full">
      <ViewLoading title={`Loading ${label}`} subtitle="Hydrating modules and restoring panel state…" />
    </div>
  );
}

export default function App() {
  const pod     = usePodStore((s) => s.selectedPod);
  const view    = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const prevViewRef = useRef(view);

  useEffect(() => {
    if (!pod && view === "builder") setView("selector");
  }, [pod, view, setView]);

  // Warm deferred modules after first paint
  useEffect(() => {
    const id = window.setTimeout(() => {
      void import("@/components/CommandBuilder");
      void import("@/components/AdminPanel");
      void import("@/components/Topology");
      void import("@/components/InstructorView");
      void import("@/components/OrchestratorPanel");
    }, 900);
    return () => window.clearTimeout(id);
  }, []);

  const key  = view === "builder" && pod ? `builder-${pod.id}` : view;
  const meta = VIEW_META[view];

  const direction = useMemo(() => {
    const prev = prevViewRef.current;
    return VIEW_ORDER[view] >= VIEW_ORDER[prev] ? 1 : -1;
  }, [view]);

  useEffect(() => { prevViewRef.current = view; }, [view]);

  const showBg = view !== "selector";

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-void text-ink">

      {/* ── Ambient WebGL network background (non-selector views only) ── */}
      {showBg && (
        <Suspense fallback={null}>
          <NetworkBackground />
        </Suspense>
      )}

      {/* ── Layered background overlays ─────────────────────────────────
           Order matters for depth:
           1. aurora-shell — large radial colour pools (lowest)
           2. bg-grid      — dot grid perfectly centred on viewport
           3. bg-circuit   — thin cross-hatch for circuit-board feel
      ── */}
      {showBg && (
        <>
          {/* Aurora colour pools */}
          <div className="pointer-events-none absolute inset-0 bg-aurora-shell" />

          {/* Animated line grid — scrolls diagonally, very subtle */}
          <div
            className="pointer-events-none absolute inset-0 bg-grid-animated"
            style={{ opacity: 0.55 }}
          />

          {/* Dot grid — anchored to the viewport centre */}
          <div
            className="pointer-events-none absolute inset-0 bg-grid-dim bg-grid-md"
            style={{ opacity: 0.12, backgroundPosition: "center center" }}
          />

          {/* Animated circuit cross-hatch */}
          <div
            className="pointer-events-none absolute inset-0 bg-circuit-animated"
            style={{ opacity: 0.14, backgroundPosition: "center center" }}
          />
        </>
      )}

      {/* ── Animated page transitions ─────────────────────────────────── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={key}
          variants={PAGE_VARIANTS}
          custom={direction}
          initial="initial"
          animate="animate"
          exit="exit"
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          <Suspense fallback={<ViewFallback label={meta.label} />}>
            {view === "admin"        && <AdminPanel />}
            {view === "topology"     && <TopologyView />}
            {view === "instructor"   && <InstructorView />}
            {view === "orchestrator" && <OrchestratorPanel />}
            {view === "builder" && pod && <CommandBuilder />}
            {(view === "selector" || (view === "builder" && !pod)) && <PodSelector />}
          </Suspense>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
