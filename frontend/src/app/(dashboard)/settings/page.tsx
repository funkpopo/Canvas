"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { useLanguage } from "@/shared/i18n/language-provider";
import { useI18n } from "@/shared/i18n/i18n";
import { useTheme } from "@/shared/theme/theme-provider";
import { changeMyPassword } from "@/lib/api";

export default function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  const [draftLanguage, setDraftLanguage] = useState<"en" | "zh">(language);
  const [draftTheme, setDraftTheme] = useState<"light" | "dark">(theme);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => setDraftLanguage(language), [language]);
  useEffect(() => setDraftTheme(theme), [theme]);

  const hasChanges = useMemo(
    () => draftLanguage !== language || draftTheme !== theme,
    [draftLanguage, draftTheme, language, theme],
  );

  function handleSave() {
    if (draftLanguage !== language) setLanguage(draftLanguage);
    if (draftTheme !== theme) setTheme(draftTheme);
  }

  async function handlePasswordChange() {
    setPasswordError(null);
    setPasswordSuccess(false);

    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("All fields are required");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    setPasswordLoading(true);
    try {
      await changeMyPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Failed to change password");
    } finally {
      setPasswordLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("global")}
        title={t("globalSettings.title")}
        description={t("globalSettings.description")}
        actions={
          <Button onClick={handleSave} disabled={!hasChanges}>
            {t("actions.save")}
          </Button>
        }
      />

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">{t("language.sectionTitle")}</CardTitle>
          <CardDescription>{t("language.sectionDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className={`${badgePresets.label} text-text-muted`}>{t("language.label")}</label>
          <select
            className="w-full max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
            value={draftLanguage}
            onChange={(e) => setDraftLanguage(e.target.value as "en" | "zh")}
          >
            <option value="en">{t("language.en")}</option>
            <option value="zh">{t("language.zh")}</option>
          </select>
        </CardContent>
      </Card>

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">{t("appearance.sectionTitle")}</CardTitle>
          <CardDescription>{t("appearance.sectionDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className={`${badgePresets.label} text-text-muted`}>{t("appearance.label")}</label>
          <div className="flex gap-3">
            <button
              className={`rounded-md border px-3 py-2 text-sm ${draftTheme === "light" ? "border-primary text-primary" : "border-border text-text-primary"}`}
              onClick={() => setDraftTheme("light")}
            >
              {t("appearance.light")}
            </button>
            <button
              className={`rounded-md border px-3 py-2 text-sm ${draftTheme === "dark" ? "border-primary text-primary" : "border-border text-text-primary"}`}
              onClick={() => setDraftTheme("dark")}
            >
              {t("appearance.dark")}
            </button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">Change Password</CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className={`${badgePresets.label} text-text-muted`}>Current Password</label>
            <input
              type="password"
              className="w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
            />
          </div>
          <div className="space-y-2">
            <label className={`${badgePresets.label} text-text-muted`}>New Password</label>
            <input
              type="password"
              className="w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 8 characters)"
            />
          </div>
          <div className="space-y-2">
            <label className={`${badgePresets.label} text-text-muted`}>Confirm New Password</label>
            <input
              type="password"
              className="w-full max-w-md rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>
          
          {passwordError && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-500">
              {passwordError}
            </div>
          )}
          
          {passwordSuccess && (
            <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-500">
              Password changed successfully!
            </div>
          )}

          <Button onClick={handlePasswordChange} disabled={passwordLoading}>
            {passwordLoading ? "Changing..." : "Change Password"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

