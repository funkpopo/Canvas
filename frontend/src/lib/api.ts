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
  storageClasses: ["storage", "classes"] as const,
  pvcs: (ns?: string) => ["storage", "pvcs", ns ?? "all"] as const,
  volumeList: (ns: string, pvc: string, path: string) => ["storage", "browser", ns, pvc, path] as const,
  nodes: ["cluster", "nodes"] as const,
  nodeDetail: (name: string) => ["nodes", name, "detail"] as const,
  nodeEvents: (name: string) => ["nodes", name, "events"] as const,
  nodePods: (name: string) => ["nodes", name, "pods"] as const,
  nodeYaml: (name: string) => ["nodes", name, "yaml"] as const,
  nodeMetrics: (name: string) => ["nodes", name, "metrics"] as const,
  nodeSeries: (name: string, window: string) => ["metrics", "node", name, window] as const,
  namespaces: ["namespaces", "list"] as const,
  podsInNamespace: (ns: string) => ["namespaces", ns, "pods"] as const,
  hpa: (ns: string, name: string) => ["deployments", ns, name, "autoscaling"] as const,
  strategy: (ns: string, name: string) => ["deployments", ns, name, "strategy"] as const,
  podsSummary: (ns?: string, name?: string, phase?: string, restart?: string) =>
    [
      "pods",
      "summary",
      ns ?? "all",
      name ?? "",
      phase ?? "",
      restart ?? "",
    ] as const,
  podDetail: (ns: string, name: string) => ["pods", ns, name, "detail"] as const,
  services: (ns?: string) => ["services", ns ?? "all"] as const,
  serviceYaml: (ns: string, name: string) => ["services", ns, name, "yaml"] as const,
  ingresses: (ns?: string) => ["ingresses", ns ?? "all"] as const,
  networkPolicies: (ns?: string) => ["networkpolicies", ns ?? "all"] as const,
  configMaps: (ns?: string) => ["configmaps", ns ?? "all"] as const,
  secrets: (ns?: string) => ["secrets", ns ?? "all"] as const,
  containerSeries: (ns: string, pod: string, container: string, window: string) => [
    "metrics",
    "container",
    ns,
    pod,
    container,
    window,
  ] as const,
  deploymentPods: (ns: string, name: string) => ["deployments", ns, name, "pods"] as const,
  deploymentYaml: (ns: string, name: string) => ["deployments", ns, name, "yaml"] as const,
  statefulsetYaml: (ns: string, name: string) => ["statefulsets", ns, name, "yaml"] as const,
  daemonsetYaml: (ns: string, name: string) => ["daemonsets", ns, name, "yaml"] as const,
  jobYaml: (ns: string, name: string) => ["jobs", ns, name, "yaml"] as const,
  cronjobYaml: (ns: string, name: string) => ["cronjobs", ns, name, "yaml"] as const,
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

export interface NodeSummaryResponse {
  name: string;
  status: "Ready" | "NotReady" | "Unknown";
  roles: string[];
  cpu_allocatable: string;
  memory_allocatable: string;
  cpu_usage?: number | null;
  memory_usage?: number | null;
  age?: string | null;
  // Optional: backend may include schedulable flag for list view badges
  schedulable?: boolean;
}

export interface NodeAddressResponse { type: string; address: string }
export interface NodeTaintResponse { key: string; value?: string | null; effect: string }
export interface NodeInfoResponse {
  os_image?: string | null;
  kernel_version?: string | null;
  kubelet_version?: string | null;
  kube_proxy_version?: string | null;
  container_runtime_version?: string | null;
  operating_system?: string | null;
  architecture?: string | null;
}
export interface NodeCapacityResponse {
  cpu_mcores?: number | null;
  memory_bytes?: number | null;
  pods?: number | null;
  ephemeral_storage_bytes?: number | null;
}

export interface NodeDetailResponse {
  name: string;
  schedulable: boolean;
  created_at?: string | null;
  uptime_seconds?: number | null;
  status: "Ready" | "NotReady" | "Unknown";
  conditions: Array<Record<string, unknown>>;
  labels: Record<string, string>;
  taints: NodeTaintResponse[];
  addresses: NodeAddressResponse[];
  node_info: NodeInfoResponse;
  allocatable: NodeCapacityResponse;
  capacity: NodeCapacityResponse;
  images: string[];
}

export interface NodePodSummaryResponse {
  namespace: string;
  name: string;
  phase: string;
  restarts: number;
  containers: string[];
}

export interface NodeMetricsResponse {
  has_metrics: boolean;
  cpu_mcores_total?: number | null;
  cpu_mcores_used?: number | null;
  cpu_percent?: number | null;
  memory_bytes_total?: number | null;
  memory_bytes_used?: number | null;
  memory_percent?: number | null;
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

// Network resources
export interface IngressSummary { namespace: string; name: string; hosts?: string[]; created_at?: string }
export interface NetworkPolicySummary { namespace: string; name: string; created_at?: string }
export interface ConfigMapSummary { namespace: string; name: string; created_at?: string }
export interface SecretSummary { namespace: string; name: string; type?: string | null; created_at?: string }

export function fetchIngresses(ns?: string): Promise<IngressSummary[]> {
  const q = ns && ns !== "all" ? `?namespace=${encodeURIComponent(ns)}` : "";
  return request<IngressSummary[]>(`/ingresses/${q}`.replace(/\/$/, "/"));
}
export interface YamlContentResponse { yaml: string }
export function fetchIngressYaml(ns: string, name: string): Promise<YamlContentResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<YamlContentResponse>(`/ingresses/${en}/${nm}/yaml`);
}
export interface OperationResultResponse { ok: boolean; message?: string | null }
export function updateIngressYaml(ns: string, name: string, yaml: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/ingresses/${en}/${nm}/yaml`, { method: "PUT", body: JSON.stringify({ yaml }) });
}
export function deleteIngress(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/ingresses/${en}/${nm}`, { method: "DELETE" });
}
export function fetchNetworkPolicies(ns?: string): Promise<NetworkPolicySummary[]> {
  const q = ns && ns !== "all" ? `?namespace=${encodeURIComponent(ns)}` : "";
  return request<NetworkPolicySummary[]>(`/networkpolicies/${q}`.replace(/\/$/, "/"));
}
export function fetchNetworkPolicyYaml(ns: string, name: string): Promise<YamlContentResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<YamlContentResponse>(`/networkpolicies/${en}/${nm}/yaml`);
}
export function updateNetworkPolicyYaml(ns: string, name: string, yaml: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/networkpolicies/${en}/${nm}/yaml`, { method: "PUT", body: JSON.stringify({ yaml }) });
}
export function deleteNetworkPolicy(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/networkpolicies/${en}/${nm}`, { method: "DELETE" });
}
export function fetchConfigMaps(ns?: string): Promise<ConfigMapSummary[]> {
  const q = ns && ns !== "all" ? `?namespace=${encodeURIComponent(ns)}` : "";
  return request<ConfigMapSummary[]>(`/configmaps/${q}`.replace(/\/$/, "/"));
}
export function fetchConfigMapYaml(ns: string, name: string): Promise<YamlContentResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<YamlContentResponse>(`/configmaps/${en}/${nm}/yaml`);
}
export function updateConfigMapYaml(ns: string, name: string, yaml: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/configmaps/${en}/${nm}/yaml`, { method: "PUT", body: JSON.stringify({ yaml }) });
}
export function deleteConfigMap(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/configmaps/${en}/${nm}`, { method: "DELETE" });
}
export function fetchSecrets(ns?: string): Promise<SecretSummary[]> {
  const q = ns && ns !== "all" ? `?namespace=${encodeURIComponent(ns)}` : "";
  return request<SecretSummary[]>(`/secrets/${q}`.replace(/\/$/, "/"));
}
export function fetchSecretYaml(ns: string, name: string): Promise<YamlContentResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<YamlContentResponse>(`/secrets/${en}/${nm}/yaml`);
}
export function updateSecretYaml(ns: string, name: string, yaml: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/secrets/${en}/${nm}/yaml`, { method: "PUT", body: JSON.stringify({ yaml }) });
}
export function deleteSecret(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/secrets/${en}/${nm}`, { method: "DELETE" });
}

// Storage classes
export interface StorageClassSummaryResponse {
  name: string;
  provisioner?: string | null;
  reclaim_policy?: string | null;
  volume_binding_mode?: string | null;
  allow_volume_expansion?: boolean | null;
  parameters: Record<string, string>;
  created_at?: string | null;
}

export interface StorageClassCreatePayload {
  name: string;
  provisioner: string;
  reclaim_policy?: string | null;
  volume_binding_mode?: string | null;
  allow_volume_expansion?: boolean | null;
  parameters?: Record<string, string>;
  // Extended fields for advanced provisioning
  sc_type?: "Generic" | "NFS";
  namespace?: string | null;
  // NFS specific
  nfs_server?: string | null;
  nfs_path?: string | null;
  nfs_capacity?: string | null;
  // StorageClass mount options
  mount_options?: string[];
  // Image selection for NFS client provisioner
  image_source?: "public" | "private" | null;
  private_image?: string | null;
}

export function fetchStorageClasses(): Promise<StorageClassSummaryResponse[]> {
  return request<StorageClassSummaryResponse[]>("/storage/classes");
}

export function createStorageClass(payload: StorageClassCreatePayload): Promise<OperationResultResponse> {
  return request<OperationResultResponse>("/storage/classes", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteStorageClass(name: string): Promise<OperationResultResponse> {
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/storage/classes/${nm}`, { method: "DELETE" });
}

// PVCs
export interface PersistentVolumeClaimSummaryResponse {
  namespace: string;
  name: string;
  status?: string | null;
  storage_class?: string | null;
  capacity?: string | null;
  access_modes: string[];
  volume_name?: string | null;
  created_at?: string | null;
}

export function fetchPvcs(namespace?: string): Promise<PersistentVolumeClaimSummaryResponse[]> {
  const params = new URLSearchParams();
  if (namespace && namespace !== "all") params.set("namespace", namespace);
  return request<PersistentVolumeClaimSummaryResponse[]>(`/storage/pvcs?${params.toString()}`);
}

// Volume browser
export interface VolumeFileEntryResponse {
  name: string;
  path: string;
  is_dir: boolean;
  permissions?: string | null;
  size?: number | null;
  mtime?: string | null;
}

export function fetchVolumeList(ns: string, pvc: string, path: string): Promise<VolumeFileEntryResponse[]> {
  const en = encodeURIComponent(ns);
  const pv = encodeURIComponent(pvc);
  const params = new URLSearchParams({ path });
  return request<VolumeFileEntryResponse[]>(`/storage/browser/${en}/${pv}/list?${params.toString()}`);
}

export interface FileContentResponse { path: string; base64_data: string }

export function readVolumeFile(ns: string, pvc: string, path: string): Promise<FileContentResponse | null> {
  const en = encodeURIComponent(ns);
  const pv = encodeURIComponent(pvc);
  const params = new URLSearchParams({ path });
  return request<FileContentResponse | null>(`/storage/browser/${en}/${pv}/read?${params.toString()}`);
}

export function writeVolumeFile(ns: string, pvc: string, path: string, base64: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const pv = encodeURIComponent(pvc);
  return request<OperationResultResponse>(`/storage/browser/${en}/${pv}/write`, {
    method: "PUT",
    body: JSON.stringify({ path, base64_data: base64 }),
  });
}

export function renameVolumePath(ns: string, pvc: string, oldPath: string, newName: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const pv = encodeURIComponent(pvc);
  const params = new URLSearchParams({ old_path: oldPath, new_name: newName });
  return request<OperationResultResponse>(`/storage/browser/${en}/${pv}/rename?${params.toString()}`, { method: "POST" });
}

export function downloadVolumePath(ns: string, pvc: string, path: string): string {
  const en = encodeURIComponent(ns);
  const pv = encodeURIComponent(pvc);
  const params = new URLSearchParams({ path });
  return `${API_BASE_URL}/storage/browser/${en}/${pv}/download?${params.toString()}`;
}

export function fetchNodes(): Promise<NodeSummaryResponse[]> {
  return request<NodeSummaryResponse[]>("/nodes/");
}

export function fetchNodeDetail(name: string): Promise<NodeDetailResponse> {
  const nm = encodeURIComponent(name);
  return request<NodeDetailResponse>(`/nodes/${nm}`);
}

export function fetchNodeEvents(name: string): Promise<EventMessageResponse[]> {
  const nm = encodeURIComponent(name);
  return request<EventMessageResponse[]>(`/nodes/${nm}/events`);
}

export function fetchNodePods(name: string): Promise<NodePodSummaryResponse[]> {
  const nm = encodeURIComponent(name);
  return request<NodePodSummaryResponse[]>(`/nodes/${nm}/pods`);
}

export function fetchNodeMetrics(name: string): Promise<NodeMetricsResponse> {
  const nm = encodeURIComponent(name);
  return request<NodeMetricsResponse>(`/nodes/${nm}/metrics`);
}

export function fetchNodeYaml(name: string): Promise<YamlContentResponse> {
  const nm = encodeURIComponent(name);
  return request<YamlContentResponse>(`/nodes/${nm}/yaml`);
}

export function updateNodeYaml(name: string, yaml: string): Promise<OperationResultResponse> {
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/nodes/${nm}/yaml`, { method: "PUT", body: JSON.stringify({ yaml }) });
}

export function setNodeSchedulable(name: string, schedulable: boolean): Promise<OperationResultResponse> {
  const nm = encodeURIComponent(name);
  const params = new URLSearchParams({ schedulable: String(Boolean(schedulable)) });
  return request<OperationResultResponse>(`/nodes/${nm}/schedulable?${params.toString()}`, { method: "POST" });
}

export function drainNode(name: string): Promise<OperationResultResponse> {
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/nodes/${nm}/drain`, { method: "POST" });
}

export function patchNodeLabels(name: string, labels: Record<string, string>): Promise<OperationResultResponse> {
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/nodes/${nm}/labels`, { method: "PATCH", body: JSON.stringify(labels) });
}

export function patchNodeTaints(name: string, taints: NodeTaintResponse[]): Promise<OperationResultResponse> {
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/nodes/${nm}/taints`, { method: "PATCH", body: JSON.stringify(taints) });
}

export function deleteNodeByName(name: string): Promise<OperationResultResponse> {
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/nodes/${nm}`, { method: "DELETE" });
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

export interface NamespaceCreatePayload { name: string; labels?: Record<string, string> }

export function createNamespace(payload: NamespaceCreatePayload): Promise<OperationResultResponse> {
  return request<OperationResultResponse>("/namespaces/", { method: "POST", body: JSON.stringify(payload) });
}

export function deleteNamespaceByName(name: string): Promise<OperationResultResponse> {
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/namespaces/${nm}`, { method: "DELETE" });
}

export interface PodWithContainersResponse {
  name: string;
  containers: string[];
  ready_containers?: number | null;
  total_containers?: number | null;
  phase?: string | null;
}

export function fetchPodsInNamespace(ns: string): Promise<PodWithContainersResponse[]> {
  const encoded = encodeURIComponent(ns);
  return request<PodWithContainersResponse[]>(`/namespaces/${encoded}/pods`);
}

export interface PodSummaryResponse {
  namespace: string;
  name: string;
  containers: string[];
  ready_containers?: number | null;
  total_containers?: number | null;
  node_name?: string | null;
  node_ip?: string | null;
  pod_ip?: string | null;
  phase?: string | null;
  restart_policy?: string | null;
  created_at?: string | null;
}

export function fetchPodsSummary(params: {
  namespace?: string;
  name?: string;
  phase?: string;
  restart_policy?: string;
}): Promise<PodSummaryResponse[]> {
  const qs = new URLSearchParams();
  if (params.namespace && params.namespace !== "all") qs.set("namespace", params.namespace);
  if (params.name) qs.set("name", params.name);
  if (params.phase) qs.set("phase", params.phase);
  if (params.restart_policy) qs.set("restart_policy", params.restart_policy);
  const s = qs.toString();
  return request<PodSummaryResponse[]>(`/pods/?${s}`);
}

export interface PodDetailResponse {
  namespace: string;
  name: string;
  containers: Array<{
    name: string;
    ready?: boolean | null;
    restart_count?: number | null;
    image?: string | null;
    state?: 'Running' | 'Waiting' | 'Terminated' | 'Unknown' | null;
    state_reason?: string | null;
    state_message?: string | null;
  }>;
  node_name?: string | null;
  node_ip?: string | null;
  pod_ip?: string | null;
  phase?: string | null;
  restart_policy?: string | null;
  created_at?: string | null;
}

export function fetchPodDetail(ns: string, name: string): Promise<PodDetailResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<PodDetailResponse>(`/pods/${en}/${nm}`);
}

// Delete a Pod. By default, do not specify gracePeriodSeconds.
// To force delete, pass gracePeriodSeconds = 0.
export function deletePod(
  ns: string,
  name: string,
  options?: { gracePeriodSeconds?: number | null }
): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  const params = new URLSearchParams();
  if (options && options.gracePeriodSeconds != null) {
    params.set("grace_period_seconds", String(options.gracePeriodSeconds));
  }
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : "";
  return request<OperationResultResponse>(`/pods/${en}/${nm}${suffix}`, { method: "DELETE" });
}

// Ephemeral debug containers
export interface CreateEphemeralContainerPayload {
  image: string;
  command?: string | null;
  target_container?: string | null;
  container_name?: string | null;
  tty?: boolean | null;
  stdin?: boolean | null;
}

export interface CreateEphemeralContainerResponse {
  ok: boolean;
  container?: string | null;
  message?: string | null;
}

export function createEphemeralContainer(
  ns: string,
  name: string,
  payload: CreateEphemeralContainerPayload
): Promise<CreateEphemeralContainerResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<CreateEphemeralContainerResponse>(`/pods/${en}/${nm}/debug`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function deleteEphemeralContainer(ns: string, name: string, container: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  const ec = encodeURIComponent(container);
  return request<OperationResultResponse>(`/pods/${en}/${nm}/debug/${ec}`, { method: "DELETE" });
}

// Services
export interface ServicePortResponse {
  name?: string | null;
  port?: number | null;
  target_port?: string | number | null;
  node_port?: number | null;
  protocol?: string | null;
}

export interface ServiceSummaryResponse {
  namespace: string;
  name: string;
  type?: string | null;
  cluster_ip?: string | null;
  ports: ServicePortResponse[];
  created_at?: string | null;
}

export function fetchServices(namespace?: string): Promise<ServiceSummaryResponse[]> {
  const params = new URLSearchParams();
  if (namespace && namespace !== "all") params.set("namespace", namespace);
  return request<ServiceSummaryResponse[]>(`/services/?${params.toString()}`);
}

export function fetchServiceYaml(ns: string, name: string): Promise<YamlContentResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<YamlContentResponse>(`/services/${en}/${nm}/yaml`);
}

export function updateServiceYaml(ns: string, name: string, yaml: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/services/${en}/${nm}/yaml`, { method: "PUT", body: JSON.stringify({ yaml }) });
}

export function deleteService(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/services/${en}/${nm}`, { method: "DELETE" });
}

export function createServiceFromYaml(yaml: string): Promise<OperationResultResponse> {
  return request<OperationResultResponse>(`/services/`, { method: "POST", body: JSON.stringify({ yaml }) });
}

// Deployment management & details
export function fetchDeploymentPods(ns: string, name: string): Promise<PodWithContainersResponse[]> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<PodWithContainersResponse[]>(`/workloads/deployments/${en}/${nm}/pods`);
}

export interface OperationResultResponse {
  ok: boolean;
  message?: string | null;
}

export function restartDeployment(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/deployments/${en}/${nm}/restart`, { method: "POST" });
}

export function scaleDeployment(ns: string, name: string, replicas: number): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/deployments/${en}/${nm}/scale`, {
    method: "POST",
    body: JSON.stringify({ replicas }),
  });
}

export function deleteDeployment(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/deployments/${en}/${nm}`, { method: "DELETE" });
}

// moved earlier

export function fetchDeploymentYaml(ns: string, name: string): Promise<YamlContentResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<YamlContentResponse>(`/workloads/deployments/${en}/${nm}/yaml`);
}

export function updateDeploymentYaml(ns: string, name: string, yaml: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/deployments/${en}/${nm}/yaml`, {
    method: "PUT",
    body: JSON.stringify({ yaml }),
  });
}

export interface DeploymentImageUpdatePayload { container: string; image: string }
export function updateDeploymentImage(ns: string, name: string, payload: DeploymentImageUpdatePayload): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/deployments/${en}/${nm}/image`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export interface DeploymentStrategyResponse { strategy_type: "RollingUpdate" | "Recreate"; max_unavailable?: string | number | null; max_surge?: string | number | null }
export function fetchDeploymentStrategy(ns: string, name: string): Promise<DeploymentStrategyResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<DeploymentStrategyResponse>(`/workloads/deployments/${en}/${nm}/strategy`);
}

export function updateDeploymentStrategy(ns: string, name: string, payload: DeploymentStrategyResponse): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/deployments/${en}/${nm}/strategy`, { method: "PUT", body: JSON.stringify(payload) });
}

export type HPATargetType = 'Utilization' | 'AverageValue' | 'Value';
export interface HPAMetricTargetResponse {
  type: HPATargetType;
  average_utilization?: number | null;
  average_value?: string | null;
  value?: string | null;
}

export interface HPAResourceMetricResponse { name: string; target: HPAMetricTargetResponse }
export interface HPAPodsMetricResponse { metric_name: string; target: HPAMetricTargetResponse }
export interface HPAExternalMetricResponse { metric_name: string; selector?: Record<string, string> | null; target: HPAMetricTargetResponse }
export type HPAMetricResponse =
  | { type: 'Resource'; resource: HPAResourceMetricResponse }
  | { type: 'Pods'; pods: HPAPodsMetricResponse }
  | { type: 'External'; external: HPAExternalMetricResponse };

export interface AutoscalingConfigResponse {
  enabled: boolean;
  min_replicas?: number | null;
  max_replicas?: number | null;
  target_cpu_utilization?: number | null; // legacy
  metrics?: HPAMetricResponse[];
}
export function fetchDeploymentAutoscaling(ns: string, name: string): Promise<AutoscalingConfigResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<AutoscalingConfigResponse>(`/workloads/deployments/${en}/${nm}/autoscaling`);
}

export function updateDeploymentAutoscaling(ns: string, name: string, payload: AutoscalingConfigResponse): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/deployments/${en}/${nm}/autoscaling`, { method: "PUT", body: JSON.stringify(payload) });
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

export interface NodeMetricPointResponse { ts: string; cpu_mcores: number; memory_bytes: number }
export interface NodeMetricSeriesResponse { has_metrics: boolean; node: string; points: NodeMetricPointResponse[] }

export function fetchNodeSeries(name: string, window: string): Promise<NodeMetricSeriesResponse> {
  const params = new URLSearchParams({ name, window });
  return request<NodeMetricSeriesResponse>(`/metrics/node?${params.toString()}`);
}

// StatefulSet management
export function fetchStatefulSetPods(ns: string, name: string): Promise<PodWithContainersResponse[]> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<PodWithContainersResponse[]>(`/workloads/statefulsets/${en}/${nm}/pods`);
}
export function scaleStatefulSet(ns: string, name: string, replicas: number): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/statefulsets/${en}/${nm}/scale`, { method: "POST", body: JSON.stringify({ replicas }) });
}
export function deleteStatefulSet(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/statefulsets/${en}/${nm}`, { method: "DELETE" });
}
export function fetchStatefulSetYaml(ns: string, name: string): Promise<YamlContentResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<YamlContentResponse>(`/workloads/statefulsets/${en}/${nm}/yaml`);
}
export function updateStatefulSetYaml(ns: string, name: string, yaml: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/statefulsets/${en}/${nm}/yaml`, { method: "PUT", body: JSON.stringify({ yaml }) });
}

// DaemonSet management
export function fetchDaemonSetPods(ns: string, name: string): Promise<PodWithContainersResponse[]> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<PodWithContainersResponse[]>(`/workloads/daemonsets/${en}/${nm}/pods`);
}
export function deleteDaemonSet(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/daemonsets/${en}/${nm}`, { method: "DELETE" });
}
export function fetchDaemonSetYaml(ns: string, name: string): Promise<YamlContentResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<YamlContentResponse>(`/workloads/daemonsets/${en}/${nm}/yaml`);
}
export function updateDaemonSetYaml(ns: string, name: string, yaml: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/daemonsets/${en}/${nm}/yaml`, { method: "PUT", body: JSON.stringify({ yaml }) });
}

// Job management
export function fetchJobPods(ns: string, name: string): Promise<PodWithContainersResponse[]> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<PodWithContainersResponse[]>(`/workloads/jobs/${en}/${nm}/pods`);
}
export function deleteJob(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/jobs/${en}/${nm}`, { method: "DELETE" });
}
export function fetchJobYaml(ns: string, name: string): Promise<YamlContentResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<YamlContentResponse>(`/workloads/jobs/${en}/${nm}/yaml`);
}
export function updateJobYaml(ns: string, name: string, yaml: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/jobs/${en}/${nm}/yaml`, { method: "PUT", body: JSON.stringify({ yaml }) });
}

// CronJob management
export function runCronJobNow(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/cronjobs/${en}/${nm}/run`, { method: "POST" });
}
export function deleteCronJob(ns: string, name: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/cronjobs/${en}/${nm}`, { method: "DELETE" });
}
export function fetchCronJobYaml(ns: string, name: string): Promise<YamlContentResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<YamlContentResponse>(`/workloads/cronjobs/${en}/${nm}/yaml`);
}
export function updateCronJobYaml(ns: string, name: string, yaml: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const nm = encodeURIComponent(name);
  return request<OperationResultResponse>(`/workloads/cronjobs/${en}/${nm}/yaml`, { method: "PUT", body: JSON.stringify({ yaml }) });
}
