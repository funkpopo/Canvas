"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Shield, Layers } from "lucide-react";
import ControllerStatus from "@/components/ControllerStatus";
import ControllerInstaller from "@/components/ControllerInstaller";
import IngressClassManager from "@/components/IngressClassManager";

interface ControllerManagerProps {
  clusterId: number | null;
}

export default function ControllerManager({ clusterId }: ControllerManagerProps) {
  const [showInstaller, setShowInstaller] = useState(false);
  const [showUninstaller, setShowUninstaller] = useState(false);

  const handleInstallClick = () => {
    setShowInstaller(true);
  };

  const handleUninstallClick = () => {
    setShowUninstaller(true);
  };

  const handleInstallSuccess = () => {
    // 刷新状态
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" />
          Ingress生态系统管理
        </h2>
        <p className="text-muted-foreground">
          管理Ingress Controller和IngressClass，为您的应用提供完整的入口流量管理能力
        </p>
      </div>

      <Tabs defaultValue="controller" className="space-y-4">
        <TabsList>
          <TabsTrigger value="controller" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Controller管理
          </TabsTrigger>
          <TabsTrigger value="classes" className="flex items-center gap-2">
            <Layers className="w-4 h-4" />
            IngressClass管理
          </TabsTrigger>
        </TabsList>

        <TabsContent value="controller" className="space-y-4">
          <ControllerStatus
            clusterId={clusterId}
            onInstallClick={handleInstallClick}
            onUninstallClick={handleUninstallClick}
          />

          <Card>
            <CardHeader>
              <CardTitle>安装说明</CardTitle>
              <CardDescription>
                Ingress Controller是Kubernetes集群的入口流量控制器
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium mb-2">安装内容包括：</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• ingress-nginx命名空间</li>
                    <li>• Controller Deployment</li>
                    <li>• LoadBalancer/NodePort Service</li>
                    <li>• RBAC权限配置</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-medium mb-2">额外功能：</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• 默认IngressClass</li>
                    <li>• Admission Webhook</li>
                    <li>• TLS证书管理</li>
                    <li>• 路径重写支持</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="classes" className="space-y-4">
          <IngressClassManager clusterId={clusterId} />
        </TabsContent>
      </Tabs>

      {/* Controller安装对话框 */}
      <ControllerInstaller
        open={showInstaller}
        onOpenChange={setShowInstaller}
        clusterId={clusterId}
        onSuccess={handleInstallSuccess}
      />

      {/* 暂时使用相同的组件处理卸载，未来可以优化 */}
      <ControllerInstaller
        open={showUninstaller}
        onOpenChange={setShowUninstaller}
        clusterId={clusterId}
        onSuccess={handleInstallSuccess}
      />
    </div>
  );
}
