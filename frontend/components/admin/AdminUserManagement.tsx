"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Input } from "@/components/ui/input";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { Badge } from "@/components/ui/badge";

import { toast } from "sonner";

import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Loader2,
  ShieldCheck,
  User as UserIcon,
  Eye,
  CheckCircle,
  XCircle,
} from "lucide-react";

import { userApi, type User, type UserCreateData, type UserUpdateData } from "@/lib/api";

import UserForm from "@/components/UserForm";

import UserPermissions from "@/components/UserPermissions";

import { ConfirmDialog } from "@/components/ConfirmDialog";

import { useAuth } from "@/lib/auth-context";

import { useTranslations } from "@/hooks/use-translations";

import { useLanguage } from "@/lib/language-context";

export default function AdminUserManagement({
  embedded = false,

  showHeader = true,
}: {
  embedded?: boolean;

  showHeader?: boolean;
}) {
  const t = useTranslations("adminUsers");

  const tCommon = useTranslations("common");

  const { locale } = useLanguage();

  const router = useRouter();

  const { user: currentUser, isLoading: authLoading } = useAuth();

  const [users, setUsers] = useState<User[]>([]);

  const [total, setTotal] = useState(0);

  const [isLoading, setIsLoading] = useState(true);

  const [page, setPage] = useState(1);

  const [pageSize] = useState(20);

  // 筛选条件

  const [searchTerm, setSearchTerm] = useState("");

  const [roleFilter, setRoleFilter] = useState<string>("all");

  const [statusFilter, setStatusFilter] = useState<string>("all");

  // 对话框状态

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [isPermissionsDialogOpen, setIsPermissionsDialogOpen] = useState(false);

  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const [userToDelete, setUserToDelete] = useState<User | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [permissionErrorShown, setPermissionErrorShown] = useState(false);

  const localeTag = locale === "zh" ? "zh-CN" : "en-US";

  const formatDateTime = (value?: string | null) => {
    if (!value) return t("emptyValue");

    return new Date(value).toLocaleString(localeTag);
  };

  useEffect(() => {
    if (!authLoading) {
      if (!currentUser || currentUser.role !== "admin") {
        if (!permissionErrorShown) {
          toast.error(t("adminRequired"));

          setPermissionErrorShown(true);
        }

        router.push("/");

        return;
      }

      setPermissionErrorShown(false);

      fetchUsers();
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    authLoading,

    currentUser,

    page,

    searchTerm,

    roleFilter,

    statusFilter,

    router,

    permissionErrorShown,
  ]);

  const fetchUsers = async () => {
    setIsLoading(true);

    try {
      const params: any = { page, page_size: pageSize };

      if (searchTerm) params.search = searchTerm;

      if (roleFilter && roleFilter !== "all") params.role = roleFilter;

      if (statusFilter && statusFilter !== "all") params.is_active = statusFilter === "active";

      const response = await userApi.getUsers(params);

      if (response.data) {
        setUsers(response.data.users);

        setTotal(response.data.total);
      } else {
        toast.error(response.error || t("loadUsersFailed"));
      }
    } catch {
      toast.error(t("loadUsersFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (data: UserCreateData | UserUpdateData) => {
    setIsSubmitting(true);

    try {
      const response = await userApi.createUser(data as UserCreateData);

      if (response.data) {
        toast.success(t("createUserSuccess"));

        setIsCreateDialogOpen(false);

        fetchUsers();
      } else {
        toast.error(response.error || t("createUserFailed"));
      }
    } catch {
      toast.error(t("createUserFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditUser = async (data: UserCreateData | UserUpdateData) => {
    if (!selectedUser) return;

    setIsSubmitting(true);

    try {
      const response = await userApi.updateUser(selectedUser.id, data as UserUpdateData);

      if (response.data) {
        toast.success(t("updateUserSuccess"));

        setIsEditDialogOpen(false);

        setSelectedUser(null);

        fetchUsers();
      } else {
        toast.error(response.error || t("updateUserFailed"));
      }
    } catch {
      toast.error(t("updateUserFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    setIsSubmitting(true);

    try {
      const response = await userApi.deleteUser(userToDelete.id);

      if (response.error) {
        toast.error(response.error);
      } else {
        toast.success(t("deleteUserSuccess"));

        setIsDeleteDialogOpen(false);

        setUserToDelete(null);

        fetchUsers();
      }
    } catch {
      toast.error(t("deleteUserFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return (
          <Badge className="bg-red-500">
            <ShieldCheck className="h-3 w-3 mr-1" />

            {t("roleAdmin")}
          </Badge>
        );

      case "user":
        return (
          <Badge className="bg-blue-500">
            <UserIcon className="h-3 w-3 mr-1" />

            {t("roleUser")}
          </Badge>
        );

      case "viewer":
        return (
          <Badge className="bg-gray-500">
            <Eye className="h-3 w-3 mr-1" />

            {t("roleViewer")}
          </Badge>
        );

      default:
        return <Badge>{role}</Badge>;
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  if (authLoading) {
    return (
      <div
        className={
          embedded ? "flex justify-center py-8" : "min-h-screen flex items-center justify-center"
        }
      >
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "min-h-screen bg-background p-8"}>
      <div className={embedded ? "" : "max-w-7xl mx-auto"}>
        {showHeader && (
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">{t("title")}</h1>

              <p className="text-muted-foreground">{t("description")}</p>
            </div>

            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />

              {t("createUser")}
            </Button>
          </div>
        )}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t("filtersTitle")}</CardTitle>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />

                <Input
                  placeholder={t("searchPlaceholder")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t("allRoles")} />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">{t("allRoles")}</SelectItem>

                  <SelectItem value="admin">{t("roleAdmin")}</SelectItem>

                  <SelectItem value="user">{t("roleUser")}</SelectItem>

                  <SelectItem value="viewer">{t("roleViewerLong")}</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder={t("allStatuses")} />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="all">{t("allStatuses")}</SelectItem>

                  <SelectItem value="active">{tCommon("active")}</SelectItem>

                  <SelectItem value="inactive">{tCommon("inactive")}</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm("");

                  setRoleFilter("all");

                  setStatusFilter("all");

                  setPage(1);
                }}
              >
                {t("resetFilters")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("listTitle")}</CardTitle>

            <CardDescription>{t("totalUsers", { total })}</CardDescription>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t("noUsersData")}</div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("tableUsername")}</TableHead>

                      <TableHead>{t("tableEmail")}</TableHead>

                      <TableHead>{t("tableRole")}</TableHead>

                      <TableHead>{t("tableStatus")}</TableHead>

                      <TableHead>{t("tableLastLogin")}</TableHead>

                      <TableHead>{t("tableCreatedAt")}</TableHead>

                      <TableHead className="text-right">{t("tableActions")}</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.username}</TableCell>

                        <TableCell>{u.email || t("emptyValue")}</TableCell>

                        <TableCell>{getRoleBadge(u.role)}</TableCell>

                        <TableCell>
                          {u.is_active ? (
                            <Badge variant="outline" className="text-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />

                              {tCommon("active")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-600">
                              <XCircle className="h-3 w-3 mr-1" />

                              {tCommon("inactive")}
                            </Badge>
                          )}
                        </TableCell>

                        <TableCell>{formatDateTime(u.last_login)}</TableCell>

                        <TableCell>{formatDateTime(u.created_at)}</TableCell>

                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t("editUserAction")}
                              title={t("editUserAction")}
                              onClick={() => {
                                setSelectedUser(u);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t("managePermissionsAction")}
                              title={t("managePermissionsAction")}
                              onClick={() => {
                                setSelectedUser(u);
                                setIsPermissionsDialogOpen(true);
                              }}
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              aria-label={t("deleteUserAction")}
                              title={t("deleteUserAction")}
                              onClick={() => {
                                setUserToDelete(u);
                                setIsDeleteDialogOpen(true);
                              }}
                              disabled={u.id === currentUser?.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      {t("pageSummary", { page, totalPages })}
                    </p>

                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                      >
                        {t("previousPage")}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page + 1)}
                        disabled={page === totalPages}
                      >
                        {t("nextPage")}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create User Dialog */}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createDialogTitle")}</DialogTitle>

            <DialogDescription>{t("createDialogDescription")}</DialogDescription>
          </DialogHeader>

          <UserForm
            onSubmit={handleCreateUser}
            onCancel={() => setIsCreateDialogOpen(false)}
            isLoading={isSubmitting}
          />
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editDialogTitle")}</DialogTitle>

            <DialogDescription>{t("editDialogDescription")}</DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <UserForm
              user={selectedUser}
              onSubmit={handleEditUser}
              onCancel={() => {
                setIsEditDialogOpen(false);

                setSelectedUser(null);
              }}
              isLoading={isSubmitting}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* User Permissions Dialog */}

      <Dialog open={isPermissionsDialogOpen} onOpenChange={setIsPermissionsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("permissionsDialogTitle")}</DialogTitle>

            <DialogDescription>
              {selectedUser &&
                t("permissionsDialogDescription", { username: selectedUser.username })}
            </DialogDescription>
          </DialogHeader>

          {selectedUser && (
            <UserPermissions
              userId={selectedUser.id}
              username={selectedUser.username}
              onPermissionsChange={() => {
                // no-op
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}

      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title={t("deleteDialogTitle")}
        description={t("deleteDialogDescription", { username: userToDelete?.username ?? "" })}
        onConfirm={handleDeleteUser}
        confirmText={t("deleteConfirmText")}
      />
    </div>
  );
}
