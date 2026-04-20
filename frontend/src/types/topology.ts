import type { Edge, Node } from "@xyflow/react";

export interface TopologyDevice {
  id: number;
  pod_number: number | null;
  pod_name: string;
  device_ip: string;
  device_type: "arista_eos" | "cisco_iosxe" | "cisco_iosxr" | "unknown";
  ssh_username: string;
  ssh_password: string;
  description: string;
  is_external?: boolean;
  is_seed?: boolean;
  badge_label?: string | null;
  matched_pod_id?: number | null;
}

export interface TopologyNodeDiscovery {
  is_external: boolean;
  is_seed: boolean;
  protocols: string[];
  platform?: string | null;
  management_address?: string | null;
  local_interfaces: string[];
  remote_interfaces: string[];
  source_commands: string[];
  matched_pod_id?: number | null;
}

export interface TopologyNodeData extends Record<string, unknown> {
  pod: TopologyDevice;
  connectionCount?: number;
  connectedPeers?: string[];
  inlineConfig?: boolean;
  badgeLabel?: string | null;
  discovery?: TopologyNodeDiscovery;
}

export type TopologyFlowNode = Node<TopologyNodeData, "device">;

export interface TopologyEdgeData extends Record<string, unknown> {
  sourceLabel?: string;
  targetLabel?: string;
  recent?: boolean;
  bandwidthMbps?: number | null;
  latencyMs?: number | null;
  adminState?: "up" | "maintenance" | "down";
  isDiscovery?: boolean;
  discoveryProtocols?: string[];
  discoveryNote?: string | null;
  sourceInterfaces?: string[];
  targetInterfaces?: string[];
}

export type TopologyFlowEdge = Edge<TopologyEdgeData>;

export interface TopologyDiscoveryResponse {
  seed_pod_id: number;
  seed_pod_name: string;
  discovered_at: string;
  commands: string[];
  nodes: TopologyFlowNode[];
  edges: TopologyFlowEdge[];
  warnings?: string[];
}