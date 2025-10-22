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
import {
  Plus,
  Trash2,
  Shield,
  ShieldCheck,
  Loader2,
  AlertTriangle
} from "lucide-react";
import {
  permissionApi,
  UserPermissions,
  ClusterPermission,
  NamespacePermission,
  Cluster,
  clusterApi
} from "@/lib/api";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface UserPermissionsProps {
  userId: number;
  username: string;
  onPermissionsChange?: () => void;
}

export default function UserPermissionsComponent({ userId, username, onPermissionsChange }: UserPermissionsProps) {
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
  const [clusterPermissionLevel, setClusterPermissionLevel] = useState<'read' | 'manage'>('read');
  const [namespaceName, setNamespaceName] = useState('');
  const [namespacePermissionLevel, setNamespacePermissionLevel] = useState<'read' | 'manage'>('read');

  // 删除确认
  const [permissionToDelete, setPermissionToDelete] = useState<{type: 'cluster' | 'namespace', id: number} | null>(null);

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
        toast.error(response.error || "获取用户权限失败");
      }
    } catch (error) {
      toast.error("获取用户权限失败");
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
      console.error("获取集群列表失败:", error);
    }
  };

  const handleGrantClusterPermission = async () => {
    if (!selectedClusterId) {
      toast.error("请选择集群");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await permissionApi.grantClusterPermission(userId, {
        cluster_id: selectedClusterId,
        permission_level: clusterPermissionLevel
      });

      if (response.data) {
        toast.success("集群权限授权成功");
        setIsClusterDialogOpen(false);
        fetchPermissions();
        onPermissionsChange?.();
        resetClusterForm();
      } else {
        toast.error(response.error || "授权失败");
      }
    } catch (error) {
      toast.error("授权失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGrantNamespacePermission = async () => {
    if (!selectedClusterId) {
      toast.error("请选择集群");
      return;
    }
    if (!namespaceName.trim()) {
      toast.error("请输入命名空间名称");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await permissionApi.grantNamespacePermission(userId, {
        cluster_id: selectedClusterId,
        namespace: namespaceName.trim(),
        permission_level: namespacePermissionLevel
      });

      if (response.data) {
        toast.success("命名空间权限授权成功");
        setIsNamespaceDialogOpen(false);
        fetchPermissions();
        onPermissionsChange?.();
        resetNamespaceForm();
      } else {
        toast.error(response.error || "授权失败");
      }
    } catch (error) {
      toast.error("授权失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePermission = async () => {
    if (!permissionToDelete) return;

    setIsSubmitting(true);
    try {
      const { type, id } = permissionToDelete;
      const response = type === 'cluster'
        ? await permissionApi.revokeClusterPermission(id)
        : await permissionApi.revokeNamespacePermission(id);

      if (response.error) {
        toast.error(response.error);
      } else {
        toast.success(`${type === 'cluster' ? '集群' : '命名空间'}权限撤销成功`);
        fetchPermissions();
        onPermissionsChange?.();
      }
    } catch (error) {
      toast.error("撤销权限失败");
    } finally {
      setIsSubmitting(false);
      setIsDeleteDialogOpen(false);
      setPermissionToDelete(null);
    }
  };

  const resetClusterForm = () => {
    setSelectedClusterId(0);
    setClusterPermissionLevel('read');
  };

  const resetNamespaceForm = () => {
    setSelectedClusterId(0);
    setNamespaceName('');
    setNamespacePermissionLevel('read');
  };

  const getPermissionBadge = (level: 'read' | 'manage') => {
    return level === 'manage' ? (
      <Badge className="bg-red-500">
        <ShieldCheck className="h-3 w-3 mr-1" />
        管理
      </Badge>
    ) : (
      <Badge className="bg-blue-500">
        <Shield className="h-3 w-3 mr-1" />
        只读
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
            用户权限管理
          </CardTitle>
          <CardDescription>
            为用户 {username} 配置集群和命名空间的访问权限
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {permissions?.cluster_permissions.length || 0}
              </div>
              <div className="text-sm text-muted-foreground">集群权限</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {permissions?.namespace_permissions.length || 0}
              </div>
              <div className="text-sm text-muted-foreground">命名空间权限</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 集群权限 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>集群权限</CardTitle>
              <CardDescription>用户可以访问的集群及权限等级</CardDescription>
            </div>
            <Button onClick={() => setIsClusterDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              授权集群
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {permissions?.cluster_permissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>暂无集群权限</p>
              <p className="text-sm">点击上方按钮为用户授权集群访问权限</p>
            </div>
          ) : (
            <div className="space-y-4">
              {permissions?.cluster_permissions.map((perm) => (
                <div key={perm.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="font-medium">{perm.cluster_name || `集群 ${perm.cluster_id}`}</div>
                      <div className="text-sm text-muted-foreground">
                        创建时间: {new Date(perm.created_at).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getPermissionBadge(perm.permission_level)}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPermissionToDelete({ type: 'cluster', id: perm.id });
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
              <CardTitle>命名空间权限</CardTitle>
              <CardDescription>用户可以访问的命名空间及权限等级</CardDescription>
            </div>
            <Button onClick={() => setIsNamespaceDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              授权命名空间
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {permissions?.namespace_permissions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p>暂无命名空间权限</p>
              <p className="text-sm">点击上方按钮为用户授权命名空间访问权限</p>
            </div>
          ) : (
            <div className="space-y-4">
              {permissions?.namespace_permissions.map((perm) => (
                <div key={perm.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center space-x-4">
                    <div>
                      <div className="font-medium">{perm.namespace}</div>
                      <div className="text-sm text-muted-foreground">
                        集群: {perm.cluster_name || `集群 ${perm.cluster_id}`} |
                        创建时间: {new Date(perm.created_at).toLocaleString('zh-CN')}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    {getPermissionBadge(perm.permission_level)}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPermissionToDelete({ type: 'namespace', id: perm.id });
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
            <DialogTitle>授权集群权限</DialogTitle>
            <DialogDescription>
              为用户 {username} 授权访问指定集群的权限
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cluster-select">选择集群 *</Label>
              <Select value={selectedClusterId.toString()} onValueChange={(value) => setSelectedClusterId(Number(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择集群" />
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
              <Label htmlFor="cluster-permission">权限等级 *</Label>
              <Select value={clusterPermissionLevel} onValueChange={(value: 'read' | 'manage') => setClusterPermissionLevel(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">只读 - 可以查看资源信息</SelectItem>
                  <SelectItem value="manage">管理 - 可以修改和删除资源</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsClusterDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleGrantClusterPermission} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                授权
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 命名空间权限授权对话框 */}
      <Dialog open={isNamespaceDialogOpen} onOpenChange={setIsNamespaceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>授权命名空间权限</DialogTitle>
            <DialogDescription>
              为用户 {username} 授权访问指定命名空间的权限
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ns-cluster-select">选择集群 *</Label>
              <Select value={selectedClusterId.toString()} onValueChange={(value) => setSelectedClusterId(Number(value))}>
                <SelectTrigger>
                  <SelectValue placeholder="请选择集群" />
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
              <Label htmlFor="namespace-name">命名空间名称 *</Label>
              <Input
                id="namespace-name"
                value={namespaceName}
                onChange={(e) => setNamespaceName(e.target.value)}
                placeholder="请输入命名空间名称"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ns-permission">权限等级 *</Label>
              <Select value={namespacePermissionLevel} onValueChange={(value: 'read' | 'manage') => setNamespacePermissionLevel(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="read">只读 - 可以查看资源信息</SelectItem>
                  <SelectItem value="manage">管理 - 可以修改和删除资源</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsNamespaceDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleGrantNamespacePermission} disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                授权
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="确认撤销权限"
        description={`确定要撤销用户的${permissionToDelete?.type === 'cluster' ? '集群' : '命名空间'}权限吗？此操作无法撤销。`}
        onConfirm={handleDeletePermission}
        confirmText="撤销权限"
      />
    </div>
  );
}
