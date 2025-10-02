"use client";

import { useEffect, useMemo, useState } from "react";
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
  fetchStatefulSetPods,
  fetchStatefulSetYaml,
  updateStatefulSetYaml,
  scaleStatefulSet,
  deleteStatefulSet,
  queryKeys,
  type WorkloadSummaryResponse,
  type PodWithContainersResponse,
  type YamlContentResponse,
} from "@/lib/api";

export default function StatefulSetDetailPage() {
  const { t } = useI18n();
  const { confirm, ConfirmDialogComponent } = useConfirm();
  const params = useParams<{ namespace: string; name: string }>();
  const router = useRouter();
  const ns = decodeURIComponent(params.namespace);
  const name = decodeURIComponent(params.name);
  const qc = useQueryClient();

  const workloadsQuery = useQuery({ queryKey: queryKeys.workloads, queryFn: fetchWorkloads });
  const workloads = workloadsQuery.data;
  const stateful = useMemo(
    () => (workloads ?? []).find((w) => w.kind === "StatefulSet" && w.namespace === ns && w.name === name),
    [workloads, ns, name]
  );

  const { data: pods } = useQuery<PodWithContainersResponse[]>({ queryKey: ["statefulsetPods", ns, name], queryFn: () => fetchStatefulSetPods(ns, name) });

  const [replicasInput, setReplicasInput] = useState<number | "">(stateful?.replicas_desired ?? "");
  useEffect(() => { if (stateful?.replicas_desired != null) setReplicasInput(stateful.replicas_desired); }, [stateful?.replicas_desired]);
  const scaleMut = useMutation({
    mutationFn: (replicas: number) => scaleStatefulSet(ns, name, replicas),
    onSuccess: (_res, replicas) => {
      qc.setQueryData(queryKeys.workloads, (prev: WorkloadSummaryResponse[] | undefined) => Array.isArray(prev)
        ? prev.map((w) => (w.kind === "StatefulSet" && w.namespace === ns && w.name === name ? { ...w, replicas_desired: replicas } : w))
        : prev);
      setReplicasInput(replicas);
    },
  });

  const delMut = useMutation({
    mutationFn: () => deleteStatefulSet(ns, name),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.workloads }); alert(t("alert.deploy.deleted")); router.push("/workloads"); },
  });

  const { data: yamlContent } = useQuery<YamlContentResponse>({ queryKey: queryKeys.statefulsetYaml(ns, name), queryFn: () => fetchStatefulSetYaml(ns, name) });
  const [yamlOpen, setYamlOpen] = useState(false);
  const [yaml, setYaml] = useState<string>("");
  useEffect(() => setYaml(yamlContent?.yaml ?? ""), [yamlContent?.yaml]);
  const yamlMut = useMutation({ mutationFn: () => updateStatefulSetYaml(ns, name, yaml), onSuccess: () => alert(t("alert.yaml.applied")) });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("workloads.eyebrow")}
        title={`${name}`}
        description={t("deploy.header.desc", { ns })}
        actions={<div className="flex items-center gap-2"><Link className="underline text-text-muted" href="/workloads">{t("deploy.header.back")}</Link></div>}
        meta={stateful ? (
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("deploy.meta.replicas")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{stateful.replicas_ready ?? 0}/{stateful.replicas_desired ?? 0}</p>
              <p className="text-xs text-text-muted">{t("deploy.meta.readyDesired")}</p>
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
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted">{t("deploy.meta.replicas")}</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={scaleMut.isPending || (typeof replicasInput === "number" && replicasInput <= 0)}
              onClick={() => {
                const prev = typeof replicasInput === "number" ? replicasInput : 0;
                const next = Math.max(0, prev - 1);
                setReplicasInput(next);
                scaleMut.mutate(next, { onError: () => setReplicasInput(prev) });
              }}
            >-
            </Button>
            <Badge variant="neutral-light" size="sm" className={badgePresets.metric}>
              {replicasInput === "" ? 0 : replicasInput}
            </Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={scaleMut.isPending}
              onClick={() => {
                const prev = typeof replicasInput === "number" ? replicasInput : 0;
                const next = prev + 1;
                setReplicasInput(next);
                scaleMut.mutate(next, { onError: () => setReplicasInput(prev) });
              }}
            >+
            </Button>
          </div>

          <Button type="button" variant="destructive" onClick={async () => { 
            const confirmed = await confirm({ title: t("deploy.manage.deleteConfirm") });
            if (confirmed) delMut.mutate(); 
          }}>{t("deploy.manage.delete")}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-text-primary">{t("deploy.pods.title")}</CardTitle>
          <CardDescription>{t("deploy.pods.desc")}</CardDescription>
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
        description={t("deploy.header.desc", { ns })}
        initialYaml={yaml}
        validateKind="StatefulSet"
        onClose={() => setYamlOpen(false)}
        onSave={async (y) => { await updateStatefulSetYaml(ns, name, y); alert(t("alert.yaml.applied")); }}
      />
      <ConfirmDialogComponent />
    </div>
  );
}

