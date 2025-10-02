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
  fetchJobPods,
  fetchJobYaml,
  updateJobYaml,
  deleteJob,
  queryKeys,
  type WorkloadSummaryResponse,
  type PodWithContainersResponse,
  type YamlContentResponse,
} from "@/lib/api";
import { useMemo, useState, useEffect } from "react";

export default function JobDetailPage() {
  const { t } = useI18n();
  const { confirm, ConfirmDialogComponent } = useConfirm();
  const params = useParams<{ namespace: string; name: string }>();
  const router = useRouter();
  const ns = decodeURIComponent(params.namespace);
  const name = decodeURIComponent(params.name);
  const qc = useQueryClient();

  const workloadsQuery = useQuery({ queryKey: queryKeys.workloads, queryFn: fetchWorkloads });
  const workloads = workloadsQuery.data;
  const job: WorkloadSummaryResponse | undefined = useMemo(
    () => (workloads ?? []).find((w) => w.kind === "Job" && w.namespace === ns && w.name === name),
    [workloads, ns, name]
  );

  const { data: pods } = useQuery<PodWithContainersResponse[]>({ queryKey: ["jobPods", ns, name], queryFn: () => fetchJobPods(ns, name) });

  const delMut = useMutation({
    mutationFn: () => deleteJob(ns, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.workloads }); router.push("/workloads"); },
  });

  const { data: yamlContent } = useQuery<YamlContentResponse>({ queryKey: queryKeys.jobYaml(ns, name), queryFn: () => fetchJobYaml(ns, name) });
  const [yamlOpen, setYamlOpen] = useState(false);
  const [yaml, setYaml] = useState<string>("");
  useEffect(() => setYaml(yamlContent?.yaml ?? ""), [yamlContent?.yaml]);
  const yamlMut = useMutation({ mutationFn: () => updateJobYaml(ns, name, yaml), onSuccess: () => alert(t("alert.yaml.applied")) });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("job.header.eyebrow")}
        title={`${name}`}
        description={t("job.header.desc", { ns })}
        actions={<div className="flex items-center gap-2"><Link className="underline text-text-muted" href="/workloads">{t("deploy.header.back")}</Link></div>}
        meta={job ? (
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("deploy.meta.status")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{job.status}</p>
              <p className="text-xs text-text-muted">{t("deploy.meta.health")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("pods.col.created")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{job.updated_at ? new Date(job.updated_at).toLocaleString() : t("common.never")}</p>
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
          <Button type="button" variant="destructive" onClick={async () => { 
            const confirmed = await confirm({ title: t("job.manage.deleteConfirm") });
            if (confirmed) delMut.mutate(); 
          }}>{t("deploy.manage.delete")}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-text-primary">{t("deploy.pods.title")}</CardTitle>
          <CardDescription>{t("job.pods.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!pods || pods.length === 0 ? (
            <div className="text-sm text-text-muted py-4">{t("deploy.pods.none")}</div>
          ) : (
            <div className="overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr className="text-left text-text-muted">
                    <th className="px-3 py-2">Pod</th>
                    <th className="px-3 py-2">Containers</th>
                    <th className="px-3 py-2">Ready</th>
                    <th className="px-3 py-2">Phase</th>
                  </tr>
                </thead>
                <tbody>
                  {pods.map((p) => (
                    <tr key={p.name} className="border-t border-border">
                      <td className="px-3 py-2">{p.name}</td>
                      <td className="px-3 py-2">{p.containers.join(", ")}</td>
                      <td className="px-3 py-2">{(p.ready_containers ?? 0)}/{(p.total_containers ?? p.containers.length)}</td>
                      <td className="px-3 py-2">{p.phase || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <YamlEditor
        open={yamlOpen}
        title={t("deploy.yaml.title")}
        description={t("job.header.desc", { ns })}
        initialYaml={yaml}
        validateKind="Job"
        onClose={() => setYamlOpen(false)}
        onSave={async (y) => { await updateJobYaml(ns, name, y); alert(t("alert.yaml.applied")); }}
      />
      <ConfirmDialogComponent />
    </div>
  );
}

