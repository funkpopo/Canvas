"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { StatusBadge } from "@/shared/ui/status-badge";
import { useI18n } from "@/shared/i18n/i18n";
import { badgePresets } from "@/shared/ui/badge";
import {
  queryKeys,
  fetchClusterConfig,
  saveClusterConfig,
  type ClusterConfigPayload,
  type ClusterConfigResponse,
} from "@/lib/api";

const inputStyles =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-focus focus:bg-surface-raised transition-colors";

export default function ManageClusterPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [apiServer, setApiServer] = useState("");
  const [bearerToken, setBearerToken] = useState("");
  const [caCert, setCaCert] = useState("");
  const [skipTlsVerify, setSkipTlsVerify] = useState(false);
  const [kubeconfig, setKubeconfig] = useState("");
  const [clusterName, setClusterName] = useState("");
  const [namespace, setNamespace] = useState("");
  const [context, setContext] = useState("");

  const { data: config } = useQuery({
    queryKey: queryKeys.clusterConfig,
    queryFn: fetchClusterConfig,
  });

  useEffect(() => {
    if (config) {
      setClusterName(config.name ?? "");
      setApiServer(config.api_server ?? "");
      setNamespace(config.namespace ?? "");
      setContext(config.context ?? "");
      setKubeconfig(config.kubeconfig ?? "");
      setBearerToken(config.token ?? "");
      setCaCert(config.certificate_authority_data ?? "");
      setSkipTlsVerify(!!config.insecure_skip_tls_verify);
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: ClusterConfigPayload = {
        name: clusterName.trim(),
        api_server: apiServer.trim() ? apiServer.trim() : null,
        namespace: namespace.trim() ? namespace.trim() : null,
        context: context.trim() ? context.trim() : null,
        kubeconfig: kubeconfig.trim() ? kubeconfig.trim() : null,
        token: bearerToken.trim() ? bearerToken.trim() : null,
        certificate_authority_data: caCert.trim() ? caCert.trim() : null,
        insecure_skip_tls_verify: skipTlsVerify,
      };
      return await saveClusterConfig(payload);
    },
    onSuccess: async (_data: ClusterConfigResponse) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterConfig }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterOverview }),
        queryClient.invalidateQueries({ queryKey: queryKeys.events }),
        queryClient.invalidateQueries({ queryKey: queryKeys.workloads }),
        queryClient.invalidateQueries({ queryKey: queryKeys.clusterConfigsAll }),
      ]);
    },
  });

  const { clusterStatus, lastUpdated } = useMemo(() => {
    if (!config) {
      return { clusterStatus: t("cm.status.notConfigured"), lastUpdated: t("cm.status.never") };
    }

    const hasKubeconfig = config.kubeconfig_present;
    const hasTokenAndEndpoint = config.token_present && Boolean(config.api_server);

    if (hasKubeconfig || hasTokenAndEndpoint) {
      return {
        clusterStatus: t("cm.status.connected"),
        lastUpdated: new Date().toLocaleTimeString(),
      };
    }

    return { clusterStatus: t("cm.status.incomplete"), lastUpdated: t("cm.status.never") };
  }, [config, t]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("cm.header.eyebrow")}
        title={t("cm.header.title")}
        description={t("cm.header.desc")}
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("cm.meta.conn")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{clusterStatus}</p>
              <p className="text-xs text-text-muted">{t("cm.meta.lastValidated", { time: lastUpdated })}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("cm.meta.auth")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {config?.token_present ? t("cm.auth.token") : config?.kubeconfig_present ? t("cm.auth.kubeconfig") : t("cm.auth.none")}
              </p>
              <p className="text-xs text-text-muted">{t("cm.meta.auth.help")}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>{t("cm.meta.tls")}</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {config?.insecure_skip_tls_verify ? t("cm.tls.insecure") : t("cm.tls.verified")}
              </p>
              <p className="text-xs text-text-muted">{t("cm.meta.tls.help")}</p>
            </div>
          </>
        }
      />

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">{t("cm.header.eyebrow")}</CardTitle>
          <CardDescription>{t("cm.header.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="cluster-name" className="block">
                <span className={`${badgePresets.label} text-text-muted`}>{t("cm.form.clusterName")}</span>
              </label>
              <input
                id="cluster-name"
                value={clusterName}
                onChange={(e) => setClusterName(e.target.value)}
                className={inputStyles}
                placeholder={t("cm.form.clusterName")}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="namespace" className="block">
                <span className={`${badgePresets.label} text-text-muted`}>{t("cm.form.namespace")}</span>
              </label>
              <input
                id="namespace"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                className={inputStyles}
                placeholder={t("cm.form.placeholder.ns")}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="context" className="block">
              <span className={`${badgePresets.label} text-text-muted`}>{t("cm.form.context")}</span>
            </label>
            <input
              id="context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className={inputStyles}
              placeholder={t("cm.form.placeholder.ctx")}
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-6">
              <div id="credentials">
                <p className={`${badgePresets.label} text-text-muted`}>
                  {t("cm.form.opt1")}
                </p>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <span className={`${badgePresets.label} text-text-muted`}>{t("cm.form.apiServer")}</span>
                    <input
                      value={apiServer}
                      onChange={(e) => setApiServer(e.target.value)}
                      className={inputStyles}
                      placeholder={t("cm.form.placeholder.api")}
                    />
                  </div>
                  <div className="space-y-2">
                    <span className={`${badgePresets.label} text-text-muted`}>{t("cm.form.bearerToken")}</span>
                    <textarea
                      value={bearerToken}
                      onChange={(e) => setBearerToken(e.target.value)}
                      className={inputStyles}
                      rows={3}
                      placeholder={t("cm.form.placeholder.token")}
                    />
                  </div>
                  <div className="space-y-2">
                    <span className={`${badgePresets.label} text-text-muted`}>{t("cm.form.caData")}</span>
                    <textarea
                      value={caCert}
                      onChange={(e) => setCaCert(e.target.value)}
                      className={inputStyles}
                      rows={4}
                      placeholder={t("cm.form.placeholder.ca")}
                    />
                  </div>
                  <label className="flex items-center gap-3 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={skipTlsVerify}
                      onChange={(e) => setSkipTlsVerify(e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-surface"
                    />
                    {t("cm.form.skipTls")}
                  </label>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div id="kubeconfig">
                <p className={`${badgePresets.label} text-text-muted`}>
                  {t("cm.form.opt2")}
                </p>
                <div className="mt-4 space-y-2">
                  <span className={`${badgePresets.label} text-text-muted`}>{t("cm.form.inlineKubeconfig")}</span>
                  <textarea
                    value={kubeconfig}
                    onChange={(e) => setKubeconfig(e.target.value)}
                    className={inputStyles}
                    rows={12}
                    placeholder={t("cm.form.placeholder.kube")}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-border pt-6">
            <div className="flex items-center gap-4">
              <StatusBadge
                status={clusterStatus === "Connected" ? "healthy" : "warning"}
                label={clusterStatus}
              />
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  // Lightweight connectivity check by fetching overview
                  queryClient.invalidateQueries({ queryKey: queryKeys.clusterOverview });
                }}
              >
                {t("cm.actions.test")}
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !clusterName.trim() || (!kubeconfig.trim() && !apiServer.trim())}
              >
                {saveMutation.isPending ? t("cm.actions.saving") : t("cm.actions.save")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

