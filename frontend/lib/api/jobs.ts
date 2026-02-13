import { apiClient, type ApiResponse } from "./client";

// ===== Jobs 相关类型定义 =====
export interface Job {
  name: string;
  namespace: string;
  completions: number;
  succeeded: number;
  failed: number;
  active: number;
  age: string;
  status: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

export interface JobDetails {
  name: string;
  namespace: string;
  completions: number;
  parallelism: number;
  backoff_limit: number;
  succeeded: number;
  failed: number;
  active: number;
  age: string;
  creation_timestamp: string;
  status: string;
  conditions: Array<{
    type: string;
    status: string;
    last_transition_time: string;
    reason: string;
    message: string;
  }>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  spec: any;
  status_detail: any;
  cluster_id: number;
  cluster_name: string;
}

export interface JobPod {
  name: string;
  namespace: string;
  status: string;
  node_name: string | null;
  age: string;
  restarts: number;
  ready_containers: string;
  labels: Record<string, string>;
}

export interface JobTemplate {
  id: number;
  name: string;
  description?: string;
  category?: string;
  is_public: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface JobHistory {
  id: number;
  cluster_id: number;
  namespace: string;
  job_name: string;
  template_id?: number;
  status: string;
  start_time?: string;
  end_time?: string;
  duration?: number;
  succeeded_pods: number;
  failed_pods: number;
  total_pods: number;
  error_message?: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

// ===== Jobs 相关 API =====
export const jobApi = {
  // Job 管理
  async getJobs(clusterId: number, namespace?: string): Promise<ApiResponse<Job[]>> {
    const ns = namespace?.trim() || "all";
    return apiClient.get<Job[]>(`/jobs/${clusterId}/namespaces/${ns}/jobs`);
  },

  async getJob(clusterId: number, namespace: string, jobName: string): Promise<ApiResponse<JobDetails>> {
    return apiClient.get<JobDetails>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}`);
  },

  async createJob(
    clusterId: number,
    namespace: string,
    yamlContent: string,
    templateId?: number
  ): Promise<ApiResponse<any>> {
    const params = templateId ? `?template_id=${templateId}` : "";
    return apiClient.post<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs${params}`, { yaml_content: yamlContent });
  },

  async deleteJob(clusterId: number, namespace: string, jobName: string): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}`);
  },

  async restartJob(clusterId: number, namespace: string, jobName: string): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}/restart`, {});
  },

  async getJobPods(clusterId: number, namespace: string, jobName: string): Promise<ApiResponse<JobPod[]>> {
    return apiClient.get<JobPod[]>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}/pods`);
  },

  async getJobYaml(clusterId: number, namespace: string, jobName: string): Promise<ApiResponse<{ yaml_content: string }>> {
    return apiClient.get<{ yaml_content: string }>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}/yaml`);
  },

  async updateJobYaml(
    clusterId: number,
    namespace: string,
    jobName: string,
    yamlContent: string
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/${jobName}/yaml`, { yaml_content: yamlContent });
  },

  // Job 模板管理
  async getJobTemplates(category?: string): Promise<ApiResponse<JobTemplate[]>> {
    const params = category ? `?category=${category}` : "";
    return apiClient.get<JobTemplate[]>(`/jobs/templates${params}`);
  },

  async createJobTemplate(template: {
    name: string;
    description?: string;
    category?: string;
    yaml_content: string;
    is_public?: boolean;
  }): Promise<ApiResponse<any>> {
    return apiClient.post<any>("/jobs/templates", template);
  },

  async getJobTemplate(templateId: number): Promise<ApiResponse<any>> {
    return apiClient.get<any>(`/jobs/templates/${templateId}`);
  },

  async updateJobTemplate(
    templateId: number,
    updates: Partial<{
      name: string;
      description: string;
      category: string;
      yaml_content: string;
      is_public: boolean;
    }>
  ): Promise<ApiResponse<any>> {
    return apiClient.put<any>(`/jobs/templates/${templateId}`, updates);
  },

  async deleteJobTemplate(templateId: number): Promise<ApiResponse<any>> {
    return apiClient.delete<any>(`/jobs/templates/${templateId}`);
  },

  // Job 历史记录
  async getJobHistory(
    clusterId?: number,
    namespace?: string,
    status?: string,
    startDate?: string,
    endDate?: string,
    limit?: number
  ): Promise<ApiResponse<JobHistory[]>> {
    const params = new URLSearchParams();
    if (clusterId) params.append("cluster_id", clusterId.toString());
    if (namespace) params.append("namespace", namespace);
    if (status) params.append("status", status);
    if (startDate) params.append("start_date", startDate);
    if (endDate) params.append("end_date", endDate);
    if (limit) params.append("limit", limit.toString());

    const query = params.toString() ? `?${params.toString()}` : "";
    return apiClient.get<JobHistory[]>(`/jobs/history${query}`);
  },

  async updateJobHistoryStatus(
    historyId: number,
    status: string,
    options?: {
      succeeded_pods?: number;
      failed_pods?: number;
      error_message?: string;
    }
  ): Promise<ApiResponse<any>> {
    const body: any = { status };
    if (options) {
      Object.assign(body, options);
    }
    return apiClient.post<any>(`/jobs/history/${historyId}/status`, body);
  },

  // 批量操作
  async bulkDeleteJobs(clusterId: number, namespace: string, jobNames: string[]): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/bulk-delete`, { job_names: jobNames });
  },

  async getJobsStatusOverview(clusterId: number, namespace: string): Promise<ApiResponse<any>> {
    return apiClient.get<any>(`/jobs/${clusterId}/namespaces/${namespace}/jobs/status`);
  },

  // Job 状态监控
  async monitorJobStatus(historyId: number): Promise<ApiResponse<any>> {
    return apiClient.post<any>(`/jobs/monitor/${historyId}`, {});
  },
};


