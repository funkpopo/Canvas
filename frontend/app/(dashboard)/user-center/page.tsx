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
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";

export default function UserCenterPage() {
  const t = useTranslations("userCenter");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
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
  const roleLabel = isAdmin ? t("roleAdmin") : user.role === "viewer" ? t("roleViewer") : t("roleUser");

  const onChangeMyPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== newPassword2) {
      toast.error(t("passwordMismatch"));
      return;
    }

    setSaving(true);
    try {
      await runWithFeedback(
        async () => {
          const resp = await userApi.changePassword(user.id, {
            current_password: currentPassword,
            new_password: newPassword,
          });

          if (!resp.data) {
            throw new Error(resp.error || t("changePasswordErrorUnknown"));
          }

          setCurrentPassword("");
          setNewPassword("");
          setNewPassword2("");
        },
        {
          loading: t("changePasswordLoading"),
          success: t("changePasswordSuccess"),
          error: t("changePasswordError"),
        }
      );
    } catch (error) {
      console.error("change password failed:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              asChild
              aria-label={tCommon("backToDashboard")}
              title={tCommon("backToDashboard")}
            >
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-3xl font-bold flex items-center">
                <UserIcon className="h-7 w-7 mr-2" />
                {t("title")}
              </h1>
              <p className="text-muted-foreground">{t("accountRole", { username: user.username, role: roleLabel })}</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("passwordCardTitle")}</CardTitle>
            <CardDescription>{t("passwordCardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4 max-w-md" onSubmit={onChangeMyPassword}>
              <div className="space-y-2">
                <Label htmlFor="currentPassword">{t("currentPasswordLabel")}</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">{t("newPasswordLabel")}</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("newPasswordPlaceholder")}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword2">{t("confirmPasswordLabel")}</Label>
                <Input
                  id="newPassword2"
                  type="password"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? t("saving") : tCommon("save")}
              </Button>
            </form>
          </CardContent>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <ShieldCheck className="h-5 w-5 mr-2" />
                {t("adminSectionTitle")}
              </CardTitle>
              <CardDescription>{t("adminSectionDescription")}</CardDescription>
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
