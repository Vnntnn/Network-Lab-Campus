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
  connection_protocol?: "ssh" | "telnet";
  telnet_port?: number | null;
  description: string;
  ssh_username?: string | null;
  ssh_password?: string | null;
  identity_id?: number | null;
  identity_name?: string | null;
  display_name?: string | null;
  detected_device_type?: string | null;
  auto_detected?: boolean;
}

export interface LabPodWrite {
  pod_number: number;
  pod_name: string;
  device_ip: string;
  device_type: "arista_eos" | "cisco_iosxe" | "cisco_iosxr";
  connection_protocol: "ssh" | "telnet";
  telnet_port?: number | null;
  ssh_username?: string | null;
  ssh_password?: string | null;
  identity_id?: number | null;
  display_name?: string | null;
  description?: string;
}

export interface Identity {
  id: number;
  name: string;
  username: string;
  password: string;
  is_default: boolean;
  created_at: string;
}

export interface IdentityCreatePayload {
  name: string;
  username: string;
  password: string;
  is_default?: boolean;
}

export interface IdentityUpdatePayload {
  id: number;
  name?: string;
  username?: string;
  password?: string;
  is_default?: boolean;
}

export interface PodInterface {
  interface_name: string;
  connected: boolean;
  disabled: boolean;
  can_disable: boolean;
  peer_count: number;
}

export interface PodInterfacesResponse {
  pod_id: number;
  pod_name: string;
  discovered_at: string;
  interfaces: PodInterface[];
}

export interface PodInterfaceSetPayload {
  podId: number;
  interface_name: string;
  disabled: boolean;
}

export interface DiscoverAllItem {
  pod_id: number;
  pod_name: string;
  success: boolean;
  discovered_at?: string | null;
  node_count: number;
  edge_count: number;
  warnings: string[];
  error?: string | null;
}

export interface DiscoverAllResponse {
  started_at: string;
  completed_at: string;
  total: number;
  successful: number;
  failed: number;
  items: DiscoverAllItem[];
}

export type DiscoverAllJobStatus = "pending" | "running" | "completed" | "failed";

export interface DiscoverAllJobStartResponse {
  job_id: number;
  status: DiscoverAllJobStatus;
}

export interface DiscoverAllJobRead {
  id: number;
  owner_id: string;
  status: DiscoverAllJobStatus;
  max_hops: number;
  total: number;
  successful: number;
  failed: number;
  items: DiscoverAllItem[];
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  updated_at: string;
}

export interface RouteEntry {
  code: string;
  protocol: string;
  prefix: string;
  next_hop?: string | null;
  interface?: string | null;
  raw: string;
}

export interface RouteAnalytics {
  pod_id: number;
  pod_name: string;
  generated_at: string;
  source_command: string;
  total_routes: number;
  default_route_present: boolean;
  protocol_counts: Record<string, number>;
  routes: RouteEntry[];
  warnings: string[];
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

export interface DeviceHistoryEntry {
  id: number;
  device_key: string;
  pod_id: number;
  pod_name: string;
  actor_id: string;
  commands: string[];
  success: boolean;
  output: string;
  elapsed_ms: number;
  pre_snapshot_id?: number | null;
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
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
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

export const useDiscoverAllTopology = () =>
  useMutation<DiscoverAllResponse, Error, { max_hops?: number } | void>({
    mutationFn: async (payload) =>
      (
        await api.post<DiscoverAllResponse>("/topology/discover-all", null, {
          params: { max_hops: payload?.max_hops ?? 3 },
        })
      ).data,
  });

export const useStartDiscoverAllJob = () =>
  useMutation<DiscoverAllJobStartResponse, Error, { max_hops?: number } | void>({
    mutationFn: async (payload) =>
      (
        await api.post<DiscoverAllJobStartResponse>("/topology/discover-all/jobs", null, {
          params: { max_hops: payload?.max_hops ?? 3 },
        })
      ).data,
  });

export const useDiscoverAllJob = (jobId: number | null, enabled = true) =>
  useQuery<DiscoverAllJobRead>({
    queryKey: ["topology-discover-all-job", jobId],
    queryFn: async () => (await api.get<DiscoverAllJobRead>(`/topology/discover-all/jobs/${jobId}`)).data,
    enabled: enabled && jobId !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === "pending" || status === "running") {
        return 1500;
      }
      return false;
    },
    refetchIntervalInBackground: false,
  });

export const useRouteAnalytics = (podId: number | null, enabled = true) =>
  useQuery<RouteAnalytics>({
    queryKey: ["route-analytics", podId],
    queryFn: async () => (await api.get<RouteAnalytics>(`/topology/routes/${podId}`)).data,
    enabled: enabled && podId !== null,
    refetchInterval: enabled && podId !== null ? 30_000 : false,
    refetchIntervalInBackground: false,
  });

export const usePodInterfaces = (podId: number | null, enabled = true) =>
  useQuery<PodInterfacesResponse>({
    queryKey: ["pod-interfaces", podId],
    queryFn: async () => (await api.get<PodInterfacesResponse>(`/pods/${podId}/interfaces`)).data,
    enabled: enabled && podId !== null,
    refetchInterval: enabled && podId !== null ? 20_000 : false,
    refetchIntervalInBackground: false,
  });

export const useSetPodInterfaceState = () => {
  const qc = useQueryClient();
  return useMutation<PodInterfacesResponse, Error, PodInterfaceSetPayload>({
    mutationFn: async ({ podId, interface_name, disabled }) =>
      (
        await api.post<PodInterfacesResponse>(`/pods/${podId}/interfaces`, {
          interface_name,
          disabled,
        })
      ).data,
    onSuccess: (_, payload) => {
      qc.invalidateQueries({ queryKey: ["pod-interfaces", payload.podId] });
      qc.invalidateQueries({ queryKey: ["topology-discovery", payload.podId] });
    },
  });
};

export const useIdentities = () =>
  useQuery<Identity[]>({
    queryKey: ["identities"],
    queryFn: async () => (await api.get<Identity[]>("/identities/")).data,
    refetchInterval: 20_000,
    refetchIntervalInBackground: true,
  });

export const useCreateIdentity = () => {
  const qc = useQueryClient();
  return useMutation<Identity, Error, IdentityCreatePayload>({
    mutationFn: async (payload) => (await api.post<Identity>("/identities/", payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identities"] });
      qc.invalidateQueries({ queryKey: ["pods"] });
    },
  });
};

export const useUpdateIdentity = () => {
  const qc = useQueryClient();
  return useMutation<Identity, Error, IdentityUpdatePayload>({
    mutationFn: async ({ id, ...payload }) =>
      (await api.patch<Identity>(`/identities/${id}`, payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identities"] });
      qc.invalidateQueries({ queryKey: ["pods"] });
    },
  });
};

export const useSetDefaultIdentity = () => {
  const qc = useQueryClient();
  return useMutation<Identity, Error, number>({
    mutationFn: async (id) => (await api.post<Identity>(`/identities/${id}/default`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identities"] });
      qc.invalidateQueries({ queryKey: ["pods"] });
    },
  });
};

export const useDeleteIdentity = () => {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      await api.delete(`/identities/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["identities"] });
      qc.invalidateQueries({ queryKey: ["pods"] });
    },
  });
};

export const useDeviceHistory = (deviceKey: string | null, limit = 50) =>
  useQuery<DeviceHistoryEntry[]>({
    queryKey: ["device-history", deviceKey, limit],
    queryFn: async () =>
      (
        await api.get<DeviceHistoryEntry[]>(`/commands/history/device/${encodeURIComponent(deviceKey as string)}`, {
          params: { limit },
        })
      ).data,
    enabled: !!deviceKey && deviceKey.trim().length > 0,
    refetchInterval: deviceKey ? 10_000 : false,
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
  return useMutation<LabPod, Error, LabPodWrite>({
    mutationFn: async (payload) => (await api.post<LabPod>("/pods/", payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pods"] }),
  });
};

export const useUpdatePod = () => {
  const qc = useQueryClient();
  return useMutation<LabPod, Error, { id: number } & Partial<LabPodWrite>>({
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
