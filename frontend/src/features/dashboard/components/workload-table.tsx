import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { StatusBadge } from "@/shared/ui/status-badge";
import { queryKeys, fetchWorkloads } from "@/lib/api";
import { useI18n } from "@/shared/i18n/i18n";

export function WorkloadTable() {
  const { t } = useI18n();
  const { data: workloads, isLoading, isError } = useQuery({
    queryKey: queryKeys.workloads,
    queryFn: fetchWorkloads,
  });

  const limitedWorkloads = workloads?.slice(0, 8) || [];

  return (
    <Card className="relative overflow-hidden border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-lg text-text-primary">{t("workloadTable.title")}</CardTitle>
        <CardDescription>{t("workloadTable.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Button
          variant="outline"
          size="sm"
          className={`mb-4 ${badgePresets.label}`}
        >
          {t("workloadTable.viewAll")}
        </Button>
        <table className="w-full text-sm">
          <thead className={`${badgePresets.label} text-text-muted`}>
            <tr className="border-b border-border">
              <th className="px-4 py-3 text-left">{t("workloadTable.th.name")}</th>
              <th className="px-4 py-3 text-left">{t("workloadTable.th.namespace")}</th>
              <th className="px-4 py-3 text-left">{t("workloadTable.th.kind")}</th>
              <th className="px-4 py-3 text-left">{t("workloadTable.th.version")}</th>
              <th className="px-4 py-3 text-left">{t("workloadTable.th.status")}</th>
              <th className="px-4 py-3 text-left">{t("workloadTable.th.replicas")}</th>
              <th className="px-4 py-3 text-left">{t("workloadTable.th.updated")}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-muted">
                  {t("workloadTable.loading")}
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-muted">
                  {t("workloadTable.error")}
                </td>
              </tr>
            ) : limitedWorkloads.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-text-muted">
                  {t("workloadTable.empty")}
                </td>
              </tr>
            ) : (
              limitedWorkloads.map((workload) => (
                <tr key={`${workload.namespace}-${workload.name}`} className="border-b border-border/60 last:border-none">
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-text-primary">{workload.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-text-muted">{workload.namespace}</td>
                  <td className="whitespace-nowrap px-4 py-3">{workload.kind}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
                      {workload.version || t("workloadTable.na")}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <StatusBadge 
                      status={workload.status === "Healthy" ? "healthy" : "warning"} 
                      label={workload.status}
                      size="sm"
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge variant="outline" size="sm" className={badgePresets.metric}>
                      {workload.replicas_ready ?? 0} / {workload.replicas_desired ?? 0}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-xs text-text-muted">
                    {workload.updated_at ? new Date(workload.updated_at).toLocaleString() : t("workloadTable.na")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

