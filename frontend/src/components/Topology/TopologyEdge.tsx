import { memo, type MouseEvent } from "react";
import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";
import type { TopologyEdgeData } from "@/types/topology";
import { formatInterfaceSummary, normalizeInterfaces } from "./portUtils";

const EDGE_EDIT_EVENT = "topology-edge-edit";

const DISCOVERY_LABEL_WIDTH = 180;
const DISCOVERY_LABEL_HEIGHT = 24;
const SELECTED_LABEL_WIDTH = 96;
const SELECTED_LABEL_HEIGHT = 24;
const RECENT_LABEL_WIDTH = 68;
const RECENT_LABEL_HEIGHT = 22;
const PORT_LABEL_WIDTH = 128;
const PORT_LABEL_HEIGHT = 24;

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
    curvature: 0.18,
  });

  const edgeData = (data ?? {}) as TopologyEdgeData;
  const sourceLabel = edgeData.sourceLabel ?? "Eth0";
  const targetLabel = edgeData.targetLabel ?? "Eth0";
  const sourceInterfaces = normalizeInterfaces(edgeData.sourceInterfaces);
  const targetInterfaces = normalizeInterfaces(edgeData.targetInterfaces);
  const sourcePortLabel = formatInterfaceSummary(sourceInterfaces, sourceLabel);
  const targetPortLabel = formatInterfaceSummary(targetInterfaces, targetLabel);
  const sourcePortTitle = sourceInterfaces.length > 0 ? `${sourceLabel}: ${sourceInterfaces.join(", ")}` : sourceLabel;
  const targetPortTitle = targetInterfaces.length > 0 ? `${targetLabel}: ${targetInterfaces.join(", ")}` : targetLabel;
  const bandwidthMbps = edgeData.bandwidthMbps ?? (edgeData.isDiscovery ? null : 1000);
  const latencyMs = edgeData.latencyMs ?? (edgeData.isDiscovery ? null : 5);
  const adminState = edgeData.adminState ?? "up";
  const emphasized = selected || edgeData.recent;
  const discoveryLabel = (edgeData.discoveryProtocols?.length ?? 0) > 0
    ? edgeData.discoveryProtocols!.map((protocol) => protocol.toUpperCase()).join(" · ")
    : "DISCOVERY";

  const stateStroke =
    adminState === "down"
      ? "rgba(247,85,108,0.9)"
      : adminState === "maintenance"
        ? "rgba(255,184,87,0.92)"
        : "rgba(49,196,255,0.92)";
  const idleStroke =
    adminState === "down"
      ? "rgba(247,85,108,0.56)"
      : adminState === "maintenance"
        ? "rgba(255,184,87,0.56)"
        : "rgba(49,196,255,0.54)";

  const stroke = emphasized ? stateStroke : idleStroke;
  const strokeWidth = emphasized ? 2.6 : 1.9;
  const strokeDasharray = adminState === "down" ? "5 5" : emphasized ? "0" : "7 3";
  const pathClassName =
    adminState === "down"
      ? emphasized
        ? "topology-edge-path topology-edge-path--down-active"
        : "topology-edge-path topology-edge-path--down topology-edge-path--animated"
      : adminState === "maintenance"
        ? emphasized
          ? "topology-edge-path topology-edge-path--maintenance-active"
          : "topology-edge-path topology-edge-path--maintenance topology-edge-path--animated"
        : emphasized
          ? "topology-edge-path topology-edge-path--up-active"
          : "topology-edge-path topology-edge-path--up topology-edge-path--animated";

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = (-dy / len) * 14;
  const py = (dx / len) * 14;

  const slx = sourceX + dx * 0.22;
  const sly = sourceY + dy * 0.22;
  const tlx = sourceX + dx * 0.78;
  const tly = sourceY + dy * 0.78;

  const frame = (centerX: number, centerY: number, width: number, height: number) => ({
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  });

  const discoveryFrame = frame(labelX, labelY + 16, DISCOVERY_LABEL_WIDTH, DISCOVERY_LABEL_HEIGHT);
  const selectedFrame = frame(labelX, labelY, SELECTED_LABEL_WIDTH, SELECTED_LABEL_HEIGHT);
  const recentFrame = frame(labelX, labelY, RECENT_LABEL_WIDTH, RECENT_LABEL_HEIGHT);
  const sourceFrame = frame(slx + px, sly + py, PORT_LABEL_WIDTH, PORT_LABEL_HEIGHT);
  const targetFrame = frame(tlx + px, tly + py, PORT_LABEL_WIDTH, PORT_LABEL_HEIGHT);

  const triggerEdit = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (edgeData.isDiscovery) return;
    window.dispatchEvent(new CustomEvent(EDGE_EDIT_EVENT, { detail: { id } }));
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        className={pathClassName}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle r={3.7} fill="rgba(49,196,255,0.95)" stroke="none">
        <animateMotion dur="1.55s" repeatCount="indefinite" path={edgePath} />
      </circle>

      <circle r={2.4} fill="rgba(133,148,255,0.95)" stroke="none">
        <animateMotion dur="2.1s" begin="0.3s" repeatCount="indefinite" path={edgePath} />
      </circle>

      <foreignObject {...discoveryFrame} pointerEvents={edgeData.isDiscovery ? "none" : "all"}>
        {edgeData.isDiscovery ? (
          <div
            className="edge-label edge-label--discovery w-full h-full"
            title="Discovered neighbor link"
          >
            {discoveryLabel}
            {edgeData.discoveryNote && <span className="ml-1 text-ink-muted">· {edgeData.discoveryNote}</span>}
          </div>
        ) : (
          <button
            type="button"
            onClick={triggerEdit}
            className="edge-label edge-label--interactive edge-label--state w-full h-full micro-tap"
            title="Edit this link"
          >
            {Math.round(bandwidthMbps ?? 1000)}M · {Math.round(latencyMs ?? 5)}ms · {adminState}
          </button>
        )}
      </foreignObject>

      {selected && !edgeData.isDiscovery && (
        <foreignObject {...selectedFrame} pointerEvents="all">
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

      {edgeData.recent && !selected && !edgeData.isDiscovery && (
        <foreignObject {...recentFrame} pointerEvents="none">
          <div className="edge-label edge-label--recent w-full h-full">
            linked
          </div>
        </foreignObject>
      )}

      <foreignObject {...sourceFrame} pointerEvents="all">
        <button
          type="button"
          onClick={triggerEdit}
          className="edge-label edge-label--interactive edge-label--port w-full h-full micro-tap"
          title={sourcePortTitle}
        >
          {sourcePortLabel} -&gt;
        </button>
      </foreignObject>

      <foreignObject {...targetFrame} pointerEvents="all">
        <button
          type="button"
          onClick={triggerEdit}
          className="edge-label edge-label--interactive edge-label--port w-full h-full micro-tap"
          title={targetPortTitle}
        >
          &lt;- {targetPortLabel}
        </button>
      </foreignObject>

    </>
  );
});
