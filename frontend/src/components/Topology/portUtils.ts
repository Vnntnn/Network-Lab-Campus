import type { Edge } from "@xyflow/react";
import type { TopologyEdgeData } from "@/types/topology";

const INTERFACE_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export interface ConnectionLedgerRow {
  id: string;
  peerName: string;
  localPort: string;
  remotePort: string;
  protocol: string;
  state: "up" | "maintenance" | "down" | "discovery";
  isDiscovery: boolean;
}

export function normalizeInterfaces(interfaces?: string[] | null): string[] {
  return Array.from(
    new Set(
      (interfaces ?? [])
        .map((interfaceName) => interfaceName.trim())
        .filter((interfaceName) => interfaceName.length > 0)
    )
  ).sort((left, right) => INTERFACE_COLLATOR.compare(left, right));
}

export function interfaceFamily(interfaceName: string): string {
  return interfaceName.match(/^[A-Za-z-]+/)?.[0] ?? "ports";
}

export function groupInterfaces(interfaces?: string[] | null): Array<{ family: string; interfaces: string[] }> {
  const grouped = new Map<string, string[]>();

  for (const interfaceName of normalizeInterfaces(interfaces)) {
    const family = interfaceFamily(interfaceName);
    const familyMembers = grouped.get(family) ?? [];
    familyMembers.push(interfaceName);
    grouped.set(family, familyMembers);
  }

  return Array.from(grouped.entries())
    .map(([family, interfaces]) => ({
      family,
      interfaces: interfaces.sort((left, right) => INTERFACE_COLLATOR.compare(left, right)),
    }))
    .sort((left, right) => INTERFACE_COLLATOR.compare(left.family, right.family));
}

export function summarizeInterfaces(interfaces?: string[] | null, visibleCount = 4) {
  const normalized = normalizeInterfaces(interfaces);

  return {
    total: normalized.length,
    visible: normalized.slice(0, visibleCount),
    overflow: Math.max(0, normalized.length - visibleCount),
  };
}

export function formatInterfaceSummary(interfaces?: string[] | null, fallback = "none") {
  const normalized = normalizeInterfaces(interfaces);

  if (normalized.length === 0) return fallback;
  if (normalized.length === 1) return normalized[0];

  return `${normalized[0]} +${normalized.length - 1}`;
}

export function buildConnectionLedger(
  nodeId: string,
  nodeNames: Map<string, string>,
  edges: Array<Edge<TopologyEdgeData>>,
) {
  return edges
    .filter((edge) => edge.source === nodeId || edge.target === nodeId)
    .map((edge) => {
      const edgeData = (edge.data ?? {}) as TopologyEdgeData;
      const sourceIsActive = edge.source === nodeId;
      const peerId = sourceIsActive ? edge.target : edge.source;
      const peerName = nodeNames.get(peerId) ?? peerId;
      const localPort = sourceIsActive
        ? edgeData.sourceLabel ?? edgeData.sourceInterfaces?.[0] ?? "Eth?"
        : edgeData.targetLabel ?? edgeData.targetInterfaces?.[0] ?? "Eth?";
      const remotePort = sourceIsActive
        ? edgeData.targetLabel ?? edgeData.targetInterfaces?.[0] ?? "Eth?"
        : edgeData.sourceLabel ?? edgeData.sourceInterfaces?.[0] ?? "Eth?";
      const protocol = edgeData.discoveryProtocols?.length
        ? edgeData.discoveryProtocols.map((value) => value.toUpperCase()).join("/")
        : edgeData.isDiscovery
          ? "DISCOVERY"
          : "MANUAL";

      return {
        id: edge.id,
        peerName,
        localPort,
        remotePort,
        protocol,
        state: (edgeData.adminState ?? (edgeData.isDiscovery ? "discovery" : "up")) as ConnectionLedgerRow["state"],
        isDiscovery: Boolean(edgeData.isDiscovery),
      } satisfies ConnectionLedgerRow;
    })
    .sort((left, right) => left.peerName.localeCompare(right.peerName));
}