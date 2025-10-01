"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAuditLogs, queryKeys, type AuditLogEntryResponse } from "@/lib/api";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent } from "@/shared/ui/card";
import { badgePresets } from "@/shared/ui/badge";
import { useI18n } from "@/shared/i18n/i18n";
import { EmptyState } from "@/shared/ui/empty-state";

export default function AuditPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery<AuditLogEntryResponse[]>({ queryKey: queryKeys.auditLogs, queryFn: () => fetchAuditLogs(200) });
  const items = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("audit.eyebrow")}
        title={t("audit.title")}
        description={t("audit.desc")}
        meta={
          <div>
            <p className={`${badgePresets.label} text-text-muted`}>{t("common.total")}</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{items.length}</p>
          </div>
        }
      />

      <Card>
        <CardContent className="overflow-auto p-0">
          {isLoading ? (
            <EmptyState title={t("common.loading")} />
          ) : items.length === 0 ? (
            <EmptyState title={t("audit.empty")} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="text-left text-text-muted">
                  <th className="px-3 py-2">{t("audit.col.time")}</th>
                  <th className="px-3 py-2">{t("audit.col.action")}</th>
                  <th className="px-3 py-2">{t("audit.col.resource")}</th>
                  <th className="px-3 py-2">{t("audit.col.ns")}</th>
                  <th className="px-3 py-2">{t("audit.col.name")}</th>
                  <th className="px-3 py-2">{t("audit.col.user")}</th>
                  <th className="px-3 py-2">{t("audit.col.success")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-border hover:bg-hover">
                    <td className="px-3 py-2">{new Date(it.ts).toLocaleString()}</td>
                    <td className="px-3 py-2">{it.action}</td>
                    <td className="px-3 py-2">{it.resource}</td>
                    <td className="px-3 py-2">{it.namespace || "-"}</td>
                    <td className="px-3 py-2">{it.name || "-"}</td>
                    <td className="px-3 py-2">{it.username || "-"}</td>
                    <td className="px-3 py-2">{it.success ? t("status.ready") : t("status.failed")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

