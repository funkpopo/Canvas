"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { Plus, Edit, Trash2, TestTube, ArrowLeft, Loader2, Power, PowerOff } from "lucide-react";
import Link from "next/link";
import AuthGuard from "@/components/AuthGuard";
import { clusterApi } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useTranslations } from "next-intl";

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

  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    fetchClusters();
  }, []);

  const fetchClusters = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await clusterApi.getClusters();

      if (response.data) {
        setClusters(response.data);
      } else {
        console.error("获取集群列表失败");
      }
    } catch (error) {
      console.error("获取集群列表出错:", error);
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
    try {
      const token = localStorage.getItem("token");
      const response = await clusterApi.deleteCluster(clusterId);

      if (response.data !== undefined) {
        setClusters(clusters.filter(cluster => cluster.id !== clusterId));
        toast.success(t("deleteCluster") + " " + tCommon("success"));
      } else {
        toast.error(t("deleteCluster") + " " + tCommon("failed"));
      }
    } catch (error) {
      console.error(t("deleteCluster") + " error:", error);
      toast.error(t("deleteCluster") + " " + tCommon("error"));
    }
  };

  const handleTestConnection = async (clusterId: number, clusterName: string) => {
    try {
      const response = await clusterApi.testConnection(clusterId);

      if (response.data) {
        toast.success(`集群 "${clusterName}" 连接测试成功！`);
      } else {
        toast.error(`集群 "${clusterName}" 连接测试失败：${response.error || '未知错误'}`);
      }
    } catch (error) {
      console.error("测试连接出错:", error);
      toast.error("测试连接时发生错误");
    }
  };

  const handleToggleActive = (cluster: Cluster) => {
    const action = cluster.is_active ? "停用" : "激活";
    setConfirmDialog({
      open: true,
      title: `${action}集群`,
      description: `确定要${action}集群 "${cluster.name}" 吗？`,
      onConfirm: () => performToggleActive(cluster, action),
    });
  };

  const performToggleActive = async (cluster: Cluster, action: string) => {
    try {
      const response = await clusterApi.updateCluster(cluster.id, {
        is_active: !cluster.is_active
      });

      if (response.data) {
        // 更新本地状态
        setClusters(clusters.map(c =>
          c.id === cluster.id ? { ...c, is_active: !c.is_active } : c
        ));
        toast.success(`集群 "${cluster.name}" 已${action}成功！`);
      } else {
        toast.error(`${action}集群失败: ${response.error || '未知错误'}`);
      }
    } catch (error) {
      console.error(`${action}集群出错:`, error);
      toast.error(`${action}集群时发生错误`);
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
                      >
                        <TestTube className="h-4 w-4 mr-1" />
                        {t("testConnection")}
                      </Button>
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
    </div>
  );
}

export default function ClustersPage() {
  return (
    <AuthGuard>
      <ClustersPageContent />
    </AuthGuard>
  );
}
