"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/shared/ui/tabs";
import { useLanguage } from "@/shared/i18n/language-provider";
import { useI18n } from "@/shared/i18n/i18n";
import { useTheme } from "@/shared/theme/theme-provider";
import { 
  changeMyPassword, 
  fetchNotifyConfig, 
  saveNotifyConfig, 
  testNotifications,
  queryKeys,
  type NotifyConfigOut 
} from "@/lib/api";

export default function SettingsPage() {
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const qc = useQueryClient();

  const [draftLanguage, setDraftLanguage] = useState<"en" | "zh">(language);
  const [draftTheme, setDraftTheme] = useState<"light" | "dark">(theme);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Notification config state
  const { data: notifyConfig } = useQuery({ 
    queryKey: queryKeys.notifyConfig, 
    queryFn: fetchNotifyConfig 
  });
  
  const [notifyEnabled, setNotifyEnabled] = useState<boolean>(false);
  const [minInterval, setMinInterval] = useState<number>(60);
  
  // Email
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState<number>(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState<string | null>(null);
  const [smtpUseTls, setSmtpUseTls] = useState(true);
  const [emailFrom, setEmailFrom] = useState("");
  const [emailTo, setEmailTo] = useState("");
  
  // Slack
  const [slackWebhook, setSlackWebhook] = useState("");
  const [slackCritical, setSlackCritical] = useState("");
  const [slackWarning, setSlackWarning] = useState("");
  const [slackInfo, setSlackInfo] = useState("");
  
  // DingTalk & WeCom
  const [dingtalkWebhook, setDingtalkWebhook] = useState("");
  const [wecomWebhook, setWecomWebhook] = useState("");

  useEffect(() => setDraftLanguage(language), [language]);
  useEffect(() => setDraftTheme(theme), [theme]);
  
  // Sync notification config from API
  useEffect(() => {
    if (!notifyConfig) return;
    setNotifyEnabled(!!notifyConfig.enabled);
    setMinInterval(notifyConfig.min_interval_seconds ?? 60);
    setSmtpHost(notifyConfig.smtp_host ?? "");
    setSmtpPort(notifyConfig.smtp_port ?? 587);
    setSmtpUser(notifyConfig.smtp_username ?? "");
    setSmtpPass(null); // Don't populate password
    setSmtpUseTls(notifyConfig.smtp_use_tls ?? true);
    setEmailFrom(notifyConfig.alert_email_from ?? "");
    setEmailTo((notifyConfig.alert_email_to ?? []).join(", "));
    setSlackWebhook(notifyConfig.slack_webhook ?? "");
    setSlackCritical(notifyConfig.slack_webhook_critical ?? "");
    setSlackWarning(notifyConfig.slack_webhook_warning ?? "");
    setSlackInfo(notifyConfig.slack_webhook_info ?? "");
    setDingtalkWebhook(notifyConfig.dingtalk_webhook ?? "");
    setWecomWebhook(notifyConfig.wecom_webhook ?? "");
  }, [notifyConfig]);

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

  // Notification mutations
  const saveNotifyMutation = useMutation({
    mutationFn: async () => {
      const body = {
        enabled: notifyEnabled,
        min_interval_seconds: Math.max(0, Number(minInterval) || 60),
        slack_webhook: slackWebhook.trim() || null,
        slack_webhook_critical: slackCritical.trim() || null,
        slack_webhook_warning: slackWarning.trim() || null,
        slack_webhook_info: slackInfo.trim() || null,
        smtp_host: smtpHost.trim() || null,
        smtp_port: Number(smtpPort) || 587,
        smtp_username: smtpUser.trim() || null,
        smtp_password: smtpPass,
        smtp_use_tls: !!smtpUseTls,
        alert_email_from: emailFrom.trim() || null,
        alert_email_to: emailTo.split(",").map(s => s.trim()).filter(Boolean),
        dingtalk_webhook: dingtalkWebhook.trim() || null,
        wecom_webhook: wecomWebhook.trim() || null,
      };
      return await saveNotifyConfig(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifyConfig });
      setSmtpPass(null);
      alert(t("notifications.saveSuccess"));
    },
    onError: (error: any) => {
      alert(`${t("notifications.saveFailed")}: ${error?.message || String(error)}`);
    },
  });

  const testNotifyMutation = useMutation({
    mutationFn: testNotifications,
    onSuccess: (data) => {
      if (data.status === "ok") {
        alert(`✅ ${data.message}\n${t("notifications.tab.slack")}: ${data.channels || "N/A"}`);
      } else {
        alert(`⚠️ ${data.message}\nChannels: ${data.channels || "N/A"}\nErrors: ${data.errors || "N/A"}`);
      }
    },
    onError: (error: any) => {
      alert(`❌ ${t("notifications.testFailed")}: ${error?.message || String(error)}`);
    },
  });

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

      <Card className="border-border bg-surface text-text-primary">
        <CardHeader>
          <CardTitle className="text-text-primary">{t("notifications.title")}</CardTitle>
          <CardDescription>{t("notifications.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Global settings */}
          <div className="flex items-center gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input 
                type="checkbox" 
                className="h-4 w-4 rounded border-border bg-surface" 
                checked={notifyEnabled} 
                onChange={(e) => setNotifyEnabled(e.target.checked)} 
              />
              {t("notifications.enabled")}
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">{t("notifications.minInterval")}</span>
              <input 
                type="number" 
                value={minInterval} 
                onChange={(e) => setMinInterval(Number(e.target.value))} 
                className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-sm text-text-primary" 
              />
            </div>
            <div className="ml-auto flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => testNotifyMutation.mutate()} 
                disabled={testNotifyMutation.isPending || !notifyEnabled}
              >
                {testNotifyMutation.isPending ? t("notifications.testing") : t("notifications.test")}
              </Button>
              <Button 
                onClick={() => saveNotifyMutation.mutate()} 
                disabled={saveNotifyMutation.isPending}
              >
                {t("actions.save")}
              </Button>
            </div>
          </div>

          {/* Channel tabs */}
          <Tabs defaultValue="email" className="w-full">
            <TabsList>
              <TabsTrigger value="email">{t("notifications.tab.email")}</TabsTrigger>
              <TabsTrigger value="slack">{t("notifications.tab.slack")}</TabsTrigger>
              <TabsTrigger value="dingtalk">{t("notifications.tab.dingtalk")}</TabsTrigger>
              <TabsTrigger value="wecom">{t("notifications.tab.wecom")}</TabsTrigger>
            </TabsList>

            {/* Email Tab */}
            <TabsContent value="email" className="space-y-4 mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.email.smtpHost")}</label>
                  <input
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    placeholder="smtp.example.com"
                  />
                </div>
                <div>
                  <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.email.smtpPort")}</label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value))}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    placeholder="587"
                  />
                </div>
                <div>
                  <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.email.username")}</label>
                  <input
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  />
                </div>
                <div>
                  <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.email.password")}</label>
                  <input
                    type="password"
                    value={smtpPass ?? ""}
                    onChange={(e) => setSmtpPass(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    placeholder={notifyConfig?.smtp_password_set ? t("notifications.email.passwordPlaceholder") : ""}
                  />
                  <p className="mt-1 text-xs text-text-muted">{t("notifications.email.passwordHelp")}</p>
                </div>
                <div className="flex items-center pt-6">
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 rounded border-border bg-surface" 
                    checked={smtpUseTls} 
                    onChange={(e) => setSmtpUseTls(e.target.checked)} 
                  />
                  <span className="ml-2 text-sm text-text-primary">{t("notifications.email.useTls")}</span>
                </div>
                <div />
                <div>
                  <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.email.from")}</label>
                  <input
                    value={emailFrom}
                    onChange={(e) => setEmailFrom(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    placeholder={t("notifications.email.fromPlaceholder")}
                  />
                </div>
                <div>
                  <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.email.recipients")}</label>
                  <input
                    value={emailTo}
                    onChange={(e) => setEmailTo(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    placeholder={t("notifications.email.recipientsPlaceholder")}
                  />
                  <p className="mt-1 text-xs text-text-muted">{t("notifications.email.recipientsHelp")}</p>
                </div>
              </div>
            </TabsContent>

            {/* Slack Tab */}
            <TabsContent value="slack" className="space-y-4 mt-4">
              <p className="text-xs text-text-muted mb-3">{t("notifications.slack.webhookHelp")}</p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.slack.webhook")}</label>
                  <input
                    value={slackWebhook}
                    onChange={(e) => setSlackWebhook(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    placeholder={t("notifications.slack.webhookPlaceholder")}
                  />
                </div>
                <div>
                  <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.slack.webhookCritical")}</label>
                  <input
                    value={slackCritical}
                    onChange={(e) => setSlackCritical(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    placeholder={t("notifications.slack.webhookPlaceholder")}
                  />
                </div>
                <div>
                  <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.slack.webhookWarning")}</label>
                  <input
                    value={slackWarning}
                    onChange={(e) => setSlackWarning(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    placeholder={t("notifications.slack.webhookPlaceholder")}
                  />
                </div>
                <div>
                  <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.slack.webhookInfo")}</label>
                  <input
                    value={slackInfo}
                    onChange={(e) => setSlackInfo(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                    placeholder={t("notifications.slack.webhookPlaceholder")}
                  />
                </div>
              </div>
            </TabsContent>

            {/* DingTalk Tab */}
            <TabsContent value="dingtalk" className="space-y-4 mt-4">
              <div>
                <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.dingtalk.webhook")}</label>
                <input
                  value={dingtalkWebhook}
                  onChange={(e) => setDingtalkWebhook(e.target.value)}
                  className="mt-1 w-full max-w-2xl rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  placeholder={t("notifications.dingtalk.webhookPlaceholder")}
                />
              </div>
            </TabsContent>

            {/* WeCom Tab */}
            <TabsContent value="wecom" className="space-y-4 mt-4">
              <div>
                <label className={`${badgePresets.label} text-text-muted`}>{t("notifications.wecom.webhook")}</label>
                <input
                  value={wecomWebhook}
                  onChange={(e) => setWecomWebhook(e.target.value)}
                  className="mt-1 w-full max-w-2xl rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary"
                  placeholder={t("notifications.wecom.webhookPlaceholder")}
                />
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

