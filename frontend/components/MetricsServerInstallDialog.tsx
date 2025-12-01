"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { metricsApi } from "@/lib/api";

interface MetricsServerInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clusterId: number;
  clusterName: string;
  onSuccess?: () => void;
}

export function MetricsServerInstallDialog({
  open,
  onOpenChange,
  clusterId,
  clusterName,
  onSuccess
}: MetricsServerInstallDialogProps) {
  const [image, setImage] = useState("registry.k8s.io/metrics-server/metrics-server:v0.7.0");
  const [insecureTls, setInsecureTls] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      const result = await metricsApi.installMetricsServer(clusterId, {
        image,
        insecure_tls: insecureTls,
      });

      if (result.data) {
        toast.success("metrics-server 安装成功！");
        onOpenChange(false);
        if (onSuccess) {
          onSuccess();
        }
      } else {
        toast.error(`安装失败: ${result.error || "未知错误"}`);
      }
    } catch (error) {
      console.error("安装metrics-server失败:", error);
      toast.error("安装失败，请检查网络连接");
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>安装 metrics-server</DialogTitle>
          <DialogDescription>
            为集群 "{clusterName}" 安装 metrics-server 以启用资源监控功能
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="image">镜像地址</Label>
            <Input
              id="image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="registry.k8s.io/metrics-server/metrics-server:v0.7.0"
            />
            <p className="text-xs text-muted-foreground">
              默认使用官方镜像，如果无法访问可使用国内镜像源
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="insecure-tls"
              checked={insecureTls}
              onCheckedChange={(checked) => setInsecureTls(checked as boolean)}
            />
            <Label
              htmlFor="insecure-tls"
              className="text-sm font-normal cursor-pointer"
            >
              跳过 TLS 验证（用于自签名证书环境）
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isInstalling}
          >
            取消
          </Button>
          <Button onClick={handleInstall} disabled={isInstalling}>
            {isInstalling && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isInstalling ? "安装中..." : "安装"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
