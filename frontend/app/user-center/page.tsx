"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, User as UserIcon, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { userApi } from "@/lib/api";
import AdminUserManagement from "@/components/admin/AdminUserManagement";

export default function UserCenterPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  const isAdmin = user.role === "admin";

  const onChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== newPassword2) {
      toast.error("两次输入的新密码不一致");
      return;
    }
    setSaving(true);
    try {
      const resp = await userApi.changePassword(user.id, {
        current_password: currentPassword,
        new_password: newPassword,
      });
      if (resp.data) {
        toast.success("密码修改成功");
        setCurrentPassword("");
        setNewPassword("");
        setNewPassword2("");
      } else {
        toast.error(resp.error || "密码修改失败");
      }
    } catch {
      toast.error("网络错误，请检查后端服务");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <UserIcon className="h-7 w-7 mr-2" />
                用户中心
              </h1>
              <p className="text-muted-foreground">
                当前账号：{user.username}（{isAdmin ? "管理员" : user.role === "viewer" ? "只读用户" : "用户"}）
              </p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>修改我的密码</CardTitle>
            <CardDescription>为保证安全，请输入当前密码</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4 max-w-md" onSubmit={onChangeMyPassword}>
              <div className="space-y-2">
                <Label htmlFor="currentPassword">当前密码</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">新密码</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="至少6位"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword2">确认新密码</Label>
                <Input
                  id="newPassword2"
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? "保存中..." : "保存"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <ShieldCheck className="h-5 w-5 mr-2" />
                管理员：用户与权限管理
              </CardTitle>
              <CardDescription>可修改所有用户的密码（编辑用户时设置新密码）和权限</CardDescription>
            </CardHeader>
            <CardContent>
              <AdminUserManagement embedded={true} showHeader={false} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}


