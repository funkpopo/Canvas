"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, XCircle, Loader2, Settings } from "lucide-react";
import { ingressApi } from "@/lib/api";
import { toast } from "sonner";

interface ControllerStatusData {
  installed: boolean;
  namespace: string;
  deployment_exists: boolean;
  service_exists: boolean;
  ingressclass_exists: boolean;
  webhook_exists: boolean;
  version: string | null;
  namespace_exists: boolean;
  error: string | null;
}

interface ControllerStatusProps {
  clusterId: number | null;
  onInstallClick: () => void;
  onUninstallClick: () => void;
}

export default function ControllerStatus({ clusterId, onInstallClick, onUninstallClick }: ControllerStatusProps) {
  const [status, setStatus] = useState<ControllerStatusData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchStatus = async () => {
    if (!clusterId) return;

    setIsLoading(true);
    try {
      const response = await ingressApi.getControllerStatus(clusterId);
      if (response.data) {
        setStatus(response.data);
      } else {
        toast.error(`获取Controller状态失败: ${response.error}`);
      }
    } catch (error) {
      toast.error("获取Controller状态失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [clusterId]);

  const getStatusIcon = (exists: boolean) => {
    return exists ? (
      <CheckCircle className="w-4 h-4 text-green-500" />
    ) : (
      <XCircle className="w-4 h-4 text-red-500" />
    );
  };

  const getStatusBadge = () => {
    if (!status) return <Badge variant="secondary">未知</Badge>;

    if (status.error) {
      return <Badge variant="destructive">错误</Badge>;
    }

    if (status.installed) {
      return <Badge variant="default" className="bg-green-500">已安装</Badge>;
    }

    return <Badge variant="secondary">未安装</Badge>;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Ingress Controller状态
          </CardTitle>
          <CardDescription>检查Ingress Controller安装状态</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="ml-2">检查中...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Ingress Controller状态
            </CardTitle>
            <CardDescription>检查Ingress Controller安装状态</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge()}
            <Button variant="outline" size="sm" onClick={fetchStatus}>
              刷新
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {status?.error ? (
          <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <div>
              <p className="font-medium text-red-800">检查失败</p>
              <p className="text-sm text-red-600">{status.error}</p>
            </div>
          </div>
        ) : status ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                {getStatusIcon(status.namespace_exists)}
                <span className="text-sm">命名空间 ({status.namespace})</span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(status.deployment_exists)}
                <span className="text-sm">Deployment</span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(status.service_exists)}
                <span className="text-sm">Service</span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(status.ingressclass_exists)}
                <span className="text-sm">IngressClass</span>
              </div>
              <div className="flex items-center gap-2">
                {getStatusIcon(status.webhook_exists)}
                <span className="text-sm">Admission Webhook</span>
              </div>
              {status.version && (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm">版本: {status.version}</span>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4 border-t">
              {!status.installed ? (
                <Button onClick={onInstallClick}>
                  <Settings className="w-4 h-4 mr-2" />
                  安装Controller
                </Button>
              ) : (
                <Button variant="destructive" onClick={onUninstallClick}>
                  <XCircle className="w-4 h-4 mr-2" />
                  卸载Controller
                </Button>
              )}
              <Button variant="outline" onClick={fetchStatus}>
                重新检查
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            无法获取状态信息
          </div>
        )}
      </CardContent>
    </Card>
  );
}
