const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const queryKeys = {
  clusterOverview: ["cluster", "overview"] as const,
  workloads: ["cluster", "workloads"] as const,
  events: ["cluster", "events"] as const,
  clusterConfig: ["cluster", "config"] as const,
} as const;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export interface ClusterOverviewResponse {
  cluster_name: string;
  kubernetes_version: string;
  node_count: number;
  ready_nodes: number;
  namespace_count: number;
  total_pods: number;
  healthy_pods: number;
  pending_pods: number;
  failing_pods: number;
  generated_at: string;
}

export type WorkloadStatus = "Healthy" | "Degraded" | "Warning" | "Unknown";

export interface WorkloadSummaryResponse {
  name: string;
  namespace: string;
  kind: "Deployment" | "StatefulSet" | "DaemonSet" | "CronJob" | "Job";
  replicas_desired: number | null;
  replicas_ready: number | null;
  version: string | null;
  status: WorkloadStatus;
  updated_at: string | null;
}

export interface EventMessageResponse {
  type: string;
  reason: string;
  message: string;
  involved_object: string;
  namespace: string | null;
  timestamp: string;
}

export interface ClusterConfigResponse {
  id: number;
  name: string;
  api_server: string | null;
  namespace: string | null;
  context: string | null;
  kubeconfig_present: boolean;
  token_present: boolean;
  certificate_authority_data_present: boolean;
  insecure_skip_tls_verify: boolean;
  created_at: string;
  updated_at: string;
  kubeconfig: string | null;
  token: string | null;
  certificate_authority_data: string | null;
}

export interface ClusterConfigPayload {
  name: string;
  api_server: string | null;
  namespace: string | null;
  context: string | null;
  kubeconfig: string | null;
  token: string | null;
  certificate_authority_data: string | null;
  insecure_skip_tls_verify: boolean;
}

export function fetchClusterOverview(): Promise<ClusterOverviewResponse> {
  return request<ClusterOverviewResponse>("/cluster/overview");
}

export function fetchWorkloads(): Promise<WorkloadSummaryResponse[]> {
  return request<WorkloadSummaryResponse[]>("/cluster/workloads");
}

export function fetchEvents(): Promise<EventMessageResponse[]> {
  return request<EventMessageResponse[]>("/events/");
}

export function fetchClusterConfig(): Promise<ClusterConfigResponse | null> {
  return request<ClusterConfigResponse | null>("/cluster/config/");
}

export function saveClusterConfig(payload: ClusterConfigPayload): Promise<ClusterConfigResponse> {
  return request<ClusterConfigResponse>("/cluster/config/", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
