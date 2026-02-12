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
import { canManageRBAC } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useTranslations } from "@/hooks/use-translations";

export default function RBACPage() {
  const t = useTranslations("rbac");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const { user: currentUser, isLoading: authLoading } = useAuth();
  const { activeCluster: selectedCluster } = useCluster();

  // 权限状态
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [permissionErrorShown, setPermissionErrorShown] = useState(false);

  // 权限检查将在useEffect中处理

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
    if (authLoading) {
      setIsAuthorized(null);
      return;
    }

    if (!currentUser || !canManageRBAC(currentUser)) {
      setIsAuthorized(false);
      if (!permissionErrorShown) {
        toast.error(t("adminRequired"));
        setPermissionErrorShown(true);
      }
      router.push("/");
      return;
    }

    setIsAuthorized(true);
    setPermissionErrorShown(false); // 重置错误状态
    if (selectedCluster) {
      fetchAllData();
    }
  }, [authLoading, currentUser, selectedCluster, router, permissionErrorShown]);

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
        toast.error(response.error || t("loadRolesError"));
      }
    } catch (error) {
      toast.error(t("loadRolesError"));
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
        toast.error(response.error || t("loadRoleBindingsError"));
      }
    } catch (error) {
      toast.error(t("loadRoleBindingsError"));
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
        toast.error(response.error || t("loadServiceAccountsError"));
      }
    } catch (error) {
      toast.error(t("loadServiceAccountsError"));
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
        toast.error(response.error || t("loadClusterRolesError"));
      }
    } catch (error) {
      toast.error(t("loadClusterRolesError"));
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
        toast.error(response.error || t("loadClusterRoleBindingsError"));
      }
    } catch (error) {
      toast.error(t("loadClusterRoleBindingsError"));
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
        toast.success(t("deleteSuccess"));
        setDeleteDialog({ open: false, type: null, namespace: '', name: '' });
        fetchAllData();
      }
    } catch (error) {
      toast.error(t("deleteError"));
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

  if (authLoading || isAuthorized === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (isAuthorized === false) {
    return null; // 权限检查失败，已在useEffect中处理导航
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
              <h1 className="text-3xl font-bold">{t("title")}</h1>
              <p className="text-muted-foreground">{t("description")}</p>
            </div>
          </div>
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                {t("selectClusterFirst")}
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
            <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground">
              {t("descriptionWithCluster", { cluster: selectedCluster.name })}
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
                  {t("rolesDescription")}
                </CardDescription>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("searchRoles")}
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
                    {t("noRoles")}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("nameLabel")}</TableHead>
                        <TableHead>{t("namespaceLabel")}</TableHead>
                        <TableHead>{t("rulesCountLabel")}</TableHead>
                        <TableHead>{t("createdAtLabel")}</TableHead>
                        <TableHead className="text-right">{tCommon("actions")}</TableHead>
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
                  {t("roleBindingsDescription")}
                </CardDescription>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("searchRoleBindings")}
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
                    {t("noRoleBindings")}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("nameLabel")}</TableHead>
                        <TableHead>{t("namespaceLabel")}</TableHead>
                        <TableHead>{t("roleLabel")}</TableHead>
                        <TableHead>{t("subjectsCountLabel")}</TableHead>
                        <TableHead>{t("createdAtLabel")}</TableHead>
                        <TableHead className="text-right">{tCommon("actions")}</TableHead>
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
                  {t("serviceAccountsDescription")}
                </CardDescription>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("searchServiceAccounts")}
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
                    {t("noServiceAccounts")}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("nameLabel")}</TableHead>
                        <TableHead>{t("namespaceLabel")}</TableHead>
                        <TableHead>{t("secretsCountLabel")}</TableHead>
                        <TableHead>{t("createdAtLabel")}</TableHead>
                        <TableHead className="text-right">{tCommon("actions")}</TableHead>
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
                  {t("clusterRolesDescription")}
                </CardDescription>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("searchClusterRoles")}
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
                    {t("noClusterRoles")}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("nameLabel")}</TableHead>
                        <TableHead>{t("rulesCountLabel")}</TableHead>
                        <TableHead>{t("createdAtLabel")}</TableHead>
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
                  {t("clusterRoleBindingsDescription")}
                </CardDescription>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("searchClusterRoleBindings")}
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
                    {t("noClusterRoleBindings")}
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("nameLabel")}</TableHead>
                        <TableHead>{t("roleLabel")}</TableHead>
                        <TableHead>{t("subjectsCountLabel")}</TableHead>
                        <TableHead>{t("createdAtLabel")}</TableHead>
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
          title={t("confirmDeleteTitle")}
          description={t("confirmDeleteDescription", {
            type:
              deleteDialog.type === "role"
                ? "Role"
                : deleteDialog.type === "roleBinding"
                ? "RoleBinding"
                : "ServiceAccount",
            name: deleteDialog.name,
          })}
          onConfirm={handleDelete}
          confirmText={tCommon("delete")}
        />
      </div>
    </div>
  );
}
