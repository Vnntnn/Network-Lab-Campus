import { describe, expect, it } from "vitest";
import type { Edge } from "@xyflow/react";
import type { TopologyEdgeData } from "@/types/topology";
import { buildConnectionLedger } from "../portUtils";

function makeEdge(overrides: Partial<Edge<TopologyEdgeData>>): Edge<TopologyEdgeData> {
  return {
    id: "edge-1",
    source: "pod-1",
    target: "pod-2",
    type: "topology",
    data: {
      sourceLabel: "Eth1",
      targetLabel: "Eth2",
      discoveryProtocols: ["lldp"],
      adminState: "up",
      isDiscovery: true,
      sourceInterfaces: ["Eth1"],
      targetInterfaces: ["Eth2"],
    },
    ...overrides,
  };
}

describe("buildConnectionLedger", () => {
  it("derives a device-centric connection row from discovery edges", () => {
    const rows = buildConnectionLedger(
      "pod-1",
      new Map([
        ["pod-2", "distribution-2"],
      ]),
      [makeEdge({})],
    );

    expect(rows).toEqual([
      {
        id: "edge-1",
        peerName: "distribution-2",
        localPort: "Eth1",
        remotePort: "Eth2",
        protocol: "LLDP",
        state: "up",
        isDiscovery: true,
      },
    ]);
  });

  it("reverses ports when the selected node is the target side", () => {
    const rows = buildConnectionLedger(
      "pod-2",
      new Map([
        ["pod-1", "core-1"],
      ]),
      [makeEdge({})],
    );

    expect(rows[0]).toMatchObject({
      peerName: "core-1",
      localPort: "Eth2",
      remotePort: "Eth1",
    });
  });
});