"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  ArrowLeft,
  Search,
  Trash2,
  Loader2,
  Shield,
  Eye,
  KeyRound,
} from "lucide-react";
import { rbacApi, Role, RoleBinding, ServiceAccount, ClusterRole, ClusterRoleBinding } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function RBACPage() {
  const router = useRouter();
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const { selectedCluster } = useCluster();

  // Roles
  const [roles, setRoles] = useState<Role[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesSearch, setRolesSearch] = useState("");
  
  // RoleBindings
  const [roleBindings, setRoleBindings] = useState<RoleBinding[]>([]);
  const [roleBindingsLoading, setRoleBindingsLoading] = useState(true);
  const [roleBindingsSearch, setRoleBindingsSearch] = useState("");
  
  // ServiceAccounts
  const [serviceAccounts, setServiceAccounts] = useState<ServiceAccount[]>([]);
  const [serviceAccountsLoading, setServiceAccountsLoading] = useState(true);
  const [serviceAccountsSearch, setServiceAccountsSearch] = useState("");
  
  // ClusterRoles
  const [clusterRoles, setClusterRoles] = useState<ClusterRole[]>([]);
  const [clusterRolesLoading, setClusterRolesLoading] = useState(true);
  const [clusterRolesSearch, setClusterRolesSearch] = useState("");
  
  // ClusterRoleBindings
  const [clusterRoleBindings, setClusterRoleBindings] = useState<ClusterRoleBinding[]>([]);
  const [clusterRoleBindingsLoading, setClusterRoleBindingsLoading] = useState(true);
  const [clusterRoleBindingsSearch, setClusterRoleBindingsSearch] = useState("");

  // 删除对话框
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    type: 'role' | 'roleBinding' | 'serviceAccount' | null;
    namespace: string;
    name: string;
  }>({ open: false, type: null, namespace: '', name: '' });
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!authLoading && (!currentUser || currentUser.role !== "admin")) {
      toast.error("需要管理员权限");
      router.push("/");
      return;
    }

    if (selectedCluster) {
      fetchAllData();
    }
  }, [authLoading, currentUser, selectedCluster, router]);

  const fetchAllData = async () => {
    if (!selectedCluster) return;
    fetchRoles();
    fetchRoleBindings();
    fetchServiceAccounts();
    fetchClusterRoles();
    fetchClusterRoleBindings();
  };

  const fetchRoles = async () => {
    if (!selectedCluster) return;
    setRolesLoading(true);
    try {
      const response = await rbacApi.getRoles(selectedCluster.id);
      if (response.data) {
        setRoles(response.data.roles);
      } else {
        toast.error(response.error || "获取Roles失败");
      }
    } catch (error) {
      toast.error("获取Roles失败");
    } finally {
      setRolesLoading(false);
    }
  };

  const fetchRoleBindings = async () => {
    if (!selectedCluster) return;
    setRoleBindingsLoading(true);
    try {
      const response = await rbacApi.getRoleBindings(selectedCluster.id);
      if (response.data) {
        setRoleBindings(response.data.role_bindings);
      } else {
        toast.error(response.error || "获取RoleBindings失败");
      }
    } catch (error) {
      toast.error("获取RoleBindings失败");
    } finally {
      setRoleBindingsLoading(false);
    }
  };

  const fetchServiceAccounts = async () => {
    if (!selectedCluster) return;
    setServiceAccountsLoading(true);
    try {
      const response = await rbacApi.getServiceAccounts(selectedCluster.id);
      if (response.data) {
        setServiceAccounts(response.data.service_accounts);
      } else {
        toast.error(response.error || "获取ServiceAccounts失败");
      }
    } catch (error) {
      toast.error("获取ServiceAccounts失败");
    } finally {
      setServiceAccountsLoading(false);
    }
  };

  const fetchClusterRoles = async () => {
    if (!selectedCluster) return;
    setClusterRolesLoading(true);
    try {
      const response = await rbacApi.getClusterRoles(selectedCluster.id);
      if (response.data) {
        setClusterRoles(response.data.cluster_roles);
      } else {
        toast.error(response.error || "获取ClusterRoles失败");
      }
    } catch (error) {
      toast.error("获取ClusterRoles失败");
    } finally {
      setClusterRolesLoading(false);
    }
  };

  const fetchClusterRoleBindings = async () => {
    if (!selectedCluster) return;
    setClusterRoleBindingsLoading(true);
    try {
      const response = await rbacApi.getClusterRoleBindings(selectedCluster.id);
      if (response.data) {
        setClusterRoleBindings(response.data.cluster_role_bindings);
      } else {
        toast.error(response.error || "获取ClusterRoleBindings失败");
      }
    } catch (error) {
      toast.error("获取ClusterRoleBindings失败");
    } finally {
      setClusterRoleBindingsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCluster || !deleteDialog.type) return;
    setIsDeleting(true);
    try {
      let response;
      switch (deleteDialog.type) {
        case 'role':
          response = await rbacApi.deleteRole(selectedCluster.id, deleteDialog.namespace, deleteDialog.name);
          break;
        case 'roleBinding':
          response = await rbacApi.deleteRoleBinding(selectedCluster.id, deleteDialog.namespace, deleteDialog.name);
          break;
        case 'serviceAccount':
          response = await rbacApi.deleteServiceAccount(selectedCluster.id, deleteDialog.namespace, deleteDialog.name);
          break;
      }

      if (response?.error) {
        toast.error(response.error);
      } else {
        toast.success("删除成功");
        setDeleteDialog({ open: false, type: null, namespace: '', name: '' });
        fetchAllData();
      }
    } catch (error) {
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredRoles = roles.filter(r => 
    r.name.toLowerCase().includes(rolesSearch.toLowerCase()) ||
    r.namespace.toLowerCase().includes(rolesSearch.toLowerCase())
  );

  const filteredRoleBindings = roleBindings.filter(rb => 
    rb.name.toLowerCase().includes(roleBindingsSearch.toLowerCase()) ||
    rb.namespace.toLowerCase().includes(roleBindingsSearch.toLowerCase())
  );

  const filteredServiceAccounts = serviceAccounts.filter(sa => 
    sa.name.toLowerCase().includes(serviceAccountsSearch.toLowerCase()) ||
    sa.namespace.toLowerCase().includes(serviceAccountsSearch.toLowerCase())
  );

  const filteredClusterRoles = clusterRoles.filter(cr => 
    cr.name.toLowerCase().includes(clusterRolesSearch.toLowerCase())
  );

  const filteredClusterRoleBindings = clusterRoleBindings.filter(crb => 
    crb.name.toLowerCase().includes(clusterRoleBindingsSearch.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!selectedCluster) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center space-x-4 mb-6">
            <Button variant="ghost" onClick={() => router.push("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">RBAC权限管理</h1>
              <p className="text-muted-foreground">管理Kubernetes RBAC资源</p>
            </div>
          </div>
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                请先选择一个集群
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center space-x-4 mb-6">
          <Button variant="ghost" onClick={() => router.push("/")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">RBAC权限管理</h1>
            <p className="text-muted-foreground">
              管理Kubernetes RBAC资源 - {selectedCluster.name}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="roles" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="roles">
              <Shield className="h-4 w-4 mr-2" />
              Roles ({filteredRoles.length})
            </TabsTrigger>
            <TabsTrigger value="rolebindings">
              <KeyRound className="h-4 w-4 mr-2" />
              RoleBindings ({filteredRoleBindings.length})
            </TabsTrigger>
            <TabsTrigger value="serviceaccounts">
              <Eye className="h-4 w-4 mr-2" />
              ServiceAccounts ({filteredServiceAccounts.length})
            </TabsTrigger>
            <TabsTrigger value="clusterroles">
              <Shield className="h-4 w-4 mr-2" />
              ClusterRoles ({filteredClusterRoles.length})
            </TabsTrigger>
            <TabsTrigger value="clusterrolebindings">
              <KeyRound className="h-4 w-4 mr-2" />
              ClusterRoleBindings ({filteredClusterRoleBindings.length})
            </TabsTrigger>
          </TabsList>

          {/* Roles Tab */}
          <TabsContent value="roles">
            <Card>
              <CardHeader>
                <CardTitle>Roles</CardTitle>
                <CardDescription>
                  命名空间级别的角色定义
                </CardDescription>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索Roles..."
                    value={rolesSearch}
                    onChange={(e) => setRolesSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {rolesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : filteredRoles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    暂无Roles
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>命名空间</TableHead>
                        <TableHead>规则数</TableHead>
                        <TableHead>创建时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRoles.map((role) => (
                        <TableRow key={`${role.namespace}/${role.name}`}>
                          <TableCell className="font-medium">{role.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{role.namespace}</Badge>
                          </TableCell>
                          <TableCell>{role.rules?.length || 0}</TableCell>
                          <TableCell className="text-xs">
                            {new Date(role.creation_timestamp).toLocaleString("zh-CN")}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteDialog({
                                open: true,
                                type: 'role',
                                namespace: role.namespace,
                                name: role.name
                              })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* RoleBindings Tab */}
          <TabsContent value="rolebindings">
            <Card>
              <CardHeader>
                <CardTitle>RoleBindings</CardTitle>
                <CardDescription>
                  将角色绑定到用户或ServiceAccount
                </CardDescription>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索RoleBindings..."
                    value={roleBindingsSearch}
                    onChange={(e) => setRoleBindingsSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {roleBindingsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : filteredRoleBindings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    暂无RoleBindings
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>命名空间</TableHead>
                        <TableHead>角色</TableHead>
                        <TableHead>主体数</TableHead>
                        <TableHead>创建时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRoleBindings.map((rb) => (
                        <TableRow key={`${rb.namespace}/${rb.name}`}>
                          <TableCell className="font-medium">{rb.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{rb.namespace}</Badge>
                          </TableCell>
                          <TableCell>
                            {rb.role_ref ? (
                              <Badge variant="secondary">
                                {rb.role_ref.kind}: {rb.role_ref.name}
                              </Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell>{rb.subjects?.length || 0}</TableCell>
                          <TableCell className="text-xs">
                            {new Date(rb.creation_timestamp).toLocaleString("zh-CN")}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteDialog({
                                open: true,
                                type: 'roleBinding',
                                namespace: rb.namespace,
                                name: rb.name
                              })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ServiceAccounts Tab */}
          <TabsContent value="serviceaccounts">
            <Card>
              <CardHeader>
                <CardTitle>ServiceAccounts</CardTitle>
                <CardDescription>
                  Pod运行时使用的服务账号
                </CardDescription>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索ServiceAccounts..."
                    value={serviceAccountsSearch}
                    onChange={(e) => setServiceAccountsSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {serviceAccountsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : filteredServiceAccounts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    暂无ServiceAccounts
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>命名空间</TableHead>
                        <TableHead>Secrets数</TableHead>
                        <TableHead>创建时间</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredServiceAccounts.map((sa) => (
                        <TableRow key={`${sa.namespace}/${sa.name}`}>
                          <TableCell className="font-medium">{sa.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{sa.namespace}</Badge>
                          </TableCell>
                          <TableCell>{sa.secrets?.length || 0}</TableCell>
                          <TableCell className="text-xs">
                            {new Date(sa.creation_timestamp).toLocaleString("zh-CN")}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteDialog({
                                open: true,
                                type: 'serviceAccount',
                                namespace: sa.namespace,
                                name: sa.name
                              })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ClusterRoles Tab */}
          <TabsContent value="clusterroles">
            <Card>
              <CardHeader>
                <CardTitle>ClusterRoles</CardTitle>
                <CardDescription>
                  集群级别的角色定义（只读）
                </CardDescription>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索ClusterRoles..."
                    value={clusterRolesSearch}
                    onChange={(e) => setClusterRolesSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {clusterRolesLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : filteredClusterRoles.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    暂无ClusterRoles
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>规则数</TableHead>
                        <TableHead>创建时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClusterRoles.map((cr) => (
                        <TableRow key={cr.name}>
                          <TableCell className="font-medium">{cr.name}</TableCell>
                          <TableCell>{cr.rules?.length || 0}</TableCell>
                          <TableCell className="text-xs">
                            {new Date(cr.creation_timestamp).toLocaleString("zh-CN")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ClusterRoleBindings Tab */}
          <TabsContent value="clusterrolebindings">
            <Card>
              <CardHeader>
                <CardTitle>ClusterRoleBindings</CardTitle>
                <CardDescription>
                  集群级别的角色绑定（只读）
                </CardDescription>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜索ClusterRoleBindings..."
                    value={clusterRoleBindingsSearch}
                    onChange={(e) => setClusterRoleBindingsSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </CardHeader>
              <CardContent>
                {clusterRoleBindingsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin" />
                  </div>
                ) : filteredClusterRoleBindings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    暂无ClusterRoleBindings
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>名称</TableHead>
                        <TableHead>角色</TableHead>
                        <TableHead>主体数</TableHead>
                        <TableHead>创建时间</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredClusterRoleBindings.map((crb) => (
                        <TableRow key={crb.name}>
                          <TableCell className="font-medium">{crb.name}</TableCell>
                          <TableCell>
                            {crb.role_ref ? (
                              <Badge variant="secondary">
                                {crb.role_ref.kind}: {crb.role_ref.name}
                              </Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell>{crb.subjects?.length || 0}</TableCell>
                          <TableCell className="text-xs">
                            {new Date(crb.creation_timestamp).toLocaleString("zh-CN")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={deleteDialog.open}
          onOpenChange={(open) => !open && setDeleteDialog({ open: false, type: null, namespace: '', name: '' })}
          title="确认删除"
          description={`确定要删除 ${deleteDialog.type === 'role' ? 'Role' : deleteDialog.type === 'roleBinding' ? 'RoleBinding' : 'ServiceAccount'} "${deleteDialog.name}" 吗？此操作无法撤销。`}
          onConfirm={handleDelete}
          confirmText="删除"
          isLoading={isDeleting}
        />
      </div>
    </div>
  );
}
