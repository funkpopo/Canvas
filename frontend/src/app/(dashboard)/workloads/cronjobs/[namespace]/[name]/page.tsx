"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { YamlEditor } from "@/shared/ui/yaml-editor";
import { useI18n } from "@/shared/i18n/i18n";
import { useConfirm } from "@/hooks/useConfirm";
import {
  fetchWorkloads,
  fetchCronJobYaml,
  updateCronJobYaml,
  runCronJobNow,
  deleteCronJob,
  queryKeys,
  type WorkloadSummaryResponse,
  type YamlContentResponse,
} from "@/lib/api";
import { useMemo, useState, useEffect } from "react";

export default function CronJobDetailPage() {
  const { t } = useI18n();
  const { confirm, ConfirmDialogComponent } = useConfirm();
  const params = useParams<{ namespace: string; name: string }>();
  const router = useRouter();
  const ns = decodeURIComponent(params.namespace);
  const name = decodeURIComponent(params.name);
  const qc = useQueryClient();

  const workloadsQuery = useQuery({ queryKey: queryKeys.workloads, queryFn: fetchWorkloads });
  const workloads = workloadsQuery.data;
  const cron: WorkloadSummaryResponse | undefined = useMemo(
    () => (workloads ?? []).find((w) => w.kind === "CronJob" && w.namespace === ns && w.name === name),
    [workloads, ns, name]
  );

  const runMut = useMutation({
    mutationFn: () => runCronJobNow(ns, name),
    onSuccess: () => {
      alert(t("alert.yaml.applied"));
      qc.invalidateQueries({ queryKey: queryKeys.workloads });
    },
  });

  const delMut = useMutation({
    mutationFn: () => deleteCronJob(ns, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.workloads }); router.push("/workloads"); },
  });

  const { data: yamlContent } = useQuery<YamlContentResponse>({ queryKey: queryKeys.cronjobYaml(ns, name), queryFn: () => fetchCronJobYaml(ns, name) });
  const [yamlOpen, setYamlOpen] = useState(false);
  const [yaml, setYaml] = useState<string>("");
  useEffect(() => setYaml(yamlContent?.yaml ?? ""), [yamlContent?.yaml]);
  const yamlMut = useMutation({ mutationFn: () => updateCronJobYaml(ns, name, yaml), onSuccess: () => alert(t("alert.yaml.applied")) });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("cron.header.eyebrow")}
        title={`${name}`}
        description={t("cron.header.desc", { ns })}
        actions={<div className="flex items-center gap-2"><Link className="underline text-text-muted" href="/workloads">{t("deploy.header.back")}</Link></div>}
        meta={cron ? (
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("deploy.meta.status")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{cron.status}</p>
              <p className="text-xs text-text-muted">{t("deploy.meta.health")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("workloads.field.lastRun")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{cron.updated_at ? new Date(cron.updated_at).toLocaleString() : t("common.never")}</p>
              <p className="text-xs text-text-muted">{t("pods.col.created")}</p>
            </div>
          </>
        ) : null}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-text-primary">{t("deploy.manage.title")}</CardTitle>
          <CardDescription>{t("deploy.manage.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => setYamlOpen(true)}>{t("deploy.yaml.edit")}</Button>
          <Button type="button" variant="default" disabled={runMut.isPending} onClick={() => runMut.mutate()}>{t("cron.manage.runNow")}</Button>
          <Button type="button" variant="destructive" onClick={async () => { 
            const confirmed = await confirm({ title: t("cron.manage.deleteConfirm") });
            if (confirmed) delMut.mutate(); 
          }}>{t("deploy.manage.delete")}</Button>
        </CardContent>
      </Card>

      <YamlEditor
        open={yamlOpen}
        title={t("deploy.yaml.title")}
        description={t("cron.header.desc", { ns })}
        initialYaml={yaml}
        validateKind="CronJob"
        onClose={() => setYamlOpen(false)}
        onSave={async (y) => { await updateCronJobYaml(ns, name, y); alert(t("alert.yaml.applied")); }}
      />
      <ConfirmDialogComponent />
    </div>
  );
}

