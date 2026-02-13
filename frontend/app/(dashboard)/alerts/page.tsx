"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, Trash2, Bell, BellOff, Activity, AlertTriangle } from "lucide-react";

import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AlertRuleDialog } from "@/components/AlertRuleDialog";
import { useTranslations } from "@/hooks/use-translations";

interface AlertRule {
  id: number;
  name: string;
  cluster_id: number;
  cluster_name: string;
  rule_type: string;
  severity: string;
  enabled: boolean;
  threshold_config: {
    cpu_percent?: number;
    memory_percent?: number;
    restart_count?: number;
    time_window_seconds?: number;
  };
  notification_channels?: string[];
  created_at: string;
}

interface AlertEvent {
  id: number;
  rule_name: string;
  cluster_name: string;
  resource_type: string;
  resource_name: string;
  namespace?: string;
  severity: string;
  message: string;
  status: string;
  first_triggered_at: string;
  last_triggered_at: string;
}

interface AlertStats {
  total: number;
  firing: number;
  resolved: number;
  by_severity: {
    critical: number;
    warning: number;
    info: number;
  };
}

function AlertsPageContent() {
  const t = useTranslations("alerts");
  const tCommon = useTranslations("common");

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; rule?: AlertRule }>({ open: false });
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      await Promise.all([fetchRules(), fetchEvents(), fetchStats()]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRules = async () => {
    try {
      const response = await apiClient.get<AlertRule[]>("/alerts/rules");
      if (response.error) {
        toast.error(t("loadRulesErrorWithMessage", { message: response.error }));
        return;
      }
      setRules(response.data ?? []);
    } catch {
      toast.error(t("loadRulesNetworkError"));
    }
  };

  const fetchEvents = async () => {
    try {
      const response = await apiClient.get<AlertEvent[]>("/alerts/events?status=firing&limit=50");
      if (response.error) {
        toast.error(t("loadEventsErrorWithMessage", { message: response.error }));
        return;
      }
      setEvents(response.data ?? []);
    } catch {
      toast.error(t("loadEventsNetworkError"));
    }
  };

  const fetchStats = async () => {
    try {
      const response = await apiClient.get<AlertStats>("/alerts/stats");
      if (response.error) {
        toast.error(t("loadStatsErrorWithMessage", { message: response.error }));
        return;
      }
      setStats(response.data ?? null);
    } catch {
      toast.error(t("loadStatsNetworkError"));
    }
  };

  const handleToggleRule = async (rule: AlertRule) => {
    try {
      const result = await apiClient.put(`/alerts/rules/${rule.id}`, { enabled: !rule.enabled });
      if (result.error) {
        toast.error(t("operationFailedWithMessage", { message: result.error }));
        return;
      }
      toast.success(rule.enabled ? t("ruleDisabled") : t("ruleEnabled"));
      fetchRules();
    } catch {
      toast.error(t("operationNetworkError"));
    }
  };

  const handleDeleteRule = async (ruleId: number) => {
    try {
      const result = await apiClient.delete(`/alerts/rules/${ruleId}`);
      if (result.error) {
        toast.error(t("deleteFailedWithMessage", { message: result.error }));
        return;
      }
      toast.success(t("ruleDeleted"));
      fetchRules();
    } catch {
      toast.error(t("deleteNetworkError"));
    }
  };

  const handleResolveEvent = async (eventId: number) => {
    try {
      const result = await apiClient.post(`/alerts/events/${eventId}/resolve`, {});
      if (result.error) {
        toast.error(t("operationFailedWithMessage", { message: result.error }));
        return;
      }
      toast.success(t("alertResolved"));
      fetchEvents();
      fetchStats();
    } catch {
      toast.error(t("operationNetworkError"));
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "destructive";
      case "warning": return "default";
      case "info": return "secondary";
      default: return "outline";
    }
  };

  const getRuleTypeLabel = (type: string) => {
    switch (type) {
      case "resource_usage": return t("ruleTypeResourceUsage");
      case "pod_restart": return t("ruleTypePodRestart");
      case "node_unavailable": return t("ruleTypeNodeUnavailable");
      default: return type;
    }
  };

  return (
      <div className="container mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <Button onClick={() => setRuleDialog({ open: true })}>
            <Plus className="mr-2 h-4 w-4" />
            {t("createRule")}
          </Button>
        </div>

        {stats && (
          <div className="grid gap-4 md:grid-cols-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("totalAlerts")}</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("firing")}</CardTitle>
                <Bell className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-500">{stats.firing}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("criticalAlerts")}</CardTitle>
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-500">{stats.by_severity.critical}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t("resolved")}</CardTitle>
                <BellOff className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-500">{stats.resolved}</div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("rulesTitle")}</CardTitle>
              <CardDescription>{t("rulesDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-4">{tCommon("loading")}</div>
              ) : rules.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">{t("noRules")}</div>
              ) : (
                <div className="space-y-3">
                  {rules.map((rule) => (
                    <div key={rule.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{rule.name}</span>
                          <Badge variant={getSeverityColor(rule.severity)}>{rule.severity}</Badge>
                          <Badge variant="outline">{getRuleTypeLabel(rule.rule_type)}</Badge>
                          {rule.enabled ? (
                            <Badge variant="default">{t("enabled")}</Badge>
                          ) : (
                            <Badge variant="secondary">{t("disabled")}</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {t("clusterLabel", { cluster: rule.cluster_name })}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleToggleRule(rule)}
                          aria-label={`${rule.enabled ? t("ruleDisabled") : t("ruleEnabled")}: ${rule.name}`}
                          title={`${rule.enabled ? t("ruleDisabled") : t("ruleEnabled")}: ${rule.name}`}
                        >
                          {rule.enabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRuleDialog({ open: true, rule })}
                          aria-label={`${tCommon("edit")}: ${rule.name}`}
                          title={`${tCommon("edit")}: ${rule.name}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setConfirmDialog({
                              open: true,
                              title: t("deleteRuleTitle"),
                              description: t("deleteRuleDescription", { name: rule.name }),
                              onConfirm: () => handleDeleteRule(rule.id),
                            });
                          }}
                          aria-label={`${tCommon("delete")}: ${rule.name}`}
                          title={`${tCommon("delete")}: ${rule.name}`}
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

          <Card>
            <CardHeader>
              <CardTitle>{t("activeAlertsTitle")}</CardTitle>
              <CardDescription>{t("activeAlertsDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-4">{tCommon("loading")}</div>
              ) : events.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">{t("noActiveAlerts")}</div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto">
                  {events.map((event) => (
                    <div key={event.id} className="p-3 border rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={getSeverityColor(event.severity)}>{event.severity}</Badge>
                          <span className="font-medium">{event.rule_name}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleResolveEvent(event.id)}
                        >
                          {t("resolve")}
                        </Button>
                      </div>
                      <div className="text-sm mb-1">{event.message}</div>
                      <div className="text-xs text-muted-foreground">
                        {t("eventMeta", {
                          cluster: event.cluster_name,
                          resourceType: event.resource_type,
                          resourceName: event.resource_name,
                        })}
                        {event.namespace && ` (${event.namespace})`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {t("firstTriggeredAt", { time: new Date(event.first_triggered_at).toLocaleString() })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <AlertRuleDialog
          open={ruleDialog.open}
          rule={ruleDialog.rule}
          onClose={() => setRuleDialog({ open: false })}
          onSuccess={() => {
            fetchRules();
            setRuleDialog({ open: false });
          }}
        />

        <ConfirmDialog
          open={confirmDialog.open}
          onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
          title={confirmDialog.title}
          description={confirmDialog.description}
          onConfirm={() => {
            confirmDialog.onConfirm();
            setConfirmDialog({ ...confirmDialog, open: false });
          }}
        />
      </div>
  );
}

export default function AlertsPage() {
  return <AlertsPageContent />;
}
