"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent } from "@/shared/ui/card";
import { useI18n } from "@/shared/i18n/i18n";
import { badgePresets } from "@/shared/ui/badge";
import { fetchCrds, queryKeys, type CRDSummaryResponse } from "@/lib/api";

export default function CrdsPage() {
  const { t } = useI18n();
  const { data, isLoading } = useQuery<CRDSummaryResponse[]>({ queryKey: queryKeys.crds, queryFn: fetchCrds });
  const items = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("crds.header")}
        title={t("crds.title")}
        description={t("crds.desc")}
        meta={
          <div>
            <p className={`${badgePresets.label} text-text-muted`}>{t("common.total")}</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{items.length}</p>
          </div>
        }
      />

      <Card>
        <CardContent className="space-y-4 py-4">
          <div className="overflow-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr className="text-left text-text-muted">
                  <th className="px-3 py-2">{t("crds.col.name")}</th>
                  <th className="px-3 py-2">{t("crds.col.group")}</th>
                  <th className="px-3 py-2">{t("crds.col.kind")}</th>
                  <th className="px-3 py-2">{t("crds.col.scope")}</th>
                  <th className="px-3 py-2">{t("crds.col.versions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={5}>{t("common.loading")}</td></tr>
                ) : items.length === 0 ? (
                  <tr><td className="px-3 py-4 text-text-muted" colSpan={5}>{t("crds.empty")}</td></tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.name} className="border-t border-border hover:bg-hover">
                      <td className="px-3 py-2">
                        <Link className="underline" href={`/crds/${encodeURIComponent(it.name)}`}>{it.name}</Link>
                      </td>
                      <td className="px-3 py-2">{it.group}</td>
                      <td className="px-3 py-2">{it.kind} ({it.plural})</td>
                      <td className="px-3 py-2">{it.scope}</td>
                      <td className="px-3 py-2">{(it.versions ?? []).join(", ")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

