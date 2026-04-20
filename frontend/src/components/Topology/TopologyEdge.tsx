import { memo, type MouseEvent } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { TopologyEdgeData } from "@/types/topology";
import { normalizeInterfaces, formatInterfaceSummary } from "./portUtils";

const EDGE_EDIT_EVENT = "topology-edge-edit";

// ── Port label chip rendered in SVG space ─────────────────────────────────────

function PortTag({
  x,
  y,
  label,
  accent,
}: {
  x: number;
  y: number;
  label: string;
  accent: string;
}) {
  const W = Math.max(label.length * 5.8 + 14, 38);
  const H = 14;
  return (
    <g>
      <rect
        x={x - W / 2} y={y - H / 2}
        width={W} height={H} rx={3}
        fill="rgba(3,6,14,0.90)"
        stroke={accent} strokeWidth={0.75}
        opacity={0.95}
      />
      <text
        x={x} y={y + 4.6}
        textAnchor="middle"
        fontFamily="'Cascadia Code','Fira Mono','Consolas',monospace"
        fontSize={8.5} letterSpacing={0.3}
        fill={accent}
      >
        {label}
      </text>
    </g>
  );
}

// ── TopologyEdge ──────────────────────────────────────────────────────────────

export const TopologyEdge = memo(function TopologyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    curvature: 0.05,
  });

  const edgeData   = (data ?? {}) as TopologyEdgeData;
  const sourceLabel = edgeData.sourceLabel ?? "Eth0";
  const targetLabel = edgeData.targetLabel ?? "Eth0";
  const srcIfaces   = normalizeInterfaces(edgeData.sourceInterfaces);
  const tgtIfaces   = normalizeInterfaces(edgeData.targetInterfaces);
  const srcPort     = formatInterfaceSummary(srcIfaces, sourceLabel);
  const tgtPort     = formatInterfaceSummary(tgtIfaces, targetLabel);
  const adminState  = edgeData.adminState ?? "up";
  const emphasized  = selected || Boolean(edgeData.recent);

  // State-based color
  const stateColor =
    adminState === "down"        ? "#f7556c"
    : adminState === "maintenance" ? "#ffb857"
    : "#31c4ff";

  const stroke      = emphasized ? `${stateColor}ee` : `${stateColor}70`;
  const strokeWidth = emphasized ? 2.2 : 1.5;
  const strokeDash  = adminState === "down" ? "6 4" : undefined;

  // ── Port tag anchor positions ────────────────────────────────────────────────
  // Place labels 32px from each endpoint along the cable direction,
  // with a small perpendicular offset (10px) so they don't sit on the line.
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const perp = 10; // perpendicular offset away from cable
  const px = -uy * perp;
  const py =  ux * perp;
  const DIST = 32;

  const srcTagX = sourceX + ux * DIST + px;
  const srcTagY = sourceY + uy * DIST + py;
  const tgtTagX = targetX - ux * DIST + px;
  const tgtTagY = targetY - uy * DIST + py;

  const triggerEdit = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (edgeData.isDiscovery) return;
    window.dispatchEvent(new CustomEvent(EDGE_EDIT_EVENT, { detail: { id } }));
  };

  return (
    <>
      {/* Glow halo when selected */}
      {emphasized && (
        <path
          d={edgePath}
          stroke={stateColor}
          strokeWidth={strokeWidth + 7}
          strokeOpacity={0.10}
          fill="none"
          strokeLinecap="round"
          pointerEvents="none"
        />
      )}

      <BaseEdge
        id={id}
        path={edgePath}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDash}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={
          !emphasized && adminState !== "down"
            ? "topology-edge-path topology-edge-path--up topology-edge-path--animated"
            : "topology-edge-path"
        }
        style={{ cursor: edgeData.isDiscovery ? "default" : "pointer" }}
      />

      {/* Data-flow particles */}
      <circle r={3.2} fill={stateColor} opacity={emphasized ? 0.95 : 0.65} stroke="none">
        <animateMotion dur="1.6s" repeatCount="indefinite" path={edgePath} />
      </circle>
      <circle r={2} fill="rgba(133,148,255,0.90)" opacity={emphasized ? 0.90 : 0.55} stroke="none">
        <animateMotion dur="2.4s" begin="0.45s" repeatCount="indefinite" path={edgePath} />
      </circle>

      {/* Port labels near endpoints */}
      <PortTag x={srcTagX} y={srcTagY} label={srcPort} accent={stateColor} />
      <PortTag x={tgtTagX} y={tgtTagY} label={tgtPort} accent={stateColor} />

      {/* Discovery protocol indicator */}
      {edgeData.isDiscovery && (
        <g pointerEvents="none">
          <rect
            x={labelX - 28} y={labelY - 8}
            width={56} height={14} rx={3}
            fill="rgba(3,6,14,0.86)"
            stroke="rgba(255,184,87,0.38)" strokeWidth={0.7}
          />
          <text
            x={labelX} y={labelY + 4.5}
            textAnchor="middle"
            fontFamily="monospace" fontSize={8} letterSpacing={0.5}
            fill="rgba(255,184,87,0.85)"
          >
            {(edgeData.discoveryProtocols?.length ?? 0) > 0
              ? edgeData.discoveryProtocols!.map((p) => p.toUpperCase()).join("·")
              : "DISC"}
          </text>
        </g>
      )}

      {/* "edit link" action when selected and not discovery */}
      {selected && !edgeData.isDiscovery && (
        <foreignObject
          x={labelX - 34} y={labelY - 10}
          width={68} height={20}
          style={{ pointerEvents: "all" }}
        >
          <button
            type="button"
            onClick={triggerEdit}
            className="edge-label edge-label--interactive edge-label--selected w-full h-full micro-tap"
            title="Edit link details"
          >
            edit link
          </button>
        </foreignObject>
      )}
    </>
  );
});
