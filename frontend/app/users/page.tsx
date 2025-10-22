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
  ArrowLeft, 
  Plus, 
  Search, 
  Pencil, 
  Trash2, 
  Loader2,
  ShieldCheck,
  User as UserIcon,
  Eye,
  CheckCircle,
  XCircle
} from "lucide-react";
import { userApi, User, UserCreateData, UserUpdateData } from "@/lib/api";
import UserForm from "@/components/UserForm";
import UserPermissions from "@/components/UserPermissions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth-context";

export default function UsersPage() {
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

  useEffect(() => {
    if (!authLoading) {
      if (!currentUser || currentUser.role !== "admin") {
        if (!permissionErrorShown) {
          toast.error("需要管理员权限");
          setPermissionErrorShown(true);
        }
        router.push("/");
        return;
      }
      setPermissionErrorShown(false); // 重置错误状态
      fetchUsers();
    }
  }, [authLoading, currentUser, page, searchTerm, roleFilter, statusFilter, router, permissionErrorShown]);

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
        toast.error(response.error || "获取用户列表失败");
      }
    } catch (error) {
      toast.error("获取用户列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUser = async (data: UserCreateData | UserUpdateData) => {
    setIsSubmitting(true);
    try {
      const response = await userApi.createUser(data as UserCreateData);
      if (response.data) {
        toast.success("用户创建成功");
        setIsCreateDialogOpen(false);
        fetchUsers();
      } else {
        toast.error(response.error || "创建用户失败");
      }
    } catch (error) {
      toast.error("创建用户失败");
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
        toast.success("用户更新成功");
        setIsEditDialogOpen(false);
        setSelectedUser(null);
        fetchUsers();
      } else {
        toast.error(response.error || "更新用户失败");
      }
    } catch (error) {
      toast.error("更新用户失败");
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
        toast.success("用户删除成功");
        setIsDeleteDialogOpen(false);
        setUserToDelete(null);
        fetchUsers();
      }
    } catch (error) {
      toast.error("删除用户失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "admin":
        return <Badge className="bg-red-500"><ShieldCheck className="h-3 w-3 mr-1" />管理员</Badge>;
      case "user":
        return <Badge className="bg-blue-500"><UserIcon className="h-3 w-3 mr-1" />用户</Badge>;
      case "viewer":
        return <Badge className="bg-gray-500"><Eye className="h-3 w-3 mr-1" />只读</Badge>;
      default:
        return <Badge>{role}</Badge>;
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => router.push("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">用户管理</h1>
              <p className="text-muted-foreground">管理系统用户和权限</p>
            </div>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            创建用户
          </Button>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>筛选条件</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索用户名或邮箱..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="所有角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有角色</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                  <SelectItem value="user">用户</SelectItem>
                  <SelectItem value="viewer">只读用户</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="所有状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有状态</SelectItem>
                  <SelectItem value="active">活跃</SelectItem>
                  <SelectItem value="inactive">停用</SelectItem>
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
                重置筛选
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>用户列表</CardTitle>
            <CardDescription>共 {total} 个用户</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无用户数据
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户名</TableHead>
                      <TableHead>邮箱</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>最后登录</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.email || "-"}</TableCell>
                        <TableCell>{getRoleBadge(user.role)}</TableCell>
                        <TableCell>
                          {user.is_active ? (
                            <Badge variant="outline" className="text-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              活跃
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-gray-600">
                              <XCircle className="h-3 w-3 mr-1" />
                              停用
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.last_login
                            ? new Date(user.last_login).toLocaleString("zh-CN")
                            : "-"}
                        </TableCell>
                        <TableCell>
                          {new Date(user.created_at).toLocaleString("zh-CN")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedUser(user);
                                setIsPermissionsDialogOpen(true);
                              }}
                            >
                              <ShieldCheck className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setUserToDelete(user);
                                setIsDeleteDialogOpen(true);
                              }}
                              disabled={user.id === currentUser?.id}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      第 {page} 页，共 {totalPages} 页
                    </p>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                      >
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page + 1)}
                        disabled={page === totalPages}
                      >
                        下一页
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
            <DialogTitle>创建新用户</DialogTitle>
            <DialogDescription>填写用户信息以创建新用户</DialogDescription>
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
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>修改用户信息</DialogDescription>
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
            <DialogTitle>用户权限管理</DialogTitle>
            <DialogDescription>
              {selectedUser && `管理用户 ${selectedUser.username} 的访问权限`}
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <UserPermissions
              userId={selectedUser.id}
              username={selectedUser.username}
              onPermissionsChange={() => {
                // 可以在这里添加权限变更后的回调逻辑
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="确认删除"
        description={`确定要删除用户 "${userToDelete?.username}" 吗？此操作无法撤销。`}
        onConfirm={handleDeleteUser}
        confirmText="删除"
      />
    </div>
  );
} 