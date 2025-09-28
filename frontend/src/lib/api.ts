const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const queryKeys = {
  clusterOverview: ["cluster", "overview"] as const,
  workloads: ["cluster", "workloads"] as const,
  events: ["cluster", "events"] as const,
  clusterConfig: ["cluster", "config"] as const,
  clusterConfigsAll: ["cluster", "configs", "all"] as const,
  metricsStatus: ["metrics", "status"] as const,
  clusterCapacity: ["cluster", "capacity"] as const,
  clusterStorage: ["cluster", "storage"] as const,
  namespaces: ["namespaces", "list"] as const,
  podsInNamespace: (ns: string) => ["namespaces", ns, "pods"] as const,
  containerSeries: (ns: string, pod: string, container: string, window: string) => [
    "metrics",
    "container",
    ns,
    pod,
    container,
    window,
  ] as const,
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

export type ClusterConfigDetail = ClusterConfigResponse;

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

export function fetchClusterConfig(): Promise<ClusterConfigDetail | null> {
  return request<ClusterConfigDetail | null>("/cluster/config/");
}

export function saveClusterConfig(payload: ClusterConfigPayload): Promise<ClusterConfigResponse> {
  return request<ClusterConfigResponse>("/cluster/config/", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function listClusterConfigs(): Promise<ClusterConfigResponse[]> {
  return request<ClusterConfigResponse[]>("/cluster/config/all");
}

export function selectActiveClusterByName(name: string): Promise<ClusterConfigResponse> {
  return request<ClusterConfigResponse>("/cluster/config/select", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export interface MetricsServerStatusResponse {
  installed: boolean;
  healthy: boolean;
  message: string | null;
}

export interface ClusterCapacityResponse {
  has_metrics: boolean;
  cpu_total_mcores: number | null;
  cpu_used_mcores: number | null;
  cpu_percent: number | null;
  memory_total_bytes: number | null;
  memory_used_bytes: number | null;
  memory_percent: number | null;
}

export function fetchMetricsStatus(): Promise<MetricsServerStatusResponse> {
  return request<MetricsServerStatusResponse>("/metrics/status");
}

export function installMetricsServer(insecureKubeletTls = false): Promise<MetricsServerStatusResponse> {
  return request<MetricsServerStatusResponse>("/metrics/install", {
    method: "POST",
    body: JSON.stringify({ insecure_kubelet_tls: insecureKubeletTls }),
  });
}

export function fetchClusterCapacity(): Promise<ClusterCapacityResponse> {
  return request<ClusterCapacityResponse>("/metrics/capacity");
}

export interface StorageSummaryResponse {
  pvc_total: number;
  pvc_by_status: Record<string, number>;
  pvc_by_namespace: Record<string, number>;
  pv_total: number;
  pv_by_phase: Record<string, number>;
}

export function fetchStorageSummary(): Promise<StorageSummaryResponse> {
  return request<StorageSummaryResponse>("/cluster/storage");
}

export interface NamespaceSummaryResponse {
  name: string;
  status: "Active" | "Terminating" | "Unknown";
  resource_quota: Record<string, string> | null;
  labels: Record<string, string>;
}

export function fetchNamespaces(): Promise<NamespaceSummaryResponse[]> {
  return request<NamespaceSummaryResponse[]>("/namespaces/");
}

export interface PodWithContainersResponse {
  name: string;
  containers: string[];
}

export function fetchPodsInNamespace(ns: string): Promise<PodWithContainersResponse[]> {
  const encoded = encodeURIComponent(ns);
  return request<PodWithContainersResponse[]>(`/namespaces/${encoded}/pods`);
}

export interface ContainerMetricPointResponse {
  ts: string;
  cpu_mcores: number;
  memory_bytes: number;
}

export interface ContainerMetricSeriesResponse {
  has_metrics: boolean;
  namespace: string;
  pod: string;
  container: string;
  points: ContainerMetricPointResponse[];
}

export function fetchContainerSeries(
  ns: string,
  pod: string,
  container: string,
  window: string,
): Promise<ContainerMetricSeriesResponse> {
  const params = new URLSearchParams({
    namespace: ns,
    pod,
    container,
    window,
  });
  return request<ContainerMetricSeriesResponse>(`/metrics/container?${params.toString()}`);
}
