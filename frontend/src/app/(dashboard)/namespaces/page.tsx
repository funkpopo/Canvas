"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Modal } from "@/shared/ui/modal";
import { createNamespace, deleteNamespaceByName, fetchNamespaces, queryKeys, type OperationResultResponse } from "@/lib/api";
import { useI18n } from "@/shared/i18n/i18n";

export default function NamespacesPage() {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: namespaces, isLoading, isError } = useQuery({
    queryKey: queryKeys.namespaces,
    queryFn: fetchNamespaces,
  });
  const totalNamespaces = namespaces?.length ?? 0;
  const systemNamespaces = (namespaces ?? []).filter(
    (ns) => ns.name === "kube-system" || ns.name === "kube-public" || ns.name === "kube-node-lease" || ns.name.startsWith("kube-")
  ).length;

  // Create namespace modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newNsName, setNewNsName] = useState("");
  const createMut = useMutation({
    mutationFn: () => createNamespace({ name: newNsName.trim() }),
    onSuccess: () => {
      setIsCreateOpen(false);
      setNewNsName("");
      qc.invalidateQueries({ queryKey: queryKeys.namespaces });
      alert(t("namespaces.alert.created"));
    },
    onError: (e: unknown) => {
      const err = e as { message?: string };
      alert(err?.message || t("namespaces.error.create"));
    },
  });

  const delMut = useMutation({
    mutationFn: (name: string) => deleteNamespaceByName(name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.namespaces });
      alert(t("namespaces.alert.deleted"));
    },
    onError: (e: unknown) => {
      const err = e as { message?: string };
      alert(err?.message || t("namespaces.error.delete"));
    },
  });

  function handleCardClick(name: string) {
    router.push(`/namespaces/${encodeURIComponent(name)}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("namespaces.header.eyebrow")}
        title={t("namespaces.header.title")}
        description={t("namespaces.header.desc")}
        actions={
          <Button type="button" onClick={() => setIsCreateOpen(true)}>
            {t("namespaces.create")}
          </Button>
        }
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("namespaces.meta.total")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{totalNamespaces}</p>
              <p className="text-xs text-text-muted">{t("namespaces.meta.total.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("namespaces.meta.system")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{systemNamespaces}</p>
              <p className="text-xs text-text-muted">{t("namespaces.meta.system.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("namespaces.meta.status")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{t("namespaces.meta.status.ready")}</p>
              <p className="text-xs text-text-muted">{t("namespaces.meta.status.help")}</p>
            </div>
          </>
        }
      />

      <div className="grid gap-6">
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <p className="text-text-muted">{t("namespaces.loading")}</p>
            </CardContent>
          </Card>
        ) : isError ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <p className="text-text-muted">{t("namespaces.error")}</p>
            </CardContent>
          </Card>
        ) : totalNamespaces === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center space-y-2">
                <p className="text-text-muted">{t("namespaces.empty.title")}</p>
                <p className="text-xs text-text-muted">{t("namespaces.empty.desc")}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {namespaces!.map((ns) => (
              <Card
                key={ns.name}
                className="relative overflow-hidden hover:bg-hover cursor-pointer transition-colors"
                onClick={() => handleCardClick(ns.name)}
                role="button"
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base text-text-primary">{ns.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant={ns.status === "Active" ? "success-light" : ns.status === "Terminating" ? "warning-light" : "neutral-light"} size="sm" className={badgePresets.status}>
                          {ns.status}
                        </Badge>
                        <span className="text-xs text-text-muted">{t("namespaces.labels", { count: Object.keys(ns.labels || {}).length })}</span>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!confirm(t("namespaces.confirm.delete", { name: ns.name } as any))) return;
                          delMut.mutate(ns.name);
                        }}
                      >
                        {t("namespaces.delete")}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ns.resource_quota ? (
                    <div className="text-xs text-text-muted">{t("namespaces.rq.set")}</div>
                  ) : (
                    <div className="text-xs text-text-muted">{t("namespaces.rq.none")}</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal
        open={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={t("namespaces.create")}
        description={t("namespaces.create.desc")}
      >
        <div className="space-y-3">
          <label className="text-xs text-text-muted">{t("namespaces.create.name")}</label>
          <input
            autoFocus
            className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary"
            placeholder={t("namespaces.create.placeholder")}
            value={newNsName}
            onChange={(e) => setNewNsName(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>{t("actions.cancel")}</Button>
            <Button type="button" disabled={!newNsName.trim() || createMut.isPending} onClick={() => createMut.mutate()}>{t("actions.save")}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

