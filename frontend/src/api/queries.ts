import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { TopologyDiscoveryResponse } from "@/types/topology";

export type {
  TopologyDevice,
  TopologyFlowEdge,
  TopologyFlowNode,
  TopologyEdgeData,
  TopologyDiscoveryResponse,
} from "@/types/topology";

export interface LabPod {
  id: number;
  pod_number: number;
  pod_name: string;
  device_ip: string;
  device_type: "arista_eos" | "cisco_iosxe" | "cisco_iosxr";
  description: string;
  ssh_username: string;
  ssh_password: string;
}

export interface PushResponse {
  success: boolean;
  output: string;
  elapsed_ms: number;
  pre_snapshot_id?: number | null;
}

export interface ShowResult {
  command: string;
  output: string;
}

export interface ShowResponse {
  success: boolean;
  results: ShowResult[];
  elapsed_ms: number;
}

export interface MultiPushResult {
  pod_id: number;
  pod_name: string;
  success: boolean;
  elapsed_ms: number;
  output: string;
  error?: string;
}

export interface Snapshot {
  id: number;
  pod_id: number;
  label: string;
  content: string;
  created_at: string;
}

export interface BackendHealth {
  status: string;
  service: string;
}

// ── Queries ───────────────────────────────────────────────────────────────

export interface PingResponse {
  reachable: boolean;
  version_line: string;
  elapsed_ms: number;
}

export const usePods = () =>
  useQuery<LabPod[]>({
    queryKey: ["pods"],
    queryFn: async () => (await api.get<LabPod[]>("/pods/")).data,
  });

export const useBackendHealth = () =>
  useQuery<BackendHealth>({
    queryKey: ["health"],
    queryFn: async () => (await api.get<BackendHealth>("/health", { baseURL: "/" })).data,
    refetchInterval: 15_000,
    retry: false,
  });

export const useSnapshots = (podId: number) =>
  useQuery<Snapshot[]>({
    queryKey: ["snapshots", podId],
    queryFn: async () => (await api.get<Snapshot[]>(`/snapshots/pod/${podId}`)).data,
  });

export const useTopologyDiscovery = (podId: number | null, enabled = true) =>
  useQuery<TopologyDiscoveryResponse>({
    queryKey: ["topology-discovery", podId],
    queryFn: async () => (await api.get<TopologyDiscoveryResponse>(`/topology/discover/${podId}`)).data,
    enabled: enabled && podId !== null,
    refetchInterval: enabled && podId !== null ? 15_000 : false,
    refetchIntervalInBackground: false,
  });

// ── Mutations ─────────────────────────────────────────────────────────────

export const usePushCommands = () =>
  useMutation<PushResponse, Error, { pod_id: number; commands: string[] }>({
    mutationFn: async (payload) =>
      (await api.post<PushResponse>("/commands/push", payload)).data,
  });

export const useRunShow = () =>
  useMutation<ShowResponse, Error, { pod_id: number; commands: string[] }>({
    mutationFn: async (payload) =>
      (await api.post<ShowResponse>("/commands/show", payload)).data,
  });

export const useCreatePod = () => {
  const qc = useQueryClient();
  return useMutation<LabPod, Error, Omit<LabPod, "id">>({
    mutationFn: async (payload) => (await api.post<LabPod>("/pods/", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pods"] }),
  });
};

export const useUpdatePod = () => {
  const qc = useQueryClient();
  return useMutation<LabPod, Error, { id: number } & Partial<Omit<LabPod, "id">>>({
    mutationFn: async ({ id, ...payload }) =>
      (await api.put<LabPod>(`/pods/${id}`, payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pods"] }),
  });
};

export const useDeletePod = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => { await api.delete(`/pods/${id}`); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pods"] }),
  });
};

export const usePingPod = () =>
  useMutation<PingResponse, Error, number>({
    mutationFn: async (id) => (await api.get<PingResponse>(`/pods/${id}/ping`)).data,
  });

export const useMultiPush = () =>
  useMutation<MultiPushResult[], Error, { pod_ids: number[]; commands: string[] }>({
    mutationFn: async (body) => (await api.post<MultiPushResult[]>("/orchestration/multi-push", body)).data,
  });

export const useCaptureSnapshot = () => {
  const qc = useQueryClient();
  return useMutation<Snapshot, Error, { podId: number; label?: string }>({
    mutationFn: async ({ podId, label }) =>
      (
        await api.post<Snapshot>(`/snapshots/capture/${podId}`, null, {
          params: { label },
        })
      ).data,
    onSuccess: (_, { podId }) => {
      qc.invalidateQueries({ queryKey: ["snapshots", podId] });
    },
  });
};

export const useRollbackSnapshot = () =>
  useMutation<{ success: boolean; elapsed_ms: number }, Error, number>({
    mutationFn: async (snapId) => (await api.post(`/snapshots/${snapId}/rollback`)).data,
  });

export const useDeleteSnapshot = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, { snapId: number; podId: number }>({
    mutationFn: async ({ snapId }) => {
      await api.delete(`/snapshots/${snapId}`);
    },
    onSuccess: (_, { podId }) => {
      qc.invalidateQueries({ queryKey: ["snapshots", podId] });
    },
  });
};
