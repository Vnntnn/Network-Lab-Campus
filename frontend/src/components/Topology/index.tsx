import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, Network, Settings, AlertCircle, RefreshCw, Check, Link2, PencilLine, RotateCcw, Unplug,
} from "lucide-react";
import { usePods, useTopologyDiscovery, type LabPod } from "@/api/queries";
import { buildWsUrl } from "@/api/ws";
import { useAppStore } from "@/stores/appStore";
import { usePodStore } from "@/stores/podStore";
import { useTopologyStore, type DeviceNodeData, type DeviceFlowNode } from "@/stores/topologyStore";
import { ViewLoading } from "@/components/ui/ViewLoading";
import { cn } from "@/components/ui/cn";
import { GuiPane } from "@/components/CommandBuilder/GuiPane";
import { DeviceNode, TOPOLOGY_QUICK_CONFIG_EVENT } from "./DeviceNode";
import { TopologyEdge } from "./TopologyEdge";
import { groupInterfaces, summarizeInterfaces } from "./portUtils";
import type { TopologyDiscoveryResponse } from "@/types/topology";
import type { TopologyEdgeData } from "@/types/topology";

const NODE_TYPES = { device: DeviceNode };
const EDGE_TYPES = { topology: TopologyEdge };

const EDGE_DEFAULTS = {
  type: "topology",
  data: { sourceLabel: "Eth1", targetLabel: "Eth1", recent: false },
};

const EDGE_EDIT_EVENT = "topology-edge-edit";

type EdgeAdminState = NonNullable<TopologyEdgeData["adminState"]>;
const EDGE_STATE_OPTIONS: EdgeAdminState[] = ["up", "maintenance", "down"];

const clamp = (value: number, min: number, max: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

const parseSeed = (nodeId: string) => {
  const numeric = Number(nodeId.replace(/\D+/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
};

const buildEdgeDraft = (data?: TopologyEdgeData) => ({
  sourceLabel: data?.sourceLabel ?? "Eth1",
  targetLabel: data?.targetLabel ?? "Eth1",
  bandwidthMbps: data?.bandwidthMbps ?? 1000,
  latencyMs: data?.latencyMs ?? 5,
  adminState: (data?.adminState ?? "up") as EdgeAdminState,
});

type InterfaceBankProps = {
  title: string;
  interfaces?: string[] | null;
  tone?: "cyan" | "amber";
  compact?: boolean;
};

function InterfaceBank({ title, interfaces, tone = "cyan", compact = false }: InterfaceBankProps) {
  const groupedInterfaces = groupInterfaces(interfaces);
  const summary = summarizeInterfaces(interfaces, compact ? 3 : 4);

  return (
    <div className={cn("rounded-xl border border-edge-subtle bg-void/60 p-3", compact ? "p-2.5" : "") }>
      <div className="flex items-center justify-between gap-2">
        <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">{title}</p>
        <span className={cn(
          "telemetry-chip px-2 py-0.5 text-2xs",
          tone === "amber" ? "border-amber-300/35 text-amber-200" : "border-cyan-300/35 text-cyan-200"
        )}>
          {summary.total}
        </span>
      </div>

      {summary.total === 0 ? (
        <p className="mt-2 text-xs text-ink-muted">No discovered ports yet.</p>
      ) : (
        <div className={cn("mt-2 space-y-2 pr-1", compact ? "max-h-28" : "max-h-48", "overflow-y-auto")}>
          {groupedInterfaces.map((group) => {
            const maxVisible = compact ? 4 : 6;
            const hiddenCount = Math.max(0, group.interfaces.length - maxVisible);

            return (
              <div key={group.family} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-mono uppercase tracking-[0.16em] text-cyan-200/80">
                    {group.family}
                  </p>
                  <span className="telemetry-chip px-1.5 py-0.5 text-2xs">
                    {group.interfaces.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.interfaces.slice(0, maxVisible).map((interfaceName) => (
                    <span
                      key={interfaceName}
                      className={cn(
                        "telemetry-chip px-1.5 py-0.5 text-2xs",
                        tone === "amber" ? "border-amber-300/35 text-amber-100" : "border-edge-subtle text-cyan-100"
                      )}
                    >
                      {interfaceName}
                    </span>
                  ))}
                  {hiddenCount > 0 && (
                    <span className={cn(
                      "telemetry-chip px-1.5 py-0.5 text-2xs",
                      tone === "amber" ? "border-amber-300/35 text-amber-200" : "border-edge-subtle text-cyan-200"
                    )}>
                      +{hiddenCount}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function enrichTopologyNodes(nodes: Node<DeviceNodeData>[], edges: Edge[]) {
  const nodeNames = new Map(nodes.map((node) => [node.id, node.data.pod.pod_name]));
  const linkStats = new Map<string, { count: number; peers: Set<string> }>();

  for (const node of nodes) {
    linkStats.set(node.id, { count: 0, peers: new Set<string>() });
  }

  for (const edge of edges) {
    const sourceStats = linkStats.get(edge.source);
    const targetStats = linkStats.get(edge.target);

    if (sourceStats) {
      sourceStats.count += 1;
      const peer = nodeNames.get(edge.target);
      if (peer) sourceStats.peers.add(peer);
    }

    if (targetStats) {
      targetStats.count += 1;
      const peer = nodeNames.get(edge.source);
      if (peer) targetStats.peers.add(peer);
    }
  }

  return nodes.map((node) => {
    const stats = linkStats.get(node.id);
    return {
      ...node,
      type: "device" as const,
      data: {
        ...node.data,
        connectionCount: stats?.count ?? 0,
        connectedPeers: Array.from(stats?.peers ?? []),
        inlineConfig: node.data.inlineConfig ?? true,
      },
    } as DeviceFlowNode;
  });
}

function stripDerivedNodeData(nodes: Node<DeviceNodeData>[]): DeviceFlowNode[] {
  return nodes.map((node) => ({
    ...node,
    type: "device" as const,
    data: {
      pod: node.data.pod,
    },
  } as DeviceFlowNode));
}

type LinkNoticeTone = "ok" | "warn";
type LinkNotice = {
  id: number;
  tone: LinkNoticeTone;
  text: string;
};

export function TopologyView() {
  const queryClient = useQueryClient();
  const setView = useAppStore((s) => s.setView);
  const selectedPod = usePodStore((s) => s.selectedPod);
  const selectPod = usePodStore((s) => s.selectPod);
  const { data: pods, isLoading, error } = usePods();
  const podCount = pods?.length ?? 0;

  const { nodes: stored, edges: stored_edges, setNodes: persist, setEdges: persistEdges, syncPods } =
    useTopologyStore();

  const [, setNodes, onNodesChange] = useNodesState<Node<DeviceNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(stored_edges);
  const [activeEdgeId, setActiveEdgeId] = useState<string | null>(null);
  const [quickConfigPod, setQuickConfigPod] = useState<LabPod | null>(null);
  const [quickConfigCommands, setQuickConfigCommands] = useState<string[]>([]);
  const [discoveryMode] = useState(true);
  const [discoverySeedId, setDiscoverySeedId] = useState<number | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [portDraft, setPortDraft] = useState({ sourceLabel: "Eth1", targetLabel: "Eth1" });
  const [metadataDraft, setMetadataDraft] = useState<{ bandwidthMbps: number; latencyMs: number; adminState: EdgeAdminState }>({
    bandwidthMbps: 1000,
    latencyMs: 5,
    adminState: "up",
  });
  const [linkNotice, setLinkNotice] = useState<LinkNotice | null>(null);
  const sourcePortInputRef = useRef<HTMLInputElement>(null);

  const mapNodes = useMemo(
    () => enrichTopologyNodes(stored as Node<DeviceNodeData>[], edges),
    [stored, edges]
  );

  const discoveryQuery = useTopologyDiscovery(discoverySeedId, discoveryMode);

  const discoveryNodes = useMemo(
    () => discoveryQuery.data ? enrichTopologyNodes(discoveryQuery.data.nodes as Node<DeviceNodeData>[], discoveryQuery.data.edges as Edge[]) : [],
    [discoveryQuery.data]
  );
  const discoveryWarnings = discoveryQuery.data?.warnings ?? [];
  const refetchDiscovery = discoveryQuery.refetch;

  const canvasNodes = discoveryMode ? discoveryNodes : mapNodes;
  const canvasEdges = useMemo(
    () => (discoveryMode ? discoveryQuery.data?.edges ?? [] : edges),
    [discoveryMode, discoveryQuery.data?.edges, edges]
  );

  const nodeNames = useMemo(
    () => new Map(canvasNodes.map((node) => [node.id, node.data.pod.pod_name])),
    [canvasNodes]
  );

  const activeQuickNode = useMemo(
    () => canvasNodes.find((node) => node.data.pod.id === quickConfigPod?.id) ?? null,
    [canvasNodes, quickConfigPod]
  );

  const activeEdge = useMemo(
    () => (discoveryMode ? null : edges.find((edge) => edge.id === activeEdgeId) ?? null),
    [edges, activeEdgeId, discoveryMode]
  );

  const activeNode = useMemo(
    () => canvasNodes.find((node) => node.id === activeNodeId) ?? null,
    [activeNodeId, canvasNodes]
  );

  const liveLinkRows = useMemo(
    () =>
      canvasEdges.slice(0, 24).map((edge) => {
        const edgeData = (edge.data ?? {}) as TopologyEdgeData;
        const sourceName = nodeNames.get(edge.source) ?? edge.source;
        const targetName = nodeNames.get(edge.target) ?? edge.target;
        const sourcePort = edgeData.sourceLabel ?? edgeData.sourceInterfaces?.[0] ?? "Eth?";
        const targetPort = edgeData.targetLabel ?? edgeData.targetInterfaces?.[0] ?? "Eth?";
        const protocol = edgeData.discoveryProtocols?.length
          ? edgeData.discoveryProtocols.map((value) => value.toUpperCase()).join("/")
          : edgeData.isDiscovery
            ? "DISCOVERY"
            : "MANUAL";
        const state = edgeData.adminState ?? (edgeData.isDiscovery ? "live" : "up");

        return {
          id: edge.id,
          sourceName,
          targetName,
          portLabel: `${sourcePort} ↔ ${targetPort}`,
          protocol,
          state,
        };
      }),
    [canvasEdges, nodeNames]
  );

  const discoverySeedPod = useMemo(
    () => pods?.find((pod) => pod.id === discoverySeedId) ?? null,
    [pods, discoverySeedId]
  );

  const pushLinkNotice = useCallback((tone: LinkNoticeTone, text: string) => {
    setLinkNotice({ id: Date.now(), tone, text });
  }, []);

  useEffect(() => {
    if (pods) syncPods(pods);
  }, [pods, syncPods]);

  useEffect(() => {
    if (discoverySeedId !== null) return;
    if (selectedPod?.id) {
      setDiscoverySeedId(selectedPod.id);
      return;
    }
    if (pods && pods.length > 0) {
      setDiscoverySeedId(pods[0].id);
    }
  }, [discoverySeedId, pods, selectedPod]);

  useEffect(() => {
    if (!pods || pods.length === 0) return;
    if (discoverySeedId === null) return;

    // Inventory changed while discovery is active; refresh immediately.
    void refetchDiscovery();
  }, [podCount, discoverySeedId, pods, refetchDiscovery]);

  useEffect(() => {
    if (discoveryMode) return;
    setNodes(mapNodes);
  }, [mapNodes, setNodes, discoveryMode]);

  useEffect(() => {
    if (activeNodeId === null) return;
    if (canvasNodes.some((node) => node.id === activeNodeId)) return;
    setActiveNodeId(null);
  }, [activeNodeId, canvasNodes]);

  useEffect(() => {
    const handleQuickConfigRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ pod?: LabPod }>).detail;
      if (!detail?.pod) return;
      setQuickConfigPod(detail.pod);
      setQuickConfigCommands([]);
    };

    window.addEventListener(TOPOLOGY_QUICK_CONFIG_EVENT, handleQuickConfigRequest as EventListener);
    return () => {
      window.removeEventListener(TOPOLOGY_QUICK_CONFIG_EVENT, handleQuickConfigRequest as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!linkNotice) return;
    const timer = window.setTimeout(() => setLinkNotice(null), 1900);
    return () => window.clearTimeout(timer);
  }, [linkNotice]);

  useEffect(() => {
    if (!discoveryMode || discoverySeedId === null) return;

    const socket = new WebSocket(buildWsUrl("/api/v1/topology/ws"));

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as {
          type?: string;
          seed_pod_id?: number;
          snapshot?: TopologyDiscoveryResponse;
          updated_count?: number;
        };

        if (message.type === "hostname.sync") {
          void queryClient.invalidateQueries({ queryKey: ["pods"] });
          if (discoverySeedId !== null) {
            void refetchDiscovery();
          }
          if ((message.updated_count ?? 0) > 0) {
            pushLinkNotice("ok", `Hostname sync updated ${message.updated_count} node(s).`);
          }
          return;
        }

        if (message.type !== "topology.discovery") return;
        if (message.seed_pod_id !== discoverySeedId) return;
        if (!message.snapshot) return;

        queryClient.setQueryData(["topology-discovery", discoverySeedId], message.snapshot);
        pushLinkNotice("ok", `Topology refreshed for ${message.snapshot.seed_pod_name}.`);
      } catch {
        pushLinkNotice("warn", "Ignored malformed topology update.");
      }
    };

    return () => {
      socket.close();
    };
  }, [discoveryMode, discoverySeedId, pushLinkNotice, queryClient, refetchDiscovery]);

  useEffect(() => {
    if (!activeEdge) return;
    const activeData = buildEdgeDraft((activeEdge.data ?? {}) as TopologyEdgeData);
    setPortDraft({
      sourceLabel: activeData.sourceLabel,
      targetLabel: activeData.targetLabel,
    });
    setMetadataDraft({
      bandwidthMbps: activeData.bandwidthMbps,
      latencyMs: activeData.latencyMs,
      adminState: activeData.adminState,
    });
  }, [activeEdge]);

  useEffect(() => {
    if (!activeEdgeId) return;
    if (edges.every((edge) => edge.id !== activeEdgeId)) {
      setActiveEdgeId(null);
    }
  }, [edges, activeEdgeId]);

  useEffect(() => {
    const handleEdgeEditRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      const requestedId = detail?.id;
      if (!requestedId) return;
      setActiveNodeId(null);
      setActiveEdgeId(requestedId);
    };

    window.addEventListener(EDGE_EDIT_EVENT, handleEdgeEditRequest as EventListener);
    return () => {
      window.removeEventListener(EDGE_EDIT_EVENT, handleEdgeEditRequest as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!activeEdgeId) return;
    const timer = window.setTimeout(() => {
      sourcePortInputRef.current?.focus();
    }, 40);
    return () => window.clearTimeout(timer);
  }, [activeEdgeId]);

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      if (discoveryMode) return;
      onNodesChange(changes);
      setTimeout(() => {
        setNodes((current) => {
          persist(stripDerivedNodeData(current));
          return current;
        });
      }, 300);
    },
    [discoveryMode, onNodesChange, setNodes, persist]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (discoveryMode) {
        pushLinkNotice("warn", "Discovery graph is read-only.");
        return;
      }

      const sourceId = connection.source;
      const targetId = connection.target;

      if (!sourceId || !targetId) {
        pushLinkNotice("warn", "Connection needs both endpoints.");
        return;
      }

      if (sourceId === targetId) {
        pushLinkNotice("warn", "Loopback links are blocked in map mode.");
        return;
      }

      const duplicate = edges.some(
        (edge) =>
          (edge.source === sourceId && edge.target === targetId) ||
          (edge.source === targetId && edge.target === sourceId)
      );
      if (duplicate) {
        pushLinkNotice("warn", "Link already exists between these pods.");
        return;
      }

      const edgeId = `${sourceId}->${targetId}-${Date.now()}`;
      const sourceSeed = parseSeed(sourceId);
      const targetSeed = parseSeed(targetId);
      const bandwidthOptions = [100, 250, 500, 1000, 2500, 10000];
      const bandwidthMbps = bandwidthOptions[(sourceSeed + targetSeed) % bandwidthOptions.length];
      const latencyMs = ((sourceSeed * 7 + targetSeed * 3) % 18) + 2;

      const next = addEdge(
        {
          id: edgeId,
          ...connection,
          ...EDGE_DEFAULTS,
          data: {
            ...EDGE_DEFAULTS.data,
            recent: true,
            bandwidthMbps,
            latencyMs,
            adminState: "up",
          },
        },
        edges
      );

      setEdges(next);
      persistEdges(next);
      setActiveEdgeId(edgeId);
      pushLinkNotice(
        "ok",
        `Linked ${nodeNames.get(sourceId) ?? sourceId} -> ${nodeNames.get(targetId) ?? targetId}`
      );

      window.setTimeout(() => {
        setEdges((current) => {
          const updated = current.map((edge) =>
            edge.id === edgeId
              ? {
                  ...edge,
                  data: {
                    ...((edge.data ?? {}) as TopologyEdgeData),
                    recent: false,
                  },
                }
              : edge
          );
          persistEdges(updated);
          return updated;
        });
      }, 1300);
    },
    [discoveryMode, edges, setEdges, persistEdges, pushLinkNotice, nodeNames]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      if (discoveryMode) return;
      onEdgesChange(changes);
      setTimeout(() => {
        setEdges((current) => {
          persistEdges(current);
          return current;
        });
      }, 100);
    },
    [discoveryMode, onEdgesChange, setEdges, persistEdges]
  );

  const handleEdgeClick = useCallback((_: unknown, edge: Edge) => {
    if (discoveryMode) return;
    setActiveNodeId(null);
    setActiveEdgeId(edge.id);
  }, [discoveryMode]);

  const handleNodeClick = useCallback((_: unknown, node: DeviceFlowNode) => {
    setActiveEdgeId(null);
    setActiveNodeId(node.id);
  }, []);

  const applyEdgeSettings = useCallback(() => {
    if (discoveryMode || !activeEdgeId) return;

    const sourceLabel = portDraft.sourceLabel.trim() || "Eth1";
    const targetLabel = portDraft.targetLabel.trim() || "Eth1";
    const bandwidthMbps = Math.round(clamp(metadataDraft.bandwidthMbps, 10, 400000, 1000));
    const latencyMs = Math.round(clamp(metadataDraft.latencyMs, 1, 500, 5));
    const adminState = metadataDraft.adminState;

    setEdges((current) => {
      const updated = current.map((edge) =>
        edge.id === activeEdgeId
          ? {
              ...edge,
              data: {
                ...((edge.data ?? {}) as TopologyEdgeData),
                sourceLabel,
                targetLabel,
                bandwidthMbps,
                latencyMs,
                adminState,
              },
            }
          : edge
      );
      persistEdges(updated);
      return updated;
    });

    setMetadataDraft((current) => ({
      ...current,
      bandwidthMbps,
      latencyMs,
    }));

    pushLinkNotice("ok", "Updated link settings.");
  }, [
    discoveryMode,
    activeEdgeId,
    metadataDraft.adminState,
    metadataDraft.bandwidthMbps,
    metadataDraft.latencyMs,
    portDraft.sourceLabel,
    portDraft.targetLabel,
    setEdges,
    persistEdges,
    pushLinkNotice,
  ]);

  const resetActiveEdgeDraft = useCallback(() => {
    if (discoveryMode || !activeEdge) return;
    const data = buildEdgeDraft((activeEdge.data ?? {}) as TopologyEdgeData);
    setPortDraft({
      sourceLabel: data.sourceLabel,
      targetLabel: data.targetLabel,
    });
    setMetadataDraft({
      bandwidthMbps: data.bandwidthMbps,
      latencyMs: data.latencyMs,
      adminState: data.adminState,
    });
  }, [activeEdge, discoveryMode]);

  const removeActiveEdge = useCallback(() => {
    if (discoveryMode || !activeEdgeId) return;
    setEdges((current) => {
      const updated = current.filter((edge) => edge.id !== activeEdgeId);
      persistEdges(updated);
      return updated;
    });
    setActiveEdgeId(null);
    pushLinkNotice("warn", "Link removed from topology.");
  }, [activeEdgeId, discoveryMode, setEdges, persistEdges, pushLinkNotice]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (discoveryMode || !activeEdgeId) return;

      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        applyEdgeSettings();
        return;
      }

      const target = event.target as HTMLElement | null;
      const isFieldTarget = !!target && (
        target.isContentEditable
        || target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.tagName === "SELECT"
      );

      if (isFieldTarget) {
        if (event.key === "Escape") {
          event.preventDefault();
          setActiveEdgeId(null);
          pushLinkNotice("warn", "Link editor closed.");
        }
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        removeActiveEdge();
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setActiveEdgeId(null);
        pushLinkNotice("warn", "Link deselected.");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeEdgeId, applyEdgeSettings, discoveryMode, removeActiveEdge, pushLinkNotice]);

  const closeQuickConfig = useCallback(() => {
    setQuickConfigPod(null);
    setQuickConfigCommands([]);
  }, []);

  useEffect(() => {
    if (!discoveryMode) return;
    setActiveEdgeId(null);
    setActiveNodeId(null);
    closeQuickConfig();
  }, [closeQuickConfig, discoveryMode]);

  const runDiscovery = useCallback(() => {
    if (discoverySeedId === null) {
      pushLinkNotice("warn", "Pick a seed node for discovery first.");
      return;
    }

    setActiveEdgeId(null);
    setActiveNodeId(null);
    closeQuickConfig();

    void discoveryQuery.refetch();
  }, [closeQuickConfig, discoveryQuery, discoverySeedId, pushLinkNotice]);

  const openBuilderFromQuickConfig = useCallback(() => {
    if (!quickConfigPod) return;
    selectPod(quickConfigPod as LabPod);
    setView("builder");
  }, [quickConfigPod, selectPod, setView]);

  const openBuilderFromActiveNode = useCallback(() => {
    if (!activeNode) return;

    if (activeNode.data.inlineConfig && activeNode.data.pod.id > 0) {
      window.dispatchEvent(new CustomEvent(TOPOLOGY_QUICK_CONFIG_EVENT, { detail: { pod: activeNode.data.pod as LabPod } }));
      return;
    }

    if (activeNode.data.pod.id > 0) {
      selectPod(activeNode.data.pod as LabPod);
      setView("builder");
    }
  }, [activeNode, selectPod, setView]);

  const canvasNodeCount = discoveryMode ? discoveryQuery.data?.nodes.length ?? 0 : podCount;
  const canvasLinkCount = discoveryMode ? discoveryQuery.data?.edges.length ?? 0 : edges.length;
  const canvasLoading = isLoading || (discoveryMode && (discoveryQuery.isLoading || (discoveryQuery.isFetching && !discoveryQuery.data)));
  const canvasError = discoveryMode ? discoveryQuery.error : error;
  const canvasKey = discoveryMode
    ? `discovery-${discoverySeedId ?? "none"}-${discoveryQuery.data?.nodes.length ?? 0}-${discoveryQuery.data?.edges.length ?? 0}`
    : "lab-map";

  return (
    <div className="w-screen h-screen bg-void flex flex-col relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(49,196,255,0.14),transparent_40%),linear-gradient(180deg,rgba(4,8,16,0.95)_0%,rgba(3,6,12,0.98)_100%)] pointer-events-none" />
      <div className="absolute inset-0 bg-grid-cyan opacity-14 pointer-events-none" />

      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 flex items-center justify-between px-5 py-3 border-b border-edge-subtle bg-depth/90 backdrop-blur-sm flex-shrink-0"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView("selector")}
            className="flex items-center gap-1.5 text-ink-muted hover:text-ink-secondary transition-colors text-xs font-mono micro-tap"
            title="Return to the 3D campus"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> 3D Campus
          </button>
          <div className="w-px h-4 bg-edge-subtle" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-cyan-glow-md border border-edge-hard flex items-center justify-center shadow-glow-cyan-sm">
              <Network className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <span className="text-sm font-semibold text-ink-bright">Realtime Topology Canvas</span>
            {pods && (
              <span className="telemetry-chip border-edge-glow text-cyan-300">
                {discoveryMode ? `${canvasNodeCount} nodes · ${canvasLinkCount} links` : `${pods.length} nodes`}
              </span>
            )}
            {discoveryMode && (
              <span className="telemetry-chip border-amber-300/35 text-amber-200">
                seed: {discoverySeedPod?.pod_name ?? "pending"}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runDiscovery}
            className="btn-ghost text-xs gap-1.5 micro-tap"
            title="Force an immediate discovery refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Rescan
          </button>
          <button onClick={() => setView("admin")} className="btn-ghost text-xs gap-1.5 micro-tap">
            <Settings className="w-3.5 h-3.5" /> Manage Nodes
          </button>
        </div>
      </motion.header>

      {/* Canvas */}
      <div className="flex-1 relative z-10">
        {canvasLoading && (
          <ViewLoading
            className="absolute inset-0 z-20 bg-void/55 backdrop-blur-sm"
            title={discoveryMode ? "Mapping LLDP/CDP Fabric" : "Building Topology Graph"}
            subtitle={discoveryMode ? "Running discovery and arranging the live neighbor graph..." : "Hydrating nodes, links, and persisted layout..."}
          />
        )}

        {canvasError && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="surface-panel flex items-center gap-3 px-5 py-4 border-crimson/35 bg-crimson/10">
              <AlertCircle className="w-5 h-5 text-crimson" />
              <div>
                <p className="text-sm font-semibold text-crimson">Backend unreachable</p>
                <p className="text-xs text-ink-muted mt-0.5">{(canvasError as Error)?.message}</p>
              </div>
            </div>
          </div>
        )}

        <ReactFlow
          key={canvasKey}
          nodes={canvasNodes}
          edges={canvasEdges}
          onNodesChange={discoveryMode ? undefined : handleNodesChange}
          onEdgesChange={discoveryMode ? undefined : handleEdgesChange}
          onConnect={discoveryMode ? undefined : onConnect}
          onEdgeClick={discoveryMode ? undefined : handleEdgeClick}
          onEdgeDoubleClick={discoveryMode ? undefined : handleEdgeClick}
          onNodeClick={handleNodeClick}
          onPaneClick={() => {
            setActiveEdgeId(null);
            setActiveNodeId(null);
          }}
          nodesDraggable={!discoveryMode}
          nodesConnectable={!discoveryMode}
          edgesFocusable={!discoveryMode}
          elementsSelectable
          nodeTypes={NODE_TYPES}
          edgeTypes={EDGE_TYPES}
          defaultEdgeOptions={EDGE_DEFAULTS}
          connectionLineStyle={{
            stroke: "rgba(49,196,255,0.88)",
            strokeWidth: 2.2,
            strokeDasharray: "6 4",
            filter: "drop-shadow(0 0 8px rgba(49,196,255,0.45))",
          }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          style={{ background: "rgba(3,5,10,0.82)" }}
        >
          {/* Graph-paper style background — cross-hatch at two scales */}
          <Background
            variant={BackgroundVariant.Lines}
            gap={40}
            size={0.5}
            color="rgba(49,196,255,0.09)"
          />
          <Background
            id="bg-major"
            variant={BackgroundVariant.Lines}
            gap={200}
            size={1}
            color="rgba(49,196,255,0.15)"
          />

          <Controls
            className="topology-controls"
          />

          <MiniMap
            className="topology-minimap"
            nodeColor={(n) =>
              n.selected ? "rgba(49,196,255,0.95)" : "rgba(49,196,255,0.4)"
            }
            maskColor="rgba(3,4,10,0.78)"
          />

          <Panel position="top-left">
            <motion.div
              initial={{ opacity: 0, x: -12, y: -6 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.2 }}
              className="surface-panel w-[332px] p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xs font-mono uppercase tracking-widest text-cyan-300 flex items-center gap-1.5">
                  <Network className="w-3 h-3" />
                  discovery monitor
                </p>
                <span className="telemetry-chip px-2 py-0.5 border-amber-300/35 text-amber-200">auto 15s</span>
              </div>

              <div className="mt-3 space-y-2.5">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-edge-subtle bg-void/60 p-2.5">
                    <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">seed</p>
                    <p className="mt-1 text-xs font-semibold text-ink-bright truncate">
                      {discoverySeedPod?.pod_name ?? "pending"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-edge-subtle bg-void/60 p-2.5">
                    <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">nodes</p>
                    <p className="mt-1 text-xs font-semibold text-ink-bright">{canvasNodeCount}</p>
                  </div>
                  <div className="rounded-xl border border-edge-subtle bg-void/60 p-2.5">
                    <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">links</p>
                    <p className="mt-1 text-xs font-semibold text-ink-bright">{canvasLinkCount}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={runDiscovery}
                    disabled={podCount === 0}
                    className="btn-hud text-xs flex-1 micro-tap"
                  >
                    Refresh discovery
                  </button>
                </div>

                <p className="text-2xs font-mono text-ink-muted">
                  Link labels and ports update in real time as LLDP/CDP snapshots arrive.
                </p>

                {discoveryWarnings.length > 0 && (
                  <div className="rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[11px] leading-4 font-mono text-amber-100">
                    {discoveryWarnings[0]}
                  </div>
                )}
              </div>
            </motion.div>
          </Panel>

          <Panel position="top-right">
            <AnimatePresence initial={false}>
              {activeEdge ? (
                <motion.div
                  initial={{ opacity: 0, x: 16, y: -6 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, x: 16, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="surface-panel w-[288px] p-3.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-2xs font-mono uppercase tracking-widest text-cyan-300 flex items-center gap-1.5">
                      <PencilLine className="w-3 h-3" /> link editor
                    </p>
                    <span className="telemetry-chip px-2 py-0.5">
                      <Link2 className="w-3 h-3" /> selected
                    </span>
                  </div>

                  <div className="mt-2 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "telemetry-chip px-2 py-0.5 capitalize",
                        metadataDraft.adminState === "up"
                          ? "text-matrix border-matrix/35"
                          : metadataDraft.adminState === "maintenance"
                            ? "text-amber-300 border-amber-300/35"
                            : "text-crimson border-crimson/40"
                      )}
                    >
                      {metadataDraft.adminState}
                    </span>
                    <span className="telemetry-chip px-2 py-0.5">
                      {Math.round(metadataDraft.bandwidthMbps)}M
                    </span>
                    <span className="telemetry-chip px-2 py-0.5">
                      {Math.round(metadataDraft.latencyMs)}ms
                    </span>
                  </div>

                  <p className="mt-2 text-2xs font-mono text-ink-muted">
                    {nodeNames.get(activeEdge.source) ?? activeEdge.source}
                    {" -> "}
                    {nodeNames.get(activeEdge.target) ?? activeEdge.target}
                  </p>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <label className="space-y-1">
                      <span className="text-2xs font-mono uppercase tracking-wider text-ink-muted">source port</span>
                      <input
                        ref={sourcePortInputRef}
                        value={portDraft.sourceLabel}
                        onChange={(event) =>
                          setPortDraft((current) => ({
                            ...current,
                            sourceLabel: event.target.value,
                          }))
                        }
                        className="input-field h-8 px-2.5 py-1 text-xs"
                        maxLength={18}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-2xs font-mono uppercase tracking-wider text-ink-muted">target port</span>
                      <input
                        value={portDraft.targetLabel}
                        onChange={(event) =>
                          setPortDraft((current) => ({
                            ...current,
                            targetLabel: event.target.value,
                          }))
                        }
                        className="input-field h-8 px-2.5 py-1 text-xs"
                        maxLength={18}
                      />
                    </label>
                  </div>

                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <label className="space-y-1">
                      <span className="text-2xs font-mono uppercase tracking-wider text-ink-muted">Bandwidth (Mbps)</span>
                      <input
                        value={metadataDraft.bandwidthMbps}
                        onChange={(event) =>
                          setMetadataDraft((current) => ({
                            ...current,
                            bandwidthMbps: Number(event.target.value),
                          }))
                        }
                        className="input-field h-8 px-2.5 py-1 text-xs"
                        type="number"
                        min={10}
                        max={400000}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-2xs font-mono uppercase tracking-wider text-ink-muted">Latency (ms)</span>
                      <input
                        value={metadataDraft.latencyMs}
                        onChange={(event) =>
                          setMetadataDraft((current) => ({
                            ...current,
                            latencyMs: Number(event.target.value),
                          }))
                        }
                        className="input-field h-8 px-2.5 py-1 text-xs"
                        type="number"
                        min={1}
                        max={500}
                      />
                    </label>

                    <label className="space-y-1">
                      <span className="text-2xs font-mono uppercase tracking-wider text-ink-muted">State</span>
                      <div className="relative">
                        <select
                          value={metadataDraft.adminState}
                          onChange={(event) =>
                            setMetadataDraft((current) => ({
                              ...current,
                              adminState: event.target.value as EdgeAdminState,
                            }))
                          }
                          className="input-field h-8 px-2.5 py-1 text-xs appearance-none"
                        >
                          {EDGE_STATE_OPTIONS.map((state) => (
                            <option key={state} value={state}>
                              {state}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5">
                    <button
                      onClick={applyEdgeSettings}
                      className="btn-hud text-2xs px-2.5 py-1.5 micro-tap"
                    >
                      <Check className="w-3.5 h-3.5" /> Apply
                    </button>
                    <button
                      onClick={resetActiveEdgeDraft}
                      className="btn-ghost text-2xs px-2.5 py-1.5 micro-tap"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Reset
                    </button>
                    <button
                      onClick={removeActiveEdge}
                      className="btn-ghost text-2xs px-2.5 py-1.5 text-crimson border-crimson/30 hover:border-crimson/45 hover:text-crimson micro-tap"
                    >
                      <Unplug className="w-3.5 h-3.5" /> Remove
                    </button>
                  </div>

                  <p className="mt-2 text-2xs font-mono text-ink-muted">
                    shortcut: Del remove · Esc close · Ctrl+Enter apply
                  </p>
                </motion.div>
              ) : activeNode ? (
                <motion.div
                  initial={{ opacity: 0, x: 16, y: -6 }}
                  animate={{ opacity: 1, x: 0, y: 0 }}
                  exit={{ opacity: 0, x: 16, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="surface-panel w-[364px] p-3.5 max-h-[calc(100vh-170px)] flex flex-col"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-2xs font-mono uppercase tracking-widest text-cyan-300 flex items-center gap-1.5">
                      <Network className="w-3 h-3" /> node port map
                    </p>
                    <span className="telemetry-chip px-2 py-0.5">
                      <Link2 className="w-3 h-3" /> selected
                    </span>
                  </div>

                  <div className="mt-2 min-w-0">
                    <h3 className="text-sm font-semibold text-ink-bright truncate">
                      {activeNode.data.pod.pod_name}
                    </h3>
                    <p className="text-2xs text-ink-muted truncate">
                      {activeNode.data.discovery?.platform ?? activeNode.data.pod.device_type}
                      {activeNode.data.discovery?.management_address ? ` · ${activeNode.data.discovery.management_address}` : ""}
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-edge-subtle bg-void/60 p-3">
                      <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">links</p>
                      <p className="mt-1 text-base font-semibold text-ink-bright">{activeNode.data.connectionCount ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-edge-subtle bg-void/60 p-3">
                      <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">peers</p>
                      <p className="mt-1 text-base font-semibold text-ink-bright">{activeNode.data.connectedPeers?.length ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-edge-subtle bg-void/60 p-3">
                      <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">local ports</p>
                      <p className="mt-1 text-base font-semibold text-ink-bright">{activeNode.data.discovery?.local_interfaces?.length ?? 0}</p>
                    </div>
                    <div className="rounded-xl border border-edge-subtle bg-void/60 p-3">
                      <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">remote ports</p>
                      <p className="mt-1 text-base font-semibold text-ink-bright">{activeNode.data.discovery?.remote_interfaces?.length ?? 0}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-xl border border-edge-subtle bg-void/60 p-3">
                    <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">connected peers</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(activeNode.data.connectedPeers?.length ?? 0) > 0
                        ? activeNode.data.connectedPeers?.map((peer) => (
                            <span key={peer} className="telemetry-chip px-2 py-0.5 text-2xs">
                              {peer}
                            </span>
                          ))
                        : (
                          <span className="text-xs text-ink-muted">No links yet</span>
                        )}
                    </div>
                  </div>

                  <div className="mt-3 flex-1 min-h-0 overflow-y-auto pr-1 space-y-3">
                    {activeNode.data.discovery?.protocols && activeNode.data.discovery.protocols.length > 0 && (
                      <div className="rounded-xl border border-edge-subtle bg-void/60 p-3">
                        <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">discovery protocols</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {activeNode.data.discovery.protocols.map((protocol) => (
                            <span key={protocol} className="telemetry-chip px-2 py-0.5 text-2xs">
                              {protocol.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <InterfaceBank
                      title="Local interfaces"
                      interfaces={activeNode.data.discovery?.local_interfaces}
                      tone="cyan"
                    />

                    <InterfaceBank
                      title="Remote interfaces"
                      interfaces={activeNode.data.discovery?.remote_interfaces}
                      tone="amber"
                    />
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={openBuilderFromActiveNode}
                      disabled={activeNode.data.pod.id <= 0}
                      className="btn-hud text-2xs px-2.5 py-1.5 micro-tap"
                    >
                      <Settings className="w-3.5 h-3.5" /> Open config
                    </button>
                    <button
                      onClick={() => setActiveNodeId(null)}
                      className="btn-ghost text-2xs px-2.5 py-1.5 micro-tap"
                    >
                      Close
                    </button>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </Panel>

          <Panel position="bottom-left">
            <motion.div
              initial={{ opacity: 0, x: -8, y: 8 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.2 }}
              className="surface-panel w-[440px] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-2xs font-mono uppercase tracking-[0.16em] text-cyan-300">live connection labels</p>
                <span className="telemetry-chip px-2 py-0.5">{liveLinkRows.length}</span>
              </div>

              <div className="mt-2 max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {liveLinkRows.length > 0 ? (
                  liveLinkRows.map((row) => (
                    <div key={row.id} className="rounded-lg border border-edge-subtle bg-void/72 px-2.5 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-2xs font-mono text-cyan-100 truncate">{row.sourceName} ↔ {row.targetName}</p>
                        <span
                          className={cn(
                            "telemetry-chip px-2 py-0.5 text-2xs uppercase",
                            row.state === "down"
                              ? "border-crimson/35 text-crimson"
                              : row.state === "maintenance"
                                ? "border-amber-300/35 text-amber-200"
                                : "border-matrix/35 text-matrix"
                          )}
                        >
                          {row.state}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-2xs font-mono">
                        <span className="text-ink-secondary truncate">{row.portLabel}</span>
                        <span className="text-cyan-200">{row.protocol}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg border border-edge-subtle bg-void/72 px-2.5 py-2 text-2xs font-mono text-ink-muted">
                    Waiting for discovered links...
                  </p>
                )}
              </div>
            </motion.div>
          </Panel>

          <Panel position="bottom-center">
            <div className="flex flex-col items-center gap-2">
              <AnimatePresence>
                {linkNotice && (
                  <motion.p
                    key={linkNotice.id}
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className={cn(
                      "text-2xs font-mono px-3 py-1.5 rounded-full border backdrop-blur-sm",
                      linkNotice.tone === "ok"
                        ? "text-matrix border-matrix/35 bg-matrix/12"
                        : "text-pulse border-pulse/35 bg-pulse/12"
                    )}
                  >
                    {linkNotice.text}
                  </motion.p>
                )}
              </AnimatePresence>

              <p className="text-2xs font-mono text-ink-secondary bg-depth/85 px-3.5 py-1.5 rounded-full border border-edge-subtle backdrop-blur-sm shadow-glow-cyan-sm">
                {discoveryMode
                  ? "packet-tracer style live map · edge labels auto-refresh in real time"
                  : <>drag to wire links · drag to move nodes · click edge labels or double-click link to edit · click <strong className="text-cyan-300">enter</strong> to configure</>}
              </p>
            </div>
          </Panel>
        </ReactFlow>

        <AnimatePresence>
          {quickConfigPod && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="absolute inset-0 z-30 bg-void/72 backdrop-blur-md"
              onClick={closeQuickConfig}
            >
              <motion.div
                initial={{ x: 36, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 36, opacity: 0 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-y-0 right-0 w-full max-w-[96rem] border-l border-edge-dim bg-void/96 shadow-2xl flex flex-col"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-4 border-b border-edge-dim bg-depth/75 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-2xs font-mono uppercase tracking-[0.2em] text-cyan-300">In-map quick config</p>
                    <h3 className="mt-1 text-base font-semibold text-ink-bright truncate">{quickConfigPod.pod_name}</h3>
                    <p className="text-xs text-ink-muted truncate">{quickConfigPod.device_ip} · {quickConfigPod.device_type}</p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={openBuilderFromQuickConfig}
                      className="btn-hud text-xs gap-1.5 micro-tap"
                    >
                      <Settings className="w-3.5 h-3.5" /> Open full builder
                    </button>
                    <button
                      onClick={closeQuickConfig}
                      className="btn-ghost text-xs micro-tap"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="flex-1 min-h-0 p-4">
                  <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1.28fr)_minmax(320px,0.72fr)]">
                    <section className="rounded-2xl border border-edge-dim bg-surface/94 overflow-hidden shadow-card min-h-0 flex flex-col">
                      <div className="flex items-center justify-between gap-3 border-b border-edge-dim px-4 py-3 bg-depth/50 flex-shrink-0">
                        <div>
                          <p className="text-2xs font-mono uppercase tracking-[0.18em] text-cyan-300">Command cockpit</p>
                          <h4 className="text-sm font-semibold text-ink-bright">Clustered config workspace</h4>
                        </div>
                        <span className="telemetry-chip px-2 py-0.5">{quickConfigPod.device_type}</span>
                      </div>
                      <div className="flex-1 min-h-0 p-4 overflow-hidden">
                        <GuiPane
                          deviceType={quickConfigPod.device_type}
                          onCommandsChange={setQuickConfigCommands}
                        />
                      </div>
                    </section>

                    <aside className="flex min-h-0 flex-col gap-4">
                      <section className="rounded-2xl border border-edge-dim bg-depth/80 p-4 shadow-card">
                        <p className="text-2xs font-mono uppercase tracking-[0.18em] text-cyan-300">Device intel</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-edge-subtle bg-void/60 p-3">
                            <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">links</p>
                            <p className="mt-1 text-base font-semibold text-ink-bright">{activeQuickNode?.data.connectionCount ?? 0}</p>
                          </div>
                          <div className="rounded-xl border border-edge-subtle bg-void/60 p-3">
                            <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">state</p>
                            <p className="mt-1 text-base font-semibold text-ink-bright">inline</p>
                          </div>
                        </div>

                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-edge-subtle bg-void/60 p-3">
                            <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">local ports</p>
                            <p className="mt-1 text-base font-semibold text-ink-bright">
                              {activeQuickNode?.data.discovery?.local_interfaces?.length ?? 0}
                            </p>
                          </div>
                          <div className="rounded-xl border border-edge-subtle bg-void/60 p-3">
                            <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">remote ports</p>
                            <p className="mt-1 text-base font-semibold text-ink-bright">
                              {activeQuickNode?.data.discovery?.remote_interfaces?.length ?? 0}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-edge-subtle bg-void/60 p-3">
                          <p className="text-2xs font-mono uppercase tracking-[0.16em] text-ink-muted">connected peers</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(activeQuickNode?.data.connectedPeers?.length ?? 0) > 0
                              ? activeQuickNode?.data.connectedPeers?.map((peer) => (
                                  <span key={peer} className="telemetry-chip px-2 py-0.5 text-2xs">
                                    {peer}
                                  </span>
                                ))
                              : (
                                <span className="text-xs text-ink-muted">No links yet</span>
                              )}
                          </div>
                        </div>
                      </section>

                      <section className="rounded-2xl border border-edge-dim bg-depth/80 p-4 shadow-card flex-1 min-h-0 flex flex-col">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-2xs font-mono uppercase tracking-[0.18em] text-cyan-300">Live preview</p>
                          <span className="telemetry-chip px-2 py-0.5">{quickConfigCommands.length} commands</span>
                        </div>
                        <div className="mt-3 flex-1 min-h-0 overflow-y-auto rounded-xl border border-edge-subtle bg-void/60 p-3 font-mono text-2xs leading-relaxed text-ink-secondary">
                          {quickConfigCommands.length > 0 ? (
                            <pre className="whitespace-pre-wrap break-words">{quickConfigCommands.slice(0, 16).join("\n")}{quickConfigCommands.length > 16 ? "\n..." : ""}</pre>
                          ) : (
                            <p>Choose a cluster to generate commands, then push into the full builder when ready.</p>
                          )}
                        </div>
                      </section>

                      <section className="rounded-2xl border border-edge-dim bg-depth/80 p-4 shadow-card">
                        <p className="text-2xs font-mono uppercase tracking-[0.18em] text-cyan-300">Fast actions</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button onClick={openBuilderFromQuickConfig} className="btn-primary text-xs">
                            Jump to builder
                          </button>
                          <button onClick={closeQuickConfig} className="btn-ghost text-xs">
                            Stay on map
                          </button>
                        </div>
                      </section>
                    </aside>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
