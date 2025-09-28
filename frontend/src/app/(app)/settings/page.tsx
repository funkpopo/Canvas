"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { queryKeys, fetchClusterConfig, saveClusterConfig, ClusterConfigPayload } from "@/lib/api";

const fieldStyles = "w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white placeholder:text-[color:var(--canvas-muted)] focus:outline-none focus:ring-2 focus:ring-teal-500/60";

function sanitize(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function SettingsPage() {
  const { data: config, isLoading } = useQuery({
    queryKey: queryKeys.clusterConfig,
    queryFn: fetchClusterConfig,
  });
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [apiServer, setApiServer] = useState("");
  const [namespace, setNamespace] = useState("");
  const [context, setContext] = useState("");
  const [kubeconfig, setKubeconfig] = useState("");
  const [token, setToken] = useState("");
  const [certificate, setCertificate] = useState("");
  const [insecure, setInsecure] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!config) {
      return;
    }
    setName(config.name ?? "");
    setApiServer(config.api_server ?? "");
    setNamespace(config.namespace ?? "");
    setContext(config.context ?? "");
    setKubeconfig(config.kubeconfig ?? "");
    setToken(config.token ?? "");
    setCertificate(config.certificate_authority_data ?? "");
    setInsecure(Boolean(config.insecure_skip_tls_verify));
  }, [config]);

  const mutation = useMutation({
    mutationFn: saveClusterConfig,
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.clusterConfig, data);
      setStatusMessage("配置已保存");
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      setStatusMessage(null);
      setErrorMessage(error instanceof Error ? error.message : "保存失败");
    },
  });

  const lastUpdated = useMemo(() => {
    if (!config?.updated_at) {
      return "未配置";
    }
    return new Date(config.updated_at).toLocaleString();
  }, [config]);

  const clusterStatus = config ? "已连接" : "未连接";

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    if (!name.trim()) {
      setErrorMessage("请填写集群名称");
      return;
    }
    if (!apiServer.trim() && !kubeconfig.trim()) {
      setErrorMessage("至少提供 API Server 地址或完整 kubeconfig");
      return;
    }

    const payload: ClusterConfigPayload = {
      name: name.trim(),
      api_server: sanitize(apiServer),
      namespace: sanitize(namespace),
      context: sanitize(context),
      kubeconfig: kubeconfig.trim().length > 0 ? kubeconfig : null,
      token: token.length > 0 ? token : "", // empty string clears stored token
      certificate_authority_data: certificate.trim().length > 0 ? certificate : null,
      insecure_skip_tls_verify: insecure,
    };

    mutation.mutate(payload);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Control plane"
        title="Administrative settings"
        description="Configure how Canvas connects to your Kubernetes control plane."
        meta={
          <>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Cluster status</p>
              <p className="mt-1 text-lg font-semibold text-white">{clusterStatus}</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Last updated {lastUpdated}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Credential sources</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {config?.token_present ? "Token" : "None"} • {config?.kubeconfig_present ? "Kubeconfig" : "Inline"}
              </p>
              <p className="text-xs text-[color:var(--canvas-muted)]">CA data {config?.certificate_authority_data_present ? "available" : "missing"}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Security</p>
              <p className="mt-1 text-lg font-semibold text-white">
                {config?.insecure_skip_tls_verify ? "TLS verification disabled" : "TLS verification enabled"}
              </p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Manage verification policies below.</p>
            </div>
          </>
        }
      >
        <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-emerald-100">
          {isLoading ? "Loading" : clusterStatus}
        </Badge>
      </PageHeader>

      <Card className="border-[var(--canvas-border)] bg-[var(--canvas-panel)]/85">
        <CardHeader>
          <CardTitle className="text-white">Cluster connection</CardTitle>
          <CardDescription>Provide the connection details Canvas should use to talk to your cluster.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Cluster name</span>
                <input className={fieldStyles} value={name} onChange={(event) => setName(event.target.value)} placeholder="production-cluster" />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">API server</span>
                <input
                  className={fieldStyles}
                  value={apiServer}
                  onChange={(event) => setApiServer(event.target.value)}
                  placeholder="https://my-cluster.example.com"
                />
              </label>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Namespace (optional)</span>
                <input className={fieldStyles} value={namespace} onChange={(event) => setNamespace(event.target.value)} placeholder="default" />
              </label>
              <label className="space-y-2">
                <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Context (optional)</span>
                <input className={fieldStyles} value={context} onChange={(event) => setContext(event.target.value)} placeholder="gke-context" />
              </label>
            </div>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Bearer token</span>
              <input
                className={fieldStyles}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste service account token"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Certificate authority data</span>
              <textarea
                className={`${fieldStyles} min-h-[120px]`}
                value={certificate}
                onChange={(event) => setCertificate(event.target.value)}
                placeholder="Base64 encoded certificate-authority-data"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Inline kubeconfig (optional)</span>
              <textarea
                className={`${fieldStyles} min-h-[180px] font-mono text-xs`}
                value={kubeconfig}
                onChange={(event) => setKubeconfig(event.target.value)}
                placeholder="apiVersion: v1\nclusters:\n  - name: ..."
              />
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={insecure}
                onChange={(event) => setInsecure(event.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-black/20"
              />
              Skip TLS verification
            </label>

            {statusMessage ? (
              <p className="text-sm text-emerald-200">{statusMessage}</p>
            ) : null}
            {errorMessage ? (
              <p className="text-sm text-rose-200">{errorMessage}</p>
            ) : null}

            <div className="flex justify-end">
              <Button type="submit" disabled={mutation.isPending} className="bg-gradient-to-r from-emerald-400 to-cyan-500 text-slate-900 hover:from-emerald-300 hover:to-cyan-400">
                {mutation.isPending ? "Saving…" : "Save configuration"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
