import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Loader2, Wifi } from "lucide-react";
import { usePingPod, type LabPod } from "@/api/queries";
import { useAppStore } from "@/stores/appStore";
import { usePodStore } from "@/stores/podStore";
import type { DeviceFlowNode } from "@/stores/topologyStore";
import { cn } from "@/components/ui/cn";

// ── SVG device icons (Packet Tracer-inspired, FUI-flavored) ──────────────────

function RouterIcon({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 56 38" width={56} height={38} aria-hidden="true">
      <rect x={2} y={8} width={52} height={22} rx={4}
        fill="rgba(255,255,255,0.04)" stroke={accent} strokeWidth={1.5} />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={7 + i * 9} y={15} width={5.5} height={8} rx={1.2}
          fill={i < 2 ? accent : "rgba(255,255,255,0.10)"}
          opacity={i < 2 ? 0.85 : 0.4} />
      ))}
      {[0, 1, 2].map((i) => (
        <circle key={i} cx={44 + i * 5} cy={19} r={2.2}
          fill={i === 0 ? accent : "rgba(255,255,255,0.15)"} opacity={0.9} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={12 + i * 7} y1={8} x2={12 + i * 7} y2={4}
          stroke="rgba(255,255,255,0.09)" strokeWidth={1.2} strokeLinecap="round" />
      ))}
      <rect x={2} y={33} width={52} height={3} rx={1} fill="rgba(255,255,255,0.03)" />
    </svg>
  );
}

function SwitchIcon({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 56 30" width={56} height={30} aria-hidden="true">
      <rect x={2} y={6} width={52} height={18} rx={3}
        fill="rgba(255,255,255,0.04)" stroke={accent} strokeWidth={1.5} />
      {Array.from({ length: 10 }).map((_, i) => (
        <rect key={i} x={4 + i * 5} y={11} width={3.5} height={8} rx={0.8}
          fill={i < 7 ? accent : "rgba(255,255,255,0.10)"}
          opacity={i < 7 ? 0.75 : 0.3} />
      ))}
      <rect x={50} y={11} width={4} height={8} rx={1}
        fill="rgba(255,255,255,0.04)" stroke={accent} strokeWidth={0.9} opacity={0.7} />
      <circle cx={52} cy={8} r={2.5} fill={accent} opacity={0.95} />
    </svg>
  );
}

function EdgeRouterIcon({ accent }: { accent: string }) {
  return (
    <svg viewBox="0 0 56 44" width={56} height={44} aria-hidden="true">
      <rect x={2} y={2} width={52} height={40} rx={4}
        fill="rgba(255,255,255,0.04)" stroke={accent} strokeWidth={1.5} />
      <rect x={5} y={7} width={20} height={12} rx={2}
        fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth={0.8} />
      <rect x={28} y={7} width={20} height={12} rx={2}
        fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.08)" strokeWidth={0.8} />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={8 + i * 6} y={11} width={4} height={4} rx={0.8}
          fill={accent} opacity={0.7} />
      ))}
      {[0, 1, 2].map((i) => (
        <rect key={i} x={31 + i * 6} y={11} width={4} height={4} rx={0.8}
          fill={accent} opacity={0.55} />
      ))}
      <rect x={5} y={23} width={46} height={7} rx={2}
        fill="rgba(255,255,255,0.03)" stroke={accent} strokeWidth={0.8} opacity={0.65} />
      {[0, 1, 2, 3, 4].map((i) => (
        <circle key={i} cx={10 + i * 8} cy={26.5} r={1.8}
          fill={i < 3 ? accent : "rgba(255,255,255,0.12)"} opacity={0.85} />
      ))}
      <rect x={5} y={34} width={46} height={5} rx={1} fill="rgba(255,255,255,0.02)" />
    </svg>
  );
}

// ── Theme config ──────────────────────────────────────────────────────────────

const DEVICE_CONFIG: Record<string, {
  label: string;
  accent: string;
  Icon: React.ComponentType<{ accent: string }>;
}> = {
  arista_eos:  { label: "Arista EOS",   accent: "#2de6aa", Icon: SwitchIcon      },
  cisco_iosxe: { label: "Cisco IOS-XE", accent: "#31c4ff", Icon: RouterIcon      },
  cisco_iosxr: { label: "Cisco IOS-XR", accent: "#8594ff", Icon: EdgeRouterIcon  },
};

const FALLBACK = DEVICE_CONFIG.cisco_iosxe;

// ── Port handle style (rectangular, PT-style) ─────────────────────────────────

const H_HORIZ: React.CSSProperties = {
  width: 14, height: 6, borderRadius: 2,
  background: "rgba(49,196,255,0.18)",
  border: "1px solid rgba(49,196,255,0.48)",
};
const H_VERT: React.CSSProperties = {
  width: 6, height: 14, borderRadius: 2,
  background: "rgba(49,196,255,0.18)",
  border: "1px solid rgba(49,196,255,0.48)",
};

export const TOPOLOGY_QUICK_CONFIG_EVENT = "topology-open-quick-config";

// ── DeviceNode ────────────────────────────────────────────────────────────────

export const DeviceNode = memo(function DeviceNode({
  data,
  selected,
}: NodeProps<DeviceFlowNode>) {
  const { pod } = data;
  const [pinged, setPinged] = useState(false);

  const { mutate: ping, isPending: pinging, data: pingResult } = usePingPod();
  const selectPod = usePodStore((s) => s.selectPod);
  const setView   = useAppStore((s) => s.setView);

  const cfg  = DEVICE_CONFIG[pod.device_type] ?? FALLBACK;
  const Icon = cfg.Icon;

  const connections  = typeof data.connectionCount === "number" ? data.connectionCount : 0;
  const inlineConfig = Boolean(data.inlineConfig);
  const isExternal   = Boolean(data.discovery?.is_external || pod.is_external);
  const canPing      = !isExternal && pod.id > 0;
  const canConfig    = !isExternal && pod.id > 0;

  const isReachable = pinged && !pinging && Boolean(pingResult?.reachable);
  const isOffline   = pinged && !pinging && !pingResult?.reachable;

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

  return (
    <>
      {/* Port handles — rectangular slots */}
      <Handle type="target"  position={Position.Top}    style={H_HORIZ} />
      <Handle type="source"  position={Position.Bottom} style={H_HORIZ} />
      <Handle type="target"  position={Position.Left}   style={H_VERT}  />
      <Handle type="source"  position={Position.Right}  style={H_VERT}  />

      <div
        className={cn(
          "relative w-44 rounded-xl border bg-[#060e1c] transition-all duration-150 select-none",
          "shadow-[0_6px_22px_rgba(0,0,0,0.55)]",
        )}
        style={{
          borderColor: selected ? `${cfg.accent}55` : "rgba(162,177,211,0.10)",
          boxShadow: selected
            ? `0 0 0 1px ${cfg.accent}22, 0 8px 30px rgba(0,0,0,0.6), 0 0 18px ${cfg.accent}18`
            : undefined,
        }}
      >
        {/* Top accent strip */}
        <div
          className="h-[2px] rounded-t-xl"
          style={{ background: `linear-gradient(90deg,${cfg.accent},${cfg.accent}44 55%,transparent)` }}
        />

        {/* Device icon zone */}
        <div className="flex flex-col items-center pt-3 pb-2 px-2">
          <div
            className="relative rounded-xl p-2"
            style={{
              background: selected ? `${cfg.accent}0f` : "rgba(0,0,0,0.32)",
              border: `1px solid ${selected ? `${cfg.accent}44` : "rgba(255,255,255,0.05)"}`,
            }}
          >
            <Icon accent={cfg.accent} />
            {/* Status LED */}
            <span
              className={cn(
                "absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full border-2 border-[#060e1c]",
                isReachable
                  ? "bg-[#2de6aa] shadow-[0_0_6px_rgba(45,230,170,0.7)] animate-pulse"
                  : isOffline
                    ? "bg-[#f7556c]"
                    : "bg-[rgba(162,177,211,0.25)]"
              )}
            />
          </div>

          {/* Device type badge */}
          <span
            className="mt-1.5 text-[9px] font-mono uppercase tracking-widest rounded px-1.5 py-0.5"
            style={{
              color: `${cfg.accent}bb`,
              background: `${cfg.accent}0d`,
              border: `1px solid ${cfg.accent}25`,
            }}
          >
            {cfg.label}
          </span>
        </div>

        {/* Hostname + IP */}
        <div className="px-3 pb-2 text-center">
          <p className="text-sm font-bold leading-tight text-[rgba(236,241,255,0.95)] truncate">
            {pod.pod_name}
          </p>
          <p className="text-[10px] font-mono text-[rgba(162,177,211,0.48)] mt-0.5 tabular-nums">
            {pod.device_ip}
          </p>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-2.5 py-2 rounded-b-xl"
          style={{ borderTop: `1px solid ${cfg.accent}18` }}
        >
          <span
            className="text-[9px] font-mono tabular-nums"
            style={{ color: `${cfg.accent}88` }}
          >
            {connections} link{connections !== 1 ? "s" : ""}
          </span>

          <div className="flex items-center gap-1">
            {canPing && (
              <button
                onClick={handlePing}
                disabled={pinging}
                title="Ping device"
                className="rounded p-1 transition-colors"
                style={{
                  color: isReachable
                    ? "#2de6aa"
                    : isOffline
                      ? "#f7556c"
                      : "rgba(162,177,211,0.38)",
                }}
              >
                {pinging
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : <Wifi className="h-3 w-3" />}
              </button>
            )}

            <button
              onClick={handleConfig}
              title={canConfig ? "Configure" : "Inspect"}
              className="rounded px-2 py-0.5 text-[9px] font-mono font-semibold transition-all"
              style={{
                background: canConfig ? cfg.accent : "rgba(255,255,255,0.05)",
                color: canConfig ? "#040810" : "rgba(255,255,255,0.28)",
              }}
            >
              {canConfig ? (inlineConfig ? "cfg" : "enter") : "view"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
});
