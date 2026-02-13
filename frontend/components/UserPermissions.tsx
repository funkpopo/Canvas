"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { toast } from "sonner";

import { Plus, Trash2, Shield, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";

import { permissionApi, UserPermissions, Cluster, clusterApi } from "@/lib/api";

import { ConfirmDialog } from "@/components/ConfirmDialog";

import { useTranslations } from "@/hooks/use-translations";

import { useLanguage } from "@/lib/language-context";

interface UserPermissionsProps {
  userId: number;

  username: string;

  onPermissionsChange?: () => void;
}

export default function UserPermissionsComponent({
  userId,

  username,

  onPermissionsChange,
}: UserPermissionsProps) {
  const t = useTranslations("userPermissions");

  const tCommon = useTranslations("common");

  const { locale } = useLanguage();

  const [permissions, setPermissions] = useState<UserPermissions | null>(null);

  const [clusters, setClusters] = useState<Cluster[]>([]);

  const [isLoading, setIsLoading] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 对话框状态

  const [isClusterDialogOpen, setIsClusterDialogOpen] = useState(false);

  const [isNamespaceDialogOpen, setIsNamespaceDialogOpen] = useState(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // 表单数据

  const [selectedClusterId, setSelectedClusterId] = useState<number>(0);

  const [clusterPermissionLevel, setClusterPermissionLevel] = useState<"read" | "manage">("read");

  const [namespaceName, setNamespaceName] = useState("");

  const [namespacePermissionLevel, setNamespacePermissionLevel] = useState<"read" | "manage">(
    "read"
  );

  // 删除确认

  const [permissionToDelete, setPermissionToDelete] = useState<{
    type: "cluster" | "namespace";

    id: number;
  } | null>(null);

  const localeTag = locale === "zh" ? "zh-CN" : "en-US";

  const formatDateTime = (value: string) => new Date(value).toLocaleString(localeTag);

  useEffect(() => {
    fetchPermissions();

    fetchClusters();
  }, [userId]);

  const fetchPermissions = async () => {
    setIsLoading(true);

    try {
      const response = await permissionApi.getUserPermissions(userId);

      if (response.data) {
        setPermissions(response.data);
      } else {
        toast.error(response.error || t("loadPermissionsFailed"));
      }
    } catch {
      toast.error(t("loadPermissionsFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchClusters = async () => {
    try {
      const response = await clusterApi.getClusters();

      if (response.data) {
        setClusters(response.data);
      }
    } catch (error) {
      console.error(t("loadClustersFailed"), error);
    }
  };

  const handleGrantClusterPermission = async () => {
    if (!selectedClusterId) {
      toast.error(t("selectClusterRequired"));

      return;
    }

    setIsSubmitting(true);

    try {
      const response = await permissionApi.grantClusterPermission(userId, {
        cluster_id: selectedClusterId,

        permission_level: clusterPermissionLevel,
      });

      if (response.data) {
        toast.success(t("grantClusterSuccess"));

        setIsClusterDialogOpen(false);

        fetchPermissions();

        onPermissionsChange?.();

        resetClusterForm();
      } else {
        toast.error(response.error || t("grantFailed"));
      }
    } catch {
      toast.error(t("grantFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGrantNamespacePermission = async () => {
    if (!selectedClusterId) {
      toast.error(t("selectClusterRequired"));

      return;
    }

    if (!namespaceName.trim()) {
      toast.error(t("namespaceNameRequired"));

      return;
    }

    setIsSubmitting(true);

    try {
      const response = await permissionApi.grantNamespacePermission(userId, {
        cluster_id: selectedClusterId,

        namespace: namespaceName.trim(),

        permission_level: namespacePermissionLevel,
      });

      if (response.data) {
        toast.success(t("grantNamespaceSuccess"));

        setIsNamespaceDialogOpen(false);

        fetchPermissions();

        onPermissionsChange?.();

        resetNamespaceForm();
      } else {
        toast.error(response.error || t("grantFailed"));
      }
    } catch {
      toast.error(t("grantFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePermission = async () => {
    if (!permissionToDelete) return;

    setIsSubmitting(true);

    try {
      const { type, id } = permissionToDelete;

      const response =
        type === "cluster"
          ? await permissionApi.revokeClusterPermission(id)
          : await permissionApi.revokeNamespacePermission(id);

      if (response.error) {
        toast.error(response.error);
      } else {
        toast.success(
          t("revokeSuccess", {
            type: type === "cluster" ? t("permissionTypeCluster") : t("permissionTypeNamespace"),
          })
        );

        fetchPermissions();

        onPermissionsChange?.();
      }
    } catch {
      toast.error(t("revokeFailed"));
    } finally {
      setIsSubmitting(false);

      setIsDeleteDialogOpen(false);

      setPermissionToDelete(null);
    }
  };

  const resetClusterForm = () => {
    setSelectedClusterId(0);

    setClusterPermissionLevel("read");
  };

  const resetNamespaceForm = () => {
    setSelectedClusterId(0);

    setNamespaceName("");

    setNamespacePermissionLevel("read");
  };

  const getPermissionBadge = (level: "read" | "manage") => {
    return level === "manage" ? (
      <Badge className="bg-red-500">
        <ShieldCheck className="h-3 w-3 mr-1" />

        {t("permissionManage")}
      </Badge>
    ) : (
      <Badge className="bg-blue-500">
        <Shield className="h-3 w-3 mr-1" />

        {t("permissionRead")}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 权限概览 */}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Shield className="h-5 w-5 mr-2" />

            {t("title")}
          </CardTitle>

          <CardDescription>{t("description", { username })}</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {permissions?.cluster_permissions.length || 0}
              </div>

              <div className="text-sm text-muted-foreground">{t("clusterPermissionsCount")}</div>
            </div>

            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {permissions?.namespace_permissions.length || 0}
              </div>

              <div className="text-sm text-muted-foreground">{t("namespacePermissionsCount")}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 集群权限 */}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("clusterPermissionsTitle")}</CardTitle>

              <CardDescription>{t("clusterPermissionsDescription")}</CardDescription>
            </div>

            <Button onClick={() => setIsClusterDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />

              {t("grantCluster")}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {permissions?.cluster_permissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />

              <p>{t("noClusterPermissions")}</p>

              <p className="text-sm">{t("noClusterPermissionsHint")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {permissions?.cluster_permissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="font-medium">
                        {perm.cluster_name || t("clusterFallback", { clusterId: perm.cluster_id })}
                      </div>

                      <div className="text-sm text-muted-foreground">
                        {t("createdAtLabel", { time: formatDateTime(perm.created_at) })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {getPermissionBadge(perm.permission_level)}

                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("revokeClusterPermissionAction")}
                      title={t("revokeClusterPermissionAction")}
                      onClick={() => {
                        setPermissionToDelete({ type: "cluster", id: perm.id });
                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 命名空间权限 */}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("namespacePermissionsTitle")}</CardTitle>

              <CardDescription>{t("namespacePermissionsDescription")}</CardDescription>
            </div>

            <Button onClick={() => setIsNamespaceDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />

              {t("grantNamespace")}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {permissions?.namespace_permissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />

              <p>{t("noNamespacePermissions")}</p>

              <p className="text-sm">{t("noNamespacePermissionsHint")}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {permissions?.namespace_permissions.map((perm) => (
                <div
                  key={perm.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="font-medium">{perm.namespace}</div>

                      <div className="text-sm text-muted-foreground">
                        {t("namespaceMeta", {
                          cluster:
                            perm.cluster_name ||
                            t("clusterFallback", { clusterId: perm.cluster_id }),

                          time: formatDateTime(perm.created_at),
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {getPermissionBadge(perm.permission_level)}

                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("revokeNamespacePermissionAction")}
                      title={t("revokeNamespacePermissionAction")}
                      onClick={() => {
                        setPermissionToDelete({ type: "namespace", id: perm.id });
                        setIsDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 集群权限授权对话框 */}

      <Dialog open={isClusterDialogOpen} onOpenChange={setIsClusterDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("grantClusterDialogTitle")}</DialogTitle>

            <DialogDescription>
              {t("grantClusterDialogDescription", { username })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cluster-select">{t("selectClusterLabel")}</Label>

              <Select
                value={selectedClusterId.toString()}
                onValueChange={(value) => setSelectedClusterId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectClusterPlaceholder")} />
                </SelectTrigger>

                <SelectContent>
                  {clusters.map((cluster) => (
                    <SelectItem key={cluster.id} value={cluster.id.toString()}>
                      {cluster.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cluster-permission">{t("permissionLevelLabel")}</Label>

              <Select
                value={clusterPermissionLevel}
                onValueChange={(value: "read" | "manage") => setClusterPermissionLevel(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="read">{t("permissionReadDescription")}</SelectItem>

                  <SelectItem value="manage">{t("permissionManageDescription")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsClusterDialogOpen(false)}>
                {tCommon("cancel")}
              </Button>

              <Button onClick={handleGrantClusterPermission} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}

                {t("grantAction")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 命名空间权限授权对话框 */}

      <Dialog open={isNamespaceDialogOpen} onOpenChange={setIsNamespaceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("grantNamespaceDialogTitle")}</DialogTitle>

            <DialogDescription>
              {t("grantNamespaceDialogDescription", { username })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ns-cluster-select">{t("selectClusterLabel")}</Label>

              <Select
                value={selectedClusterId.toString()}
                onValueChange={(value) => setSelectedClusterId(Number(value))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("selectClusterPlaceholder")} />
                </SelectTrigger>

                <SelectContent>
                  {clusters.map((cluster) => (
                    <SelectItem key={cluster.id} value={cluster.id.toString()}>
                      {cluster.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="namespace-name">{t("namespaceNameLabel")}</Label>

              <Input
                id="namespace-name"
                value={namespaceName}
                onChange={(e) => setNamespaceName(e.target.value)}
                placeholder={t("namespaceNamePlaceholder")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ns-permission">{t("permissionLevelLabel")}</Label>

              <Select
                value={namespacePermissionLevel}
                onValueChange={(value: "read" | "manage") => setNamespacePermissionLevel(value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="read">{t("permissionReadDescription")}</SelectItem>

                  <SelectItem value="manage">{t("permissionManageDescription")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsNamespaceDialogOpen(false)}>
                {tCommon("cancel")}
              </Button>

              <Button onClick={handleGrantNamespacePermission} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}

                {t("grantAction")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title={t("revokeDialogTitle")}
        description={t("revokeDialogDescription", {
          type:
            permissionToDelete?.type === "cluster"
              ? t("permissionTypeCluster")
              : t("permissionTypeNamespace"),
        })}
        onConfirm={handleDeletePermission}
        confirmText={t("revokeConfirmText")}
      />
    </div>
  );
}
