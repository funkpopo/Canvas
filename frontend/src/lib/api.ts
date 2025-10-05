const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api/v1";

export const queryKeys = {
  clusterOverview: ["cluster", "overview"] as const,
  workloads: ["cluster", "workloads"] as const,
  events: ["cluster", "events"] as const,
  clusterConfig: ["cluster", "config"] as const,
  clusterConfigsAll: ["cluster", "configs", "all"] as const,
  clusterHealth: (name: string) => ["cluster", "health", name] as const,
  metricsStatus: ["metrics", "status"] as const,
  clusterCapacity: ["cluster", "capacity"] as const,
  clusterStorage: ["cluster", "storage"] as const,
  storageClasses: ["storage", "classes"] as const,
  pvcs: (ns?: string) => ["storage", "pvcs", ns ?? "all"] as const,
  volumeList: (ns: string, pvc: string, path: string) => ["storage", "browser", ns, pvc, path] as const,
  pvDetail: (name: string) => ["storage", "pv", name] as const,
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
  auditLogs: ["audit", "logs"] as const,
  crds: ["crds", "list"] as const,
  crdResources: (crd: string, ns?: string) => ["crds", crd, ns ?? "all"] as const,
  alerts: ["alerts", "list"] as const,
  alertTrends: (window: string) => ["alerts", "trends", window] as const,
  users: ["auth", "users"] as const,
  roles: ["auth", "roles"] as const,
  apiKeys: (userId?: number) => ["auth", "apikeys", userId ?? "me"] as const,
  sessions: ["auth", "sessions"] as const,
  rbacSummary: (ns?: string) => ["rbac", "summary", ns ?? "all"] as const,
  alertRules: ["alerts", "rules"] as const,
} as const;

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("canvas.access_token");
  } catch {
    return null;
  }
}

async function tryRefresh(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const rt = localStorage.getItem("canvas.refresh_token");
  if (!rt) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as TokenPairResponse;
    localStorage.setItem("canvas.access_token", data.access_token);
    localStorage.setItem("canvas.refresh_token", data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = getAccessToken();
  let response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      const refreshed = await tryRefresh();
      if (refreshed) {
        const retryAuth = getAccessToken();
        response = await fetch(`${API_BASE_URL}${path}`, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...(retryAuth ? { Authorization: `Bearer ${retryAuth}` } : {}),
            ...(init?.headers ?? {}),
          },
        });
      }
      if (!response.ok) {
        try {
          localStorage.removeItem("canvas.access_token");
          localStorage.removeItem("canvas.refresh_token");
        } catch {}
        if (!window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
      }
    }
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

export interface ClusterHealthResponse {
  name: string;
  reachable: boolean;
  message: string | null;
  kubernetes_version: string | null;
  node_count: number | null;
  ready_nodes: number | null;
}

export function fetchClusterOverview(): Promise<ClusterOverviewResponse> {
  return request<ClusterOverviewResponse>("/cluster/overview");
}

// --- Auth ---
export interface TokenPairResponse { access_token: string; refresh_token: string; token_type: "bearer"; expires_in: number }
export interface LoginRequest { username: string; password: string }
export function loginApi(body: LoginRequest): Promise<TokenPairResponse> {
  return request<TokenPairResponse>("/auth/login", { method: "POST", body: JSON.stringify(body) });
}
export interface MeResponse { id: number; username: string; display_name?: string | null; email?: string | null; roles: string[]; tenant_id?: number | null; created_at: string; updated_at: string; last_login_at?: string | null }
export function fetchMe(): Promise<MeResponse> {
  return request<MeResponse>("/auth/me");
}

export interface RegisterRequest { username: string; password: string; display_name?: string | null; email?: string | null; tenant_slug?: string | null }
export interface UserInfoResponse extends MeResponse { is_active: boolean }
export function registerApi(body: RegisterRequest): Promise<UserInfoResponse> {
  return request<UserInfoResponse>("/auth/register", { method: "POST", body: JSON.stringify(body) });
}

export function fetchUsers(): Promise<UserInfoResponse[]> {
  return request<UserInfoResponse[]>("/auth/users");
}

export interface RoleInfoResponse { id: number; name: string }
export function fetchRoles(): Promise<RoleInfoResponse[]> {
  return request<RoleInfoResponse[]>("/auth/roles");
}

export interface UpdateUserRequest { is_active?: boolean | null; roles?: string[] | null }
export function updateUser(userId: number, body: UpdateUserRequest): Promise<UserInfoResponse> {
  return request<UserInfoResponse>(`/auth/users/${userId}`, { method: "PATCH", body: JSON.stringify(body) });
}

// Sessions
export interface SessionInfoResponse { id: number; jti: string; created_at: string; expires_at: string; revoked: boolean }
export function fetchSessions(): Promise<SessionInfoResponse[]> {
  return request<SessionInfoResponse[]>("/auth/sessions");
}
export function revokeSession(sessionId: number): Promise<{ status: string }> {
  return request<{ status: string }>(`/auth/sessions/${sessionId}`, { method: "DELETE" });
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

export function deleteClusterConfig(name: string): Promise<void> {
  const nm = encodeURIComponent(name);
  return request<void>(`/cluster/config/${nm}`, { method: "DELETE" });
}

export function selectActiveClusterByName(name: string): Promise<ClusterConfigResponse> {
  return request<ClusterConfigResponse>("/cluster/config/select", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function fetchClusterHealth(name: string): Promise<ClusterHealthResponse> {
  const params = new URLSearchParams({ name });
  return request<ClusterHealthResponse>(`/cluster/config/health?${params.toString()}`);
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

// --- AuthZ / RBAC ---
export type AuthzCheck = { verb: string; resource: string; namespace?: string | null; group?: string | null; subresource?: string | null };
export function checkAuthzMatrix(checks: AuthzCheck[]): Promise<boolean[]> {
  return request<boolean[]>(`/authz/check`, { method: "POST", body: JSON.stringify({ checks }) });
}

// --- Audit Logs ---
export interface AuditLogEntryResponse {
  id: number;
  ts: string;
  action: string;
  resource: string;
  namespace: string | null;
  name: string | null;
  username: string | null;
  success: boolean;
  details: Record<string, unknown> | null;
}

export function fetchAuditLogs(limit = 200): Promise<AuditLogEntryResponse[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<AuditLogEntryResponse[]>(`/audit/logs?${params.toString()}`);
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

// Alerts
export interface AlertEntryResponse {
  received_at: string;
  status: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  starts_at?: string | null;
  ends_at?: string | null;
  generator_url?: string | null;
  fingerprint?: string | null;
  acked?: boolean | null;
  silenced_until?: string | null;
}
export function fetchAlerts(limit = 100): Promise<AlertEntryResponse[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  return request<AlertEntryResponse[]>(`/alerts/?${params.toString()}`);
}
export interface TrendPoint { ts: string; firing: number; resolved: number }
export function fetchAlertTrends(window: string): Promise<TrendPoint[]> {
  const params = new URLSearchParams({ window });
  return request<TrendPoint[]>(`/alerts/trends?${params.toString()}`);
}
export function ackAlert(fingerprint: string): Promise<{ status: string }> {
  const fp = encodeURIComponent(fingerprint);
  return request<{ status: string }>(`/alerts/${fp}/ack`, { method: "POST" });
}
export function silenceAlert(fingerprint: string, minutes: number): Promise<{ status: string }> {
  const fp = encodeURIComponent(fingerprint);
  return request<{ status: string }>(`/alerts/${fp}/silence`, { method: "POST", body: JSON.stringify({ minutes }) });
}

// Alert Rule Templates
export interface AlertRuleTemplateIn { name: string; severity: string; expr: string; summary?: string | null; description?: string | null; labels?: Record<string, string> | null; annotations?: Record<string, string> | null; enabled: boolean }
export interface AlertRuleTemplateOut extends AlertRuleTemplateIn { id: number; created_at: string; updated_at: string }
export function fetchAlertRules(): Promise<AlertRuleTemplateOut[]> {
  return request<AlertRuleTemplateOut[]>("/alert-rules/");
}
export function createAlertRule(body: AlertRuleTemplateIn): Promise<AlertRuleTemplateOut> {
  return request<AlertRuleTemplateOut>("/alert-rules/", { method: "POST", body: JSON.stringify(body) });
}
export function updateAlertRule(id: number, body: AlertRuleTemplateIn): Promise<AlertRuleTemplateOut> {
  return request<AlertRuleTemplateOut>(`/alert-rules/${id}`, { method: "PUT", body: JSON.stringify(body) });
}
export function deleteAlertRule(id: number): Promise<{ status: string }> {
  return request<{ status: string }>(`/alert-rules/${id}`, { method: "DELETE" });
}

// API Keys
export interface ApiKeyInfoResponse { id: number; name: string; created_at: string; last_used_at?: string | null; expires_at?: string | null; is_active: boolean }
export interface ApiKeyCreatedResponse { id: number; key: string; name: string; created_at: string }
export function fetchApiKeys(userId?: number): Promise<ApiKeyInfoResponse[]> {
  const params = new URLSearchParams();
  if (userId != null) params.set("user_id", String(userId));
  const qs = params.toString();
  return request<ApiKeyInfoResponse[]>(`/auth/apikeys${qs ? `?${qs}` : ""}`);
}
export function createApiKey(name: string, scopes: string[] = [], expiresDays?: number): Promise<ApiKeyCreatedResponse> {
  return request<ApiKeyCreatedResponse>("/auth/apikeys", { method: "POST", body: JSON.stringify({ name, scopes, expires_days: expiresDays ?? null }) });
}
export function revokeApiKey(id: number): Promise<{ status: string }> {
  return request<{ status: string }>(`/auth/apikeys/${id}`, { method: "DELETE" });
}

// RBAC
export interface SubjectEntryResponse { kind: string; name: string; namespace?: string | null }
export interface RoleEntryResponse { namespace?: string | null; name: string; rules?: number | null }
export interface RoleBindingEntryResponse { namespace?: string | null; name: string; role_kind: string; role_name: string; subjects: SubjectEntryResponse[] }
export interface ClusterRoleEntryResponse { name: string; rules?: number | null }
export interface ClusterRoleBindingEntryResponse { name: string; role_name: string; subjects: SubjectEntryResponse[] }
export interface RbacSummaryResponse { roles: RoleEntryResponse[]; role_bindings: RoleBindingEntryResponse[]; cluster_roles: ClusterRoleEntryResponse[]; cluster_role_bindings: ClusterRoleBindingEntryResponse[] }
export function fetchRbacSummary(namespace?: string): Promise<RbacSummaryResponse> {
  const params = new URLSearchParams();
  if (namespace && namespace !== "all") params.set("namespace", namespace);
  const qs = params.toString();
  return request<RbacSummaryResponse>(`/rbac/summary${qs ? `?${qs}` : ""}`);
}

// CRDs & generic resources
export interface CRDSummaryResponse {
  name: string; // e.g., foos.example.com
  group: string;
  versions: string[];
  scope: "Namespaced" | "Cluster";
  kind: string;
  plural: string;
}

export interface GenericResourceEntryResponse { namespace?: string | null; name: string; created_at?: string | null }

export function fetchCrds(): Promise<CRDSummaryResponse[]> {
  return request<CRDSummaryResponse[]>("/crds/");
}

export function fetchCrdResources(crd: string, namespace?: string): Promise<GenericResourceEntryResponse[]> {
  const params = new URLSearchParams();
  if (namespace && namespace !== "all") params.set("namespace", namespace);
  const nm = encodeURIComponent(crd);
  const qs = params.toString();
  return request<GenericResourceEntryResponse[]>(`/crds/${nm}/resources${qs ? `?${qs}` : ""}`);
}

export function fetchGenericYaml(group: string, version: string, plural: string, name: string, namespace?: string): Promise<YamlContentResponse> {
  const g = encodeURIComponent(group);
  const v = encodeURIComponent(version);
  const p = encodeURIComponent(plural);
  const n = encodeURIComponent(name);
  const params = new URLSearchParams();
  if (namespace) params.set("namespace", namespace);
  const qs = params.toString();
  return request<YamlContentResponse>(`/resources/${g}/${v}/${p}/${n}${qs ? `?${qs}` : ""}`);
}

export function updateGenericYaml(group: string, version: string, plural: string, name: string, yaml: string, namespace?: string): Promise<OperationResultResponse> {
  const g = encodeURIComponent(group);
  const v = encodeURIComponent(version);
  const p = encodeURIComponent(plural);
  const n = encodeURIComponent(name);
  const params = new URLSearchParams();
  if (namespace) params.set("namespace", namespace);
  const qs = params.toString();
  return request<OperationResultResponse>(`/resources/${g}/${v}/${p}/${n}${qs ? `?${qs}` : ""}`, { method: "PUT", body: JSON.stringify({ yaml }) });
}

export function deleteGenericResource(group: string, version: string, plural: string, name: string, namespace?: string): Promise<OperationResultResponse> {
  const g = encodeURIComponent(group);
  const v = encodeURIComponent(version);
  const p = encodeURIComponent(plural);
  const n = encodeURIComponent(name);
  const params = new URLSearchParams();
  if (namespace) params.set("namespace", namespace);
  const qs = params.toString();
  return request<OperationResultResponse>(`/resources/${g}/${v}/${p}/${n}${qs ? `?${qs}` : ""}`, { method: "DELETE" });
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
  owner?: string | null;
  group?: string | null;
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

export function createVolumeDir(ns: string, pvc: string, path: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const pv = encodeURIComponent(pvc);
  const params = new URLSearchParams({ path });
  return request<OperationResultResponse>(`/storage/browser/${en}/${pv}/mkdir?${params.toString()}`, { method: "POST" });
}

export function deleteVolumePath(ns: string, pvc: string, path: string, recursive: boolean = true): Promise<OperationResultResponse> {
  const en = encodeURIComponent(ns);
  const pv = encodeURIComponent(pvc);
  const params = new URLSearchParams({ path, recursive: String(Boolean(recursive)) });
  return request<OperationResultResponse>(`/storage/browser/${en}/${pv}/delete?${params.toString()}`, { method: "DELETE" });
}

export function downloadVolumeZip(ns: string, pvc: string, paths: string[]): string {
  const en = encodeURIComponent(ns);
  const pv = encodeURIComponent(pvc);
  const params = new URLSearchParams();
  for (const p of paths) params.append("paths", p);
  return `${API_BASE_URL}/storage/browser/${en}/${pv}/download-zip?${params.toString()}`;
}

export interface PersistentVolumeDetailResponse {
  name: string;
  capacity?: string | null;
  access_modes: string[];
  reclaim_policy?: string | null;
  storage_class?: string | null;
  status?: string | null;
  claim_ref?: string | null;
  created_at?: string | null;
}

export function fetchPvDetail(name: string): Promise<PersistentVolumeDetailResponse | null> {
  const nm = encodeURIComponent(name);
  return request<PersistentVolumeDetailResponse | null>(`/storage/pv/${nm}`);
}

export function expandPvc(namespace: string, name: string, newSize: string): Promise<OperationResultResponse> {
  const en = encodeURIComponent(namespace);
  const nm = encodeURIComponent(name);
  const params = new URLSearchParams({ new_size: newSize });
  return request<OperationResultResponse>(`/storage/pvcs/${en}/${nm}/expand?${params.toString()}`, { method: "POST" });
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
