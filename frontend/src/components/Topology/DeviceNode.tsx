import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Loader2, Wifi } from "lucide-react";
import { usePingPod, type LabPod } from "@/api/queries";
import { useAppStore } from "@/stores/appStore";
import { usePodStore } from "@/stores/podStore";
import type { DeviceFlowNode } from "@/stores/topologyStore";
import { cn } from "@/components/ui/cn";
import { summarizeInterfaces } from "./portUtils";

// ── Packet Tracer-style SVG device icons ──────────────────────────────────────

/** Cisco-style router chassis icon */
function RouterIcon({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 48 32" width={48} height={32} aria-hidden="true">
      {/* Chassis body */}
      <rect x={2} y={8} width={44} height={18} rx={3}
        fill="rgba(255,255,255,0.06)" stroke={accent} strokeWidth={1.2} />
      {/* Front panel bar */}
      <rect x={5} y={11} width={38} height={12} rx={2}
        fill="rgba(255,255,255,0.04)" />
      {/* Port group — left */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={7 + i * 7} y={14} width={5} height={6} rx={1}
          fill={i < 2 ? accent : "rgba(255,255,255,0.12)"}
          opacity={i < 2 ? 0.8 : 0.45} />
      ))}
      {/* LED row right */}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={38 + i * 4} cy={17} r={1.8}
          fill={i === 0 ? accent : "rgba(255,255,255,0.18)"} opacity={0.85} />
      ))}
      {/* Vent slits on top */}
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={10 + i * 6} y1={8} x2={10 + i * 6} y2={4}
          stroke="rgba(255,255,255,0.12)" strokeWidth={1} strokeLinecap="round" />
      ))}
    </svg>
  );
}

/** Cisco-style multilayer switch icon */
function SwitchIcon({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 48 28" width={48} height={28} aria-hidden="true">
      {/* Chassis */}
      <rect x={2} y={6} width={44} height={16} rx={2.5}
        fill="rgba(255,255,255,0.06)" stroke={accent} strokeWidth={1.2} />
      {/* Port grid — 8 ports */}
      {Array.from({ length: 8 }).map((_, i) => (
        <rect key={i} x={5 + i * 5} y={10} width={3.5} height={8} rx={0.8}
          fill={i < 5 ? accent : "rgba(255,255,255,0.12)"}
          opacity={i < 5 ? 0.75 : 0.35} />
      ))}
      {/* SFP cage */}
      <rect x={46 - 8} y={10} width={7} height={8} rx={1}
        fill="rgba(255,255,255,0.06)" stroke={accent} strokeWidth={0.8} opacity={0.6} />
      {/* Power LED */}
      <circle cx={44} cy={8} r={2}
        fill={accent} opacity={0.9} />
    </svg>
  );
}

/** Edge router (IOS-XR) — taller modular chassis */
function EdgeRouterIcon({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 48 36" width={48} height={36} aria-hidden="true">
      {/* Main chassis */}
      <rect x={2} y={2} width={44} height={32} rx={3}
        fill="rgba(255,255,255,0.06)" stroke={accent} strokeWidth={1.2} />
      {/* Slot 1 */}
      <rect x={5} y={6} width={18} height={10} rx={2}
        fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth={0.7} />
      {/* Slot 2 */}
      <rect x={25} y={6} width={18} height={10} rx={2}
        fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.1)" strokeWidth={0.7} />
      {/* Port row on slot 1 */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={7 + i * 5} y={9} width={3.5} height={4} rx={0.7}
          fill={accent} opacity={0.7} />
      ))}
      {/* Port row on slot 2 */}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={27 + i * 5} y={9} width={3.5} height={4} rx={0.7}
          fill={accent} opacity={0.55} />
      ))}
      {/* Mid bar / fabric indicator */}
      <rect x={5} y={20} width={38} height={5} rx={1.5}
        fill="rgba(255,255,255,0.04)" stroke={accent} strokeWidth={0.7} opacity={0.6} />
      {/* LEDs */}
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={8 + i * 5} cy={22.5} r={1.5}
          fill={i < 2 ? accent : "rgba(255,255,255,0.15)"} opacity={0.85} />
      ))}
      {/* Bottom panel */}
      <rect x={5} y={28} width={38} height={4} rx={1}
        fill="rgba(255,255,255,0.03)" />
    </svg>
  );
}

// ── Theme helpers ─────────────────────────────────────────────────────────────
const DEVICE_CONFIG: Record<string, {
  label: string;
  accent: string;
  borderActive: string;
  Icon: React.ComponentType<{ accent: string }>;
}> = {
  arista_eos: {
    label: "Arista EOS",
    accent: "#2de6aa",
    borderActive: "border-[#2de6aa]/60",
    Icon: SwitchIcon,
  },
  cisco_iosxe: {
    label: "Cisco IOS-XE",
    accent: "#31c4ff",
    borderActive: "border-[#31c4ff]/60",
    Icon: RouterIcon,
  },
  cisco_iosxr: {
    label: "Cisco IOS-XR",
    accent: "#8594ff",
    borderActive: "border-[#8594ff]/60",
    Icon: EdgeRouterIcon,
  },
};

const FALLBACK_CONFIG = DEVICE_CONFIG.cisco_iosxe;

const HANDLE_STYLE: React.CSSProperties = {
  width: 10,
  height: 10,
  background: "rgba(49,196,255,0.30)",
  border: "1.5px solid rgba(49,196,255,0.65)",
  borderRadius: "50%",
};

export const TOPOLOGY_QUICK_CONFIG_EVENT = "topology-open-quick-config";

export const DeviceNode = memo(function DeviceNode({
  data,
  selected,
}: NodeProps<DeviceFlowNode>) {
  const { pod } = data;
  const [pinged, setPinged] = useState(false);

  const { mutate: ping, isPending: pinging, data: pingResult } = usePingPod();
  const selectPod  = usePodStore((s) => s.selectPod);
  const setView    = useAppStore((s) => s.setView);

  const cfg          = DEVICE_CONFIG[pod.device_type] ?? FALLBACK_CONFIG;
  const Icon         = cfg.Icon;
  const connections  = typeof data.connectionCount === "number" ? data.connectionCount : 0;
  const inlineConfig = Boolean(data.inlineConfig);
  const isExternal   = Boolean(data.discovery?.is_external || pod.is_external);
  const canPing      = !isExternal && pod.id > 0;
  const canConfig    = !isExternal && pod.id > 0;
  const badgeLabel   = data.badgeLabel ?? pod.badge_label
    ?? (pod.pod_number != null ? `pod ${pod.pod_number}` : "discovered");

  const portSummary  = summarizeInterfaces(data.discovery?.local_interfaces, 3);

  const handlePing = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canPing) return;
    setPinged(true);
    ping(pod.id);
  };

  const handleConfig = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!canConfig) return;
    if (inlineConfig) {
      window.dispatchEvent(
        new CustomEvent(TOPOLOGY_QUICK_CONFIG_EVENT, { detail: { pod: pod as LabPod } })
      );
      return;
    }
    selectPod(pod as LabPod);
    setView("builder");
  };

  const pingLabel = !pinged   ? "—"
    : pinging                 ? "…"
    : pingResult?.reachable   ? `${pingResult.elapsed_ms.toFixed(0)} ms`
    : "offline";

  const isReachable = pinged && !pinging && pingResult?.reachable;
  const isOffline   = pinged && !pinging && !pingResult?.reachable;

  return (
    <>
      <Handle type="target"  position={Position.Top}    style={HANDLE_STYLE} />
      <Handle type="source"  position={Position.Bottom} style={HANDLE_STYLE} />
      <Handle type="target"  position={Position.Left}   style={HANDLE_STYLE} />
      <Handle type="source"  position={Position.Right}  style={HANDLE_STYLE} />

      <div
        className={cn(
          "relative w-60 rounded-xl border bg-[#08101e] transition-all duration-150",
          "shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
          selected
            ? cn("shadow-node-selected", cfg.borderActive)
            : "border-edge-subtle hover:border-edge-bright"
        )}
      >
        {/* Top accent bar with port dots */}
        <div
          className="h-1.5 rounded-t-xl"
          style={{ background: `linear-gradient(90deg, ${cfg.accent}55, ${cfg.accent}22 70%, transparent)` }}
        />

        {/* ── Header: icon + name ─────────────────────────────────────────── */}
        <div className="flex items-start gap-2.5 p-3 pb-2">
          {/* Equipment icon */}
          <div
            className="flex-shrink-0 rounded-lg border p-1.5"
            style={{
              borderColor: selected ? cfg.accent + "80" : "rgba(162,177,211,0.12)",
              background: selected ? cfg.accent + "14" : "rgba(0,0,0,0.35)",
            }}
          >
            <Icon accent={cfg.accent} />
          </div>

          <div className="min-w-0 flex-1">
            {/* Device label (type) */}
            <p className="text-2xs font-mono" style={{ color: cfg.accent + "cc" }}>
              {cfg.label}
            </p>
            {/* Pod name */}
            <p className="mt-0.5 text-sm font-semibold leading-tight text-ink-bright truncate">
              {pod.pod_name}
            </p>
            {/* IP */}
            <p className="text-2xs font-mono text-ink-muted mt-0.5">{pod.device_ip}</p>
          </div>

          {/* Badge */}
          <span className="telemetry-chip px-2 py-0.5 flex-shrink-0 text-2xs">{badgeLabel}</span>
        </div>

        {/* ── Stats row ───────────────────────────────────────────────────── */}
        <div className="mx-3 mb-2.5 grid grid-cols-3 gap-1.5">
          <StatChip label="links" value={String(connections)} accent={cfg.accent} />
          <StatChip label="ports" value={String(portSummary.total)} accent={cfg.accent} />
          <StatChip
            label="ping"
            value={pingLabel}
            accent={isReachable ? "#2de6aa" : isOffline ? "#ff6f85" : cfg.accent}
          />
        </div>

        {/* ── Footer: ping + configure ─────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-2 border-t border-edge-dim px-3 py-2">
          {/* Status dot */}
          <span className="flex items-center gap-1.5 text-2xs font-mono text-ink-muted">
            <span
              className={cn(
                "h-2 w-2 rounded-full flex-shrink-0",
                isReachable ? "bg-matrix shadow-glow-matrix animate-pulse"
                : isOffline  ? "bg-crimson"
                :              "bg-ink-muted"
              )}
            />
            {isExternal ? "discovered" : pingLabel === "—" ? "unknown" : pingLabel}
          </span>

          <div className="flex items-center gap-1.5">
            {/* Ping button */}
            <button
              onClick={handlePing}
              disabled={pinging || !canPing}
              title={canPing ? "Test reachability" : "Cannot ping discovery node"}
              className={cn(
                "rounded-md border border-transparent p-1.5 text-ink-muted transition-all",
                canPing && "hover:border-edge-glow hover:text-cyan-300 hover:bg-cyan-glow"
              )}
            >
              {pinging
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Wifi className="h-3.5 w-3.5" />}
            </button>

            {/* Configure button */}
            <button
              onClick={handleConfig}
              className="rounded-md px-3 py-1.5 text-2xs font-mono font-semibold transition-colors"
              style={{
                background: canConfig ? cfg.accent : "rgba(255,255,255,0.08)",
                color: canConfig ? "#03060e" : "rgba(255,255,255,0.35)",
              }}
            >
              {canConfig ? (inlineConfig ? "configure" : "enter") : "inspect"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
});

// ── Tiny helper ───────────────────────────────────────────────────────────────
function StatChip({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-lg border border-edge-subtle bg-depth/80 py-1.5 px-1">
      <span className="text-2xs font-mono font-semibold" style={{ color: accent + "cc" }}>
        {value}
      </span>
      <span className="text-[9px] font-mono uppercase tracking-widest text-ink-muted">{label}</span>
    </div>
  );
}
