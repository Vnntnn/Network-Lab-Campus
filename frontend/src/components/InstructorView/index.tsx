import { useMemo, useState } from "react";
import { ArrowLeft, Radio, ShieldCheck, Trash2, X } from "lucide-react";
import { motion } from "framer-motion";
import { useAppStore } from "@/stores/appStore";
import { useInstructorStore } from "@/stores/instructorStore";
import { useInstructorWS } from "@/hooks/useInstructorWS";
import { cn } from "@/components/ui/cn";

const FEED_VARIANTS = {
  hidden: { opacity: 0, y: 8 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.025, duration: 0.18 },
  }),
};

const STATUS_META = {
  disconnected: {
    dotClass: "status-dot status-dot-pending",
    textClass: "text-ink-muted",
    label: "disconnected",
  },
  connecting: {
    dotClass: "status-dot bg-amber-400 animate-pulse",
    textClass: "text-amber-300",
    label: "connecting",
  },
  authed: {
    dotClass: "status-dot status-dot-online animate-status-ring",
    textClass: "text-matrix",
    label: "live",
  },
  error: {
    dotClass: "status-dot status-dot-offline",
    textClass: "text-crimson",
    label: "auth failed",
  },
} as const;

function formatTime(ts: string) {
  const dt = new Date(ts);
  if (Number.isNaN(dt.getTime())) return ts;
  return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function InstructorView() {
  const setView = useAppStore((s) => s.setView);

  const pin       = useInstructorStore((s) => s.pin);
  const authed    = useInstructorStore((s) => s.authed);
  const events    = useInstructorStore((s) => s.events);
  const wsStatus  = useInstructorStore((s) => s.wsStatus);
  const setPin    = useInstructorStore((s) => s.setPin);
  const setAuthed = useInstructorStore((s) => s.setAuthed);
  const setStatus = useInstructorStore((s) => s.setStatus);
  const clearEvents = useInstructorStore((s) => s.clearEvents);

  useInstructorWS();

  const status = useMemo(() => STATUS_META[wsStatus], [wsStatus]);

  const [podFilter,  setPodFilter]  = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const connect = () => {
    if (pin.length !== 4) return;
    setStatus("connecting");
    setAuthed(true);
  };

  const disconnect = () => {
    setAuthed(false);
    setStatus("disconnected");
  };

  const uniquePods = useMemo(() => {
    const pods = new Set(events.map((e) => e.pod_name));
    return Array.from(pods).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      const podMatch  = podFilter === "all" || e.pod_name === podFilter;
      const typeMatch =
        typeFilter === "all"    ? true :
        typeFilter === "push"   ? e.type === "push" :
        false;
      return podMatch && typeMatch;
    });
  }, [events, podFilter, typeFilter]);

  const activeFilters: { label: string; clear: () => void }[] = [];
  if (podFilter  !== "all") activeFilters.push({ label: `Pod: ${podFilter}`,   clear: () => setPodFilter("all") });
  if (typeFilter !== "all") activeFilters.push({ label: `Type: ${typeFilter}`, clear: () => setTypeFilter("all") });

  return (
    <div className="w-screen h-screen bg-abyss relative overflow-hidden flex flex-col">
      <div className="absolute inset-0 bg-circuit opacity-25 pointer-events-none" />
      <div className="absolute inset-0 bg-grid-cyan opacity-15 pointer-events-none" />

      <header className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-edge-dim bg-void/75 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView("selector")}
            className="btn-ghost text-xs px-3 py-1.5 gap-1.5 micro-tap"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> back
          </button>

          <div className="w-px h-4 bg-edge-subtle" />
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-300" />
            <h1 className="text-sm font-semibold text-ink-bright">Instructor Dashboard</h1>
            <span className={cn("text-2xs font-mono uppercase tracking-wide", status.textClass)}>
              <span className={status.dotClass} /> {status.label}
            </span>
          </div>
        </div>

        {authed && (
          <button onClick={disconnect} className="btn-ghost text-xs px-3 py-1.5 micro-tap">
            Disconnect
          </button>
        )}
      </header>

      {!authed ? (
        <div className="relative z-10 flex-1 grid place-items-center px-4">
          <div className="glass w-full max-w-md p-6 space-y-4">
            <p className="text-sm font-semibold text-ink-bright">PIN-gated instructor access</p>
            <p className="text-xs text-ink-muted">
              Enter your 4-digit session PIN to start monitoring student push activity live.
            </p>

            <label className="space-y-1 block">
              <span className="text-2xs font-mono uppercase tracking-wider text-ink-muted">PIN</span>
              <input
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                className="input-field text-center text-lg tracking-[0.35em] font-mono"
                inputMode="numeric"
                maxLength={4}
                placeholder="0000"
              />
            </label>

            <button
              onClick={connect}
              disabled={pin.length !== 4 || wsStatus === "connecting"}
              className="btn-primary w-full justify-center"
            >
              <Radio className="w-4 h-4" /> Connect
            </button>

            {wsStatus === "error" && (
              <p className="text-2xs text-crimson font-mono">Authentication failed. Check PIN and retry.</p>
            )}
          </div>
        </div>
      ) : (
        <main className="relative z-10 flex-1 p-5 md:p-7 overflow-hidden flex flex-col gap-3">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={podFilter}
              onChange={(e) => setPodFilter(e.target.value)}
              className="input-field h-7 text-xs py-0 px-2 w-auto font-mono"
            >
              <option value="all">All Pods</option>
              {uniquePods.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="input-field h-7 text-xs py-0 px-2 w-auto font-mono"
            >
              <option value="all">All Types</option>
              <option value="push">Push</option>
            </select>

            {activeFilters.map((f) => (
              <span
                key={f.label}
                className="flex items-center gap-1 rounded-full border border-edge-glow bg-cyan-300/8 px-2.5 py-0.5 text-2xs font-mono text-cyan-300"
              >
                {f.label}
                <button type="button" onClick={f.clear} className="hover:text-ink transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}

            {activeFilters.length > 0 && (
              <button
                type="button"
                onClick={() => { setPodFilter("all"); setTypeFilter("all"); }}
                className="text-2xs font-mono text-ink-muted hover:text-ink-secondary transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <section className="glass flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-edge-dim flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-ink-bright">Live Push Feed</p>
                <p className="text-2xs text-ink-muted font-mono">
                  {filteredEvents.length} of {events.length} events
                </p>
              </div>
              <button
                onClick={clearEvents}
                className="btn-ghost text-xs px-2.5 py-1.5 gap-1.5 micro-tap"
              >
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredEvents.length === 0 ? (
                <div className="h-full grid place-items-center text-center px-4">
                  <div>
                    <p className="text-sm text-ink-secondary">
                      {events.length === 0 ? "No live events yet." : "No events match filters."}
                    </p>
                    <p className="text-2xs text-ink-muted mt-1">
                      {events.length === 0
                        ? "Student push attempts will stream here in real time."
                        : "Adjust filters to see events."}
                    </p>
                  </div>
                </div>
              ) : (
                filteredEvents.map((event, index) => (
                  <motion.div
                    key={`${event.pod_id}-${event.ts}-${index}`}
                    custom={index}
                    variants={FEED_VARIANTS}
                    initial="hidden"
                    animate="show"
                    className="terminal-block p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-ink-bright font-medium">{event.pod_name}</p>
                        <p className="text-2xs text-ink-muted font-mono">{event.device_ip}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={event.success ? "tag tag-matrix" : "tag tag-crimson"}>
                          {event.success ? "success" : "failed"}
                        </span>
                        <span className="tag">{Math.round(event.elapsed_ms)}ms</span>
                      </div>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-2xs font-mono text-ink-muted">
                      <span>{event.command_count} commands</span>
                      <span>{formatTime(event.ts)}</span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}
