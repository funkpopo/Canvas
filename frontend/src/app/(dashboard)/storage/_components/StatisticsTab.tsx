"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/shared/i18n/i18n";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { LineChart } from "@/shared/ui/line-chart";
import {
  fetchStorageStats,
  fetchStorageTrends,
  queryKeys,
} from "@/lib/api";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export function StatisticsTab() {
  const { t } = useI18n();
  const [trendDays, setTrendDays] = useState<number>(7);

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: queryKeys.storageStats,
    queryFn: () => fetchStorageStats(24),
  });

  const { data: trends, isLoading: trendsLoading } = useQuery({
    queryKey: queryKeys.storageTrends(undefined, trendDays),
    queryFn: () => fetchStorageTrends(undefined, trendDays),
  });

  const chartData = (trends?.data_points ?? []).map((point) => ({
    timestamp: new Date(point.timestamp).toLocaleDateString(),
    capacity_gb: point.capacity_bytes / (1024 ** 3),
    used_gb: point.used_bytes / (1024 ** 3),
  }));

  return (
    <div className="pt-2 space-y-4">
      {/* Overall Statistics Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("storage.stats.totalCapacity")}</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="text-text-muted">{t("common.loading")}</div>
            ) : (
              <>
                <div className="text-2xl font-bold text-text-primary">
                  {formatBytes(stats?.total_capacity_bytes ?? 0)}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {t("storage.stats.usedCapacity")}: {formatBytes(stats?.total_used_bytes ?? 0)}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t("storage.stats.usagePercent")}</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="text-text-muted">{t("common.loading")}</div>
            ) : (
              <>
                <div className="text-2xl font-bold text-text-primary">
                  {(stats?.overall_usage_percent ?? 0).toFixed(1)}%
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {t("common.total")} {stats?.by_class.length ?? 0} {t("storage.meta.sc")}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">PVCs</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="text-text-muted">{t("common.loading")}</div>
            ) : (
              <>
                <div className="text-2xl font-bold text-text-primary">
                  {stats?.by_class.reduce((sum, c) => sum + c.pvc_count, 0) ?? 0}
                </div>
                <div className="text-xs text-text-muted mt-1">
                  {t("storage.meta.pvc.desc")}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Storage by Class */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("storage.stats.byClass")}</CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="text-text-muted">{t("common.loading")}</div>
          ) : (
            <div className="overflow-auto border border-border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted text-text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">{t("storage.sc.name")}</th>
                    <th className="px-2 py-1 text-left">PVC {t("common.total")}</th>
                    <th className="px-2 py-1 text-left">{t("storage.stats.totalCapacity")}</th>
                    <th className="px-2 py-1 text-left">{t("storage.stats.usedCapacity")}</th>
                    <th className="px-2 py-1 text-left">{t("storage.stats.usagePercent")}</th>
                  </tr>
                </thead>
                <tbody>
                  {!stats?.by_class || stats.by_class.length === 0 ? (
                    <tr>
                      <td className="px-2 py-2 text-text-muted" colSpan={5}>
                        {t("storage.sc.empty")}
                      </td>
                    </tr>
                  ) : (
                    stats.by_class.map((cls) => (
                      <tr key={cls.storage_class} className="hover:bg-muted/50">
                        <td className="px-2 py-1 font-medium">{cls.storage_class}</td>
                        <td className="px-2 py-1">{cls.pvc_count}</td>
                        <td className="px-2 py-1">{formatBytes(cls.total_capacity_bytes)}</td>
                        <td className="px-2 py-1">{formatBytes(cls.used_capacity_bytes)}</td>
                        <td className="px-2 py-1">{cls.usage_percent.toFixed(1)}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Trends */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t("storage.stats.trends")}</CardTitle>
            <select
              value={trendDays}
              onChange={(e) => setTrendDays(Number(e.target.value))}
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
            >
              <option value={7}>7 {t("pods.filter.days")}</option>
              <option value={14}>14 {t("pods.filter.days")}</option>
              <option value={30}>30 {t("pods.filter.days")}</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {trendsLoading ? (
            <div className="text-text-muted">{t("common.loading")}</div>
          ) : chartData.length === 0 ? (
            <div className="text-text-muted py-4">{t("storage.stats.noData")}</div>
          ) : (
            <LineChart
              data={chartData}
              lines={[
                { key: "capacity_gb", label: "Capacity (GB)", color: "hsl(var(--primary))" },
                { key: "used_gb", label: "Used (GB)", color: "hsl(var(--chart-2))" },
              ]}
              xKey="timestamp"
              height={250}
            />
          )}
        </CardContent>
      </Card>

      {/* Top 5 PVCs */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("storage.stats.topPvcs")}</CardTitle>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="text-text-muted">{t("common.loading")}</div>
          ) : (
            <div className="overflow-auto border border-border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted text-text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left">{t("workloadTable.th.namespace")}</th>
                    <th className="px-2 py-1 text-left">{t("workloadTable.th.name")}</th>
                    <th className="px-2 py-1 text-left">StorageClass</th>
                    <th className="px-2 py-1 text-left">{t("storage.size")}</th>
                  </tr>
                </thead>
                <tbody>
                  {!stats?.top_pvcs || stats.top_pvcs.length === 0 ? (
                    <tr>
                      <td className="px-2 py-2 text-text-muted" colSpan={4}>
                        {t("storage.pvc.empty")}
                      </td>
                    </tr>
                  ) : (
                    stats.top_pvcs.map((pvc) => (
                      <tr key={`${pvc.namespace}/${pvc.name}`} className="hover:bg-muted/50">
                        <td className="px-2 py-1">{pvc.namespace}</td>
                        <td className="px-2 py-1 font-medium">{pvc.name}</td>
                        <td className="px-2 py-1">{pvc.storage_class ?? "-"}</td>
                        <td className="px-2 py-1">{pvc.capacity}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
