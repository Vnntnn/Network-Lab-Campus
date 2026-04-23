import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Edge } from "@xyflow/react";
import type { LabPod } from "@/api/queries";
import type { TopologyDevice, TopologyNodeData, TopologyFlowNode } from "@/types/topology";

export type DeviceNodeData = TopologyNodeData;
export type DeviceFlowNode = TopologyFlowNode;

function toTopologyDevice(pod: LabPod): TopologyDevice {
  return {
    id: pod.id,
    pod_number: pod.pod_number,
    pod_name: pod.pod_name,
    device_ip: pod.device_ip,
    device_type: pod.device_type,
    ssh_username: pod.ssh_username ?? "",
    ssh_password: pod.ssh_password ?? "",
    description: pod.description,
    is_external: false,
    is_seed: false,
    badge_label: `pod ${pod.pod_number}`,
    matched_pod_id: pod.id,
  };
}

function autoLayout(pods: LabPod[]): DeviceFlowNode[] {
  const cols = Math.max(3, Math.ceil(Math.sqrt(pods.length)));
  return pods.map((pod, i) => ({
    id:       `pod-${pod.id}`,
    type:     "device" as const,
    position: {
      x: (i % cols) * 300 + 80,
      y: Math.floor(i / cols) * 220 + 80,
    },
      data: {
        pod: toTopologyDevice(pod),
        badgeLabel: `pod ${pod.pod_number}`,
      },
  }));
}

interface TopologyStore {
  nodes:       DeviceFlowNode[];
  edges:       Edge[];
  setNodes:    (nodes: DeviceFlowNode[]) => void;
  setEdges:    (edges: Edge[]) => void;
  syncPods:    (pods: LabPod[]) => void;
}

export const useTopologyStore = create<TopologyStore>()(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],

      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),

      syncPods: (pods) => {
        const { nodes } = get();
        const existing = new Map(nodes.map((n) => [n.id, n]));
        const base = autoLayout(pods);

        const merged = base.map((n) => {
          const saved = existing.get(n.id);
          return saved
            ? { ...saved, data: { ...saved.data, pod: n.data.pod, badgeLabel: `pod ${n.data.pod.pod_number}` } }  // update pod data, keep position
            : n;
        });

        // Remove nodes for deleted pods
        const validIds = new Set(pods.map((p) => `pod-${p.id}`));
        set({ nodes: merged.filter((n) => validIds.has(n.id)) });
      },
    }),
    {
      name:       "nexus-edu-topology",
      partialize: (s) => ({ nodes: s.nodes, edges: s.edges }),
    }
  )
);
