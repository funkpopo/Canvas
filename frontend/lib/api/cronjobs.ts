import { apiClient, type ApiResponse } from "./client";

// ===== CronJob 相关类型定义 =====
export interface CronJob {
  name: string;
  namespace: string;
  schedule: string;
  suspend: boolean;
  active: number;
  last_schedule_time: string | null;
  age: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

// ===== CronJob API =====
export const cronjobApi = {
  async getCronJobs(clusterId: number, namespace: string): Promise<ApiResponse<CronJob[]>> {
    return apiClient.get<CronJob[]>(`/cronjobs/clusters/${clusterId}/namespaces/${namespace}/cronjobs`);
  },

  async getCronJob(clusterId: number, namespace: string, cronjobName: string): Promise<ApiResponse<CronJob>> {
    return apiClient.get<CronJob>(`/cronjobs/clusters/${clusterId}/namespaces/${namespace}/cronjobs/${cronjobName}`);
  },

  async deleteCronJob(clusterId: number, namespace: string, cronjobName: string): Promise<ApiResponse<null>> {
    return apiClient.delete<null>(`/cronjobs/clusters/${clusterId}/namespaces/${namespace}/cronjobs/${cronjobName}`);
  },
};


