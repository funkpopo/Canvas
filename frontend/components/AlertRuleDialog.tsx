"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiClient, clusterApi, Cluster } from "@/lib/api";
import { toast } from "sonner";

interface AlertRule {
  id?: number;
  name: string;
  cluster_id: number;
  cluster_name?: string;
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
}

interface AlertRuleDialogProps {
  open: boolean;
  rule?: AlertRule;
  onClose: () => void;
  onSuccess: () => void;
}

export function AlertRuleDialog({ open, rule, onClose, onSuccess }: AlertRuleDialogProps) {
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [formData, setFormData] = useState<AlertRule>({
    name: "",
    cluster_id: 0,
    rule_type: "resource_usage",
    severity: "warning",
    enabled: true,
    threshold_config: {},
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      fetchClusters();
      if (rule) {
        setFormData(rule);
      } else {
        setFormData({
          name: "",
          cluster_id: 0,
          rule_type: "resource_usage",
          severity: "warning",
          enabled: true,
          threshold_config: {},
        });
      }
    }
  }, [open, rule]);

  const fetchClusters = async () => {
    try {
      const res = await clusterApi.getClusters();
      if (res.error) {
        toast.error(`获取集群列表失败: ${res.error}`);
        return;
      }
      setClusters(res.data ?? []);
    } catch {
      toast.error("获取集群列表失败: 网络错误");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (rule?.id) {
        const res = await apiClient.put(`/alerts/rules/${rule.id}`, formData);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("告警规则已更新");
      } else {
        const res = await apiClient.post("/alerts/rules", formData);
        if (res.error) {
          toast.error(res.error);
          return;
        }
        toast.success("告警规则已创建");
      }
      onSuccess();
    } catch {
      toast.error("操作失败: 网络错误");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? "编辑告警规则" : "创建告警规则"}</DialogTitle>
          <DialogDescription>配置资源监控告警规则</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">规则名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="cluster">集群</Label>
              <Select
                value={formData.cluster_id.toString()}
                onValueChange={(value) => setFormData({ ...formData, cluster_id: parseInt(value) })}
                disabled={!!rule}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择集群" />
                </SelectTrigger>
                <SelectContent>
                  {clusters.map((cluster) => (
                    <SelectItem key={cluster.id} value={cluster.id.toString()}>
                      {cluster.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rule_type">规则类型</Label>
              <Select
                value={formData.rule_type}
                onValueChange={(value) => setFormData({ ...formData, rule_type: value, threshold_config: {} })}
                disabled={!!rule}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resource_usage">资源使用</SelectItem>
                  <SelectItem value="pod_restart">Pod重启</SelectItem>
                  <SelectItem value="node_unavailable">节点不可用</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="severity">严重程度</Label>
              <Select
                value={formData.severity}
                onValueChange={(value) => setFormData({ ...formData, severity: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">信息</SelectItem>
                  <SelectItem value="warning">警告</SelectItem>
                  <SelectItem value="critical">严重</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.rule_type === "resource_usage" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="cpu_percent">CPU阈值 (%)</Label>
                  <Input
                    id="cpu_percent"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.threshold_config.cpu_percent || ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      threshold_config: { ...formData.threshold_config, cpu_percent: parseFloat(e.target.value) }
                    })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="memory_percent">内存阈值 (%)</Label>
                  <Input
                    id="memory_percent"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.threshold_config.memory_percent || ""}
                    onChange={(e) => setFormData({
                      ...formData,
                      threshold_config: { ...formData.threshold_config, memory_percent: parseFloat(e.target.value) }
                    })}
                  />
                </div>
              </>
            )}

            {formData.rule_type === "pod_restart" && (
              <div className="grid gap-2">
                <Label htmlFor="restart_count">重启次数阈值</Label>
                <Input
                  id="restart_count"
                  type="number"
                  min="1"
                  value={formData.threshold_config.restart_count || ""}
                  onChange={(e) => setFormData({
                    ...formData,
                    threshold_config: { ...formData.threshold_config, restart_count: parseInt(e.target.value) }
                  })}
                  required
                />
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                id="enabled"
                checked={formData.enabled}
                onCheckedChange={(checked: boolean) => setFormData({ ...formData, enabled: checked })}
              />
              <Label htmlFor="enabled">启用规则</Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "提交中..." : rule ? "更新" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
