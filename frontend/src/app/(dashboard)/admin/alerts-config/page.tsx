"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Button } from "@/shared/ui/button";
import { Card, CardContent } from "@/shared/ui/card";
import { badgePresets } from "@/shared/ui/badge";
import { fetchNotifyConfig, queryKeys, saveNotifyConfig, testNotifications, type NotifyConfigOut } from "@/lib/api";

const inputCls = "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:outline-none";

export default function AlertsConfigPage() {
  return (
    <AuthGate allow={["admin"]}>
      <AlertsConfigInner />
    </AuthGate>
  );
}

function AlertsConfigInner() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: queryKeys.notifyConfig, queryFn: fetchNotifyConfig });
  const cfg = data as NotifyConfigOut | undefined;

  const [enabled, setEnabled] = useState<boolean>(false);
  const [minInterval, setMinInterval] = useState<number>(60);

  // Slack
  const [slack, setSlack] = useState({
    general: "",
    critical: "",
    warning: "",
    info: "",
  });

  // Email
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState<number>(587);
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpUseTls, setSmtpUseTls] = useState(true);
  const [smtpPass, setSmtpPass] = useState<string | null>(null); // null = keep, "" = clear, value = set
  const [emailFrom, setEmailFrom] = useState("");
  const [emailTo, setEmailTo] = useState(""); // comma separated

  // DingTalk & WeCom
  const [dingtalk, setDingtalk] = useState("");
  const [wecom, setWecom] = useState("");

  useEffect(() => {
    if (!cfg) return;
    setEnabled(!!cfg.enabled);
    setMinInterval(cfg.min_interval_seconds ?? 60);
    setSlack({
      general: cfg.slack_webhook ?? "",
      critical: cfg.slack_webhook_critical ?? "",
      warning: cfg.slack_webhook_warning ?? "",
      info: cfg.slack_webhook_info ?? "",
    });
    setSmtpHost(cfg.smtp_host ?? "");
    setSmtpPort(cfg.smtp_port ?? 587);
    setSmtpUser(cfg.smtp_username ?? "");
    setSmtpUseTls(cfg.smtp_use_tls ?? true);
    setSmtpPass(null); // default do not change
    setEmailFrom(cfg.alert_email_from ?? "");
    setEmailTo((cfg.alert_email_to ?? []).join(", "));
    setDingtalk(cfg.dingtalk_webhook ?? "");
    setWecom(cfg.wecom_webhook ?? "");
  }, [cfg]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const body = {
        enabled,
        min_interval_seconds: Math.max(0, Number(minInterval) || 0),
        slack_webhook: slack.general?.trim() || null,
        slack_webhook_critical: slack.critical?.trim() || null,
        slack_webhook_warning: slack.warning?.trim() || null,
        slack_webhook_info: slack.info?.trim() || null,
        smtp_host: smtpHost.trim() || null,
        smtp_port: Number(smtpPort) || 587,
        smtp_username: smtpUser.trim() || null,
        smtp_password: smtpPass, // null=keep, ""=clear, value=set
        smtp_use_tls: !!smtpUseTls,
        alert_email_from: emailFrom.trim() || null,
        alert_email_to: emailTo.split(",").map((s) => s.trim()).filter(Boolean),
        dingtalk_webhook: dingtalk.trim() || null,
        wecom_webhook: wecom.trim() || null,
      };
      return await saveNotifyConfig(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifyConfig });
      setSmtpPass(null); // reset password change state
    },
  });

  const testMut = useMutation({
    mutationFn: testNotifications,
    onSuccess: (data) => {
      if (data.status === "ok") {
        alert(`✅ ${data.message}\nChannels: ${data.channels || "N/A"}`);
      } else {
        alert(`⚠️ ${data.message}\nChannels: ${data.channels || "N/A"}\nErrors: ${data.errors || "N/A"}`);
      }
    },
    onError: (error: any) => {
      alert(`❌ Test failed: ${error?.message || String(error)}`);
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Alert Notifications"
        description="Configure Slack, Email (SMTP), DingTalk, and WeCom channels"
        meta={<>
          <div>
            <p className={`${badgePresets.label} text-text-muted`}>Status</p>
            <p className="mt-1 text-lg font-semibold text-text-primary">{enabled ? "Enabled" : "Disabled"}</p>
            <p className="text-xs text-text-muted">Throttle: {minInterval}s per severity</p>
          </div>
        </>}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending || !enabled}>
              {testMut.isPending ? "Testing..." : "Test Notifications"}
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Save</Button>
          </div>
        }
      />

      <Card className="border-border bg-surface text-text-primary">
        <CardContent className="space-y-6 py-6">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-text-primary">
              <input type="checkbox" className="h-4 w-4 rounded border-border bg-surface" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              Enable notifications
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span>Min interval (sec)</span>
              <input type="number" value={minInterval} onChange={(e) => setMinInterval(Number(e.target.value))} className="w-24 rounded-md border border-border bg-surface px-2 py-1 text-sm" />
            </div>
          </div>

          <section>
            <h3 className="text-sm font-semibold text-text-primary">Slack</h3>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs text-text-muted mb-1">Webhook (default)</label>
                <input value={slack.general} onChange={(e) => setSlack({ ...slack, general: e.target.value })} className={inputCls} placeholder="https://hooks.slack.com/services/..." />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Critical webhook</label>
                <input value={slack.critical} onChange={(e) => setSlack({ ...slack, critical: e.target.value })} className={inputCls} placeholder="https://hooks.slack.com/services/..." />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Warning webhook</label>
                <input value={slack.warning} onChange={(e) => setSlack({ ...slack, warning: e.target.value })} className={inputCls} placeholder="https://hooks.slack.com/services/..." />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Info webhook</label>
                <input value={slack.info} onChange={(e) => setSlack({ ...slack, info: e.target.value })} className={inputCls} placeholder="https://hooks.slack.com/services/..." />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-text-primary">Email (SMTP)</h3>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs text-text-muted mb-1">SMTP host</label>
                <input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} className={inputCls} placeholder="smtp.example.com" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">SMTP port</label>
                <input type="number" value={smtpPort} onChange={(e) => setSmtpPort(Number(e.target.value))} className={inputCls} placeholder="587" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Username</label>
                <input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Password</label>
                <input value={smtpPass ?? ""} onChange={(e) => setSmtpPass(e.target.value)} className={inputCls} placeholder={cfg?.smtp_password_set ? "(set) leave blank to keep" : ""} />
                <p className="mt-1 text-[11px] text-text-muted">Leave blank to keep current; enter empty string to clear.</p>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 rounded border-border bg-surface" checked={smtpUseTls} onChange={(e) => setSmtpUseTls(e.target.checked)} />
                <span className="text-sm">Use STARTTLS</span>
              </div>
              <div />
              <div>
                <label className="block text-xs text-text-muted mb-1">From</label>
                <input value={emailFrom} onChange={(e) => setEmailFrom(e.target.value)} className={inputCls} placeholder="alerts@example.com" />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">Recipients</label>
                <input value={emailTo} onChange={(e) => setEmailTo(e.target.value)} className={inputCls} placeholder="a@example.com, b@example.com" />
              </div>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold text-text-primary">DingTalk & WeCom</h3>
            <div className="mt-2 grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs text-text-muted mb-1">DingTalk webhook</label>
                <input value={dingtalk} onChange={(e) => setDingtalk(e.target.value)} className={inputCls} placeholder="https://oapi.dingtalk.com/robot/send?..." />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">WeCom webhook</label>
                <input value={wecom} onChange={(e) => setWecom(e.target.value)} className={inputCls} placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?..." />
              </div>
            </div>
          </section>

          <div className="flex justify-end">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>Save</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

