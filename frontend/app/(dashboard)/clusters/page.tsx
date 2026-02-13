"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { Plus, Edit, Trash2, TestTube, ArrowLeft, Loader2, Power, PowerOff, Activity } from "lucide-react";
import Link from "next/link";

import { clusterApi, metricsApi } from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { MetricsServerInstallDialog } from "@/components/MetricsServerInstallDialog";
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";

interface Cluster {
  id: number;
  name: string;
  endpoint: string;
  auth_type: string;
  is_active: boolean;
}

function ClustersPageContent() {
  const t = useTranslations("cluster");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [metricsStatus, setMetricsStatus] = useState<Record<number, boolean>>({});
  const [installDialog, setInstallDialog] = useState<{ open: boolean; clusterId: number; clusterName: string }>({
    open: false,
    clusterId: 0,
    clusterName: ""
  });
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    fetchClusters();
  }, []);

  useEffect(() => {
    if (clusters.length > 0) {
      checkMetricsStatus();
    }
  }, [clusters]);

  const checkMetricsStatus = async () => {
    const statusMap: Record<number, boolean> = {};

    for (const cluster of clusters) {
      try {
        const response = await metricsApi.getClusterHealth(cluster.id);
        if (response.data) {
          statusMap[cluster.id] = response.data.available === true;
        } else {
          statusMap[cluster.id] = false;
        }
      } catch (error) {
        console.error(`check metrics status failed for cluster ${cluster.id}:`, error);
        statusMap[cluster.id] = false;
      }
    }

    setMetricsStatus(statusMap);
  };

  const fetchClusters = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await clusterApi.getClusters();

      if (response.data) {
        setClusters(response.data);
      } else {
        console.error("load cluster list failed");
      }
    } catch (error) {
      console.error("load cluster list error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteCluster = (clusterId: number, clusterName: string) => {
    setConfirmDialog({
      open: true,
      title: t("deleteCluster"),
      description: t("deleteClusterConfirm", { name: clusterName }),
      onConfirm: () => performDeleteCluster(clusterId, clusterName),
    });
  };

  const performDeleteCluster = async (clusterId: number, clusterName: string) => {
    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await clusterApi.deleteCluster(clusterId);
          if (response.data === undefined) {
            throw new Error(response.error || t("deleteClusterErrorUnknown"));
          }
          setClusters(clusters.filter((cluster) => cluster.id !== clusterId));
        },
        {
          loading: t("deleteClusterLoading", { name: clusterName }),
          success: t("deleteClusterSuccess", { name: clusterName }),
          error: t("deleteClusterError"),
        }
      );
    } catch (error) {
      console.error("delete cluster failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleTestConnection = async (clusterId: number, clusterName: string) => {
    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await clusterApi.testConnection(clusterId);
          if (!response.data) {
            throw new Error(response.error || t("testConnectionErrorUnknown"));
          }
        },
        {
          loading: t("testConnectionLoading", { name: clusterName }),
          success: t("testConnectionSuccess", { name: clusterName }),
          error: t("testConnectionError"),
        }
      );
    } catch (error) {
      console.error("test connection failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleToggleActive = (cluster: Cluster) => {
    const actionKey = cluster.is_active ? "deactivate" : "activate";
    setConfirmDialog({
      open: true,
      title: t("toggleClusterTitle", { action: tCommon(actionKey) }),
      description: t("toggleClusterDescription", {
        action: tCommon(actionKey),
        name: cluster.name,
      }),
      onConfirm: () => performToggleActive(cluster, actionKey),
    });
  };

  const performToggleActive = async (cluster: Cluster, actionKey: "activate" | "deactivate") => {
    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await clusterApi.updateCluster(cluster.id, {
            is_active: !cluster.is_active,
          });

          if (!response.data) {
            throw new Error(response.error || t("toggleClusterErrorUnknown"));
          }

          setClusters(clusters.map((c) => (c.id === cluster.id ? { ...c, is_active: !c.is_active } : c)));
        },
        {
          loading: t("toggleClusterLoading", { action: tCommon(actionKey), name: cluster.name }),
          success: t("toggleClusterSuccess", { action: tCommon(actionKey), name: cluster.name }),
          error: t("toggleClusterError"),
        }
      );
    } catch (error) {
      console.error("toggle cluster failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">{tCommon("backToDashboard")}</span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <LanguageToggle />
              <ThemeToggle />
              <Button asChild>
                <Link href="/clusters/new">
                  <Plus className="h-4 w-4 mr-2" />
                  {t("addCluster")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("title")}
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {t("description")}
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span className="text-lg">{tCommon("loading")}</span>
          </div>
        ) : clusters.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <div className="text-center">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {t("noClusters")}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  {t("noClustersDescription")}
                </p>
                <Button asChild>
                  <Link href="/clusters/new">
                    <Plus className="h-4 w-4 mr-2" />
                    {t("addCluster")}
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clusters.map((cluster) => (
              <Card key={cluster.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{cluster.name}</CardTitle>
                    <Badge variant={cluster.is_active ? "default" : "secondary"}>
                      {cluster.is_active ? tCommon("active") : tCommon("inactive")}
                    </Badge>
                  </div>
                  <CardDescription>{cluster.endpoint}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {t("authType")}: {cluster.auth_type === 'kubeconfig' ? t("kubeconfig") : t("token")}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant={cluster.is_active ? "secondary" : "default"}
                        onClick={() => handleToggleActive(cluster)}
                        disabled={isOperationLoading}
                      >
                        {cluster.is_active ? (
                          <>
                            <PowerOff className="h-4 w-4 mr-1" />
                            {tCommon("deactivate")}
                          </>
                        ) : (
                          <>
                            <Power className="h-4 w-4 mr-1" />
                            {tCommon("activate")}
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestConnection(cluster.id, cluster.name)}
                        disabled={isOperationLoading}
                      >
                        <TestTube className="h-4 w-4 mr-1" />
                        {t("testConnection")}
                      </Button>
                      {!metricsStatus[cluster.id] && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setInstallDialog({
                            open: true,
                            clusterId: cluster.id,
                            clusterName: cluster.name
                          })}
                        >
                          <Activity className="h-4 w-4 mr-1" />
                          {t("installMonitoring")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                      >
                        <Link href={`/clusters/${cluster.id}/edit`}>
                          <Edit className="h-4 w-4 mr-1" />
                          {tCommon("edit")}
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteCluster(cluster.id, cluster.name)}
                        disabled={isOperationLoading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        variant="destructive"
      />

      <MetricsServerInstallDialog
        open={installDialog.open}
        onOpenChange={(open) => setInstallDialog(prev => ({ ...prev, open }))}
        clusterId={installDialog.clusterId}
        clusterName={installDialog.clusterName}
        onSuccess={checkMetricsStatus}
      />
    </div>
  );
}

export default function ClustersPage() {
  return <ClustersPageContent />;
}
