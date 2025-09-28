"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";


import { Button } from "@/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { StatusBadge } from "@/shared/ui/status-badge";
import { badgePresets } from "@/shared/ui/badge";
import { queryKeys, fetchClusterConfig } from "@/lib/api";

const inputStyles =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-focus focus:bg-surface-raised transition-colors";

export default function SettingsPage() {
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

  const { clusterStatus, lastUpdated } = useMemo(() => {
    if (!config) {
      return { clusterStatus: "Not configured", lastUpdated: "Never" };
    }

    const hasCredentials = config.token_present || config.kubeconfig_present;
    const hasEndpoint = Boolean(config.api_server);

    if (hasCredentials && hasEndpoint) {
      return {
        clusterStatus: "Connected",
        lastUpdated: new Date().toLocaleTimeString(),
      };
    }

    return { clusterStatus: "Incomplete", lastUpdated: "Never" };
  }, [config]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Configuration hub"
        title="Connect your Kubernetes cluster"
        description="Configure authentication and connection settings to start monitoring your cluster resources."
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Connection status</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{clusterStatus}</p>
              <p className="text-xs text-text-muted">Last validated: {lastUpdated}</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Auth method</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {config?.token_present ? "Token" : config?.kubeconfig_present ? "Kubeconfig" : "None"}
              </p>
              <p className="text-xs text-text-muted">Primary authentication strategy.</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>TLS mode</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">
                {config?.insecure_skip_tls_verify ? "Insecure" : "Verified"}
              </p>
              <p className="text-xs text-text-muted">Certificate validation settings.</p>
            </div>
          </>
        }
      />

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">Cluster connection</CardTitle>
          <CardDescription>
            Provide either individual connection details or a complete kubeconfig file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="cluster-name" className="block">
                <span className={`${badgePresets.label} text-text-muted`}>Cluster name</span>
              </label>
              <input
                id="cluster-name"
                value={clusterName}
                onChange={(e) => setClusterName(e.target.value)}
                className={inputStyles}
                placeholder="my-cluster"
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="namespace" className="block">
                <span className={`${badgePresets.label} text-text-muted`}>Namespace (optional)</span>
              </label>
              <input
                id="namespace"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
                className={inputStyles}
                placeholder="default"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="context" className="block">
              <span className={`${badgePresets.label} text-text-muted`}>Context (optional)</span>
            </label>
            <input
              id="context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className={inputStyles}
              placeholder="my-cluster-context"
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div className="space-y-6">
              <div>
                <p className={`${badgePresets.label} text-text-muted`}>
                  Option 1: Connection details
                </p>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <span className={`${badgePresets.label} text-text-muted`}>API server</span>
                    <input
                      value={apiServer}
                      onChange={(e) => setApiServer(e.target.value)}
                      className={inputStyles}
                      placeholder="https://api.my-cluster.example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <span className={`${badgePresets.label} text-text-muted`}>Bearer token</span>
                    <textarea
                      value={bearerToken}
                      onChange={(e) => setBearerToken(e.target.value)}
                      className={inputStyles}
                      rows={3}
                      placeholder="eyJhbGciOiJSUzI1NiIs..."
                    />
                  </div>
                  <div className="space-y-2">
                    <span className={`${badgePresets.label} text-text-muted`}>Certificate authority data</span>
                    <textarea
                      value={caCert}
                      onChange={(e) => setCaCert(e.target.value)}
                      className={inputStyles}
                      rows={4}
                      placeholder="-----BEGIN CERTIFICATE-----"
                    />
                  </div>
                  <label className="flex items-center gap-3 text-sm text-text-primary">
                    <input
                      type="checkbox"
                      checked={skipTlsVerify}
                      onChange={(e) => setSkipTlsVerify(e.target.checked)}
                      className="h-4 w-4 rounded border-border bg-surface"
                    />
                    Skip TLS verification (insecure)
                  </label>
                </div>
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <p className={`${badgePresets.label} text-text-muted`}>
                  Option 2: Upload kubeconfig
                </p>
                <div className="mt-4 space-y-2">
                  <span className={`${badgePresets.label} text-text-muted`}>Inline kubeconfig</span>
                  <textarea
                    value={kubeconfig}
                    onChange={(e) => setKubeconfig(e.target.value)}
                    className={inputStyles}
                    rows={12}
                    placeholder="apiVersion: v1&#10;kind: Config&#10;clusters:&#10;- cluster:&#10;    server: https://..."
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
              <Button variant="outline">Test connection</Button>
              <Button>Save configuration</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


