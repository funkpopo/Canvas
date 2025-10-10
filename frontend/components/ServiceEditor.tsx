"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Save, Plus, X, Eye, Edit } from "lucide-react";
import { toast } from "sonner";

interface ServiceEditorProps {
  namespace: string;
  deployment: string;
  service: any;
  clusterId: string | null;
  onBack: () => void;
  onUpdated: () => void;
}

export default function ServiceEditor({
  namespace,
  deployment,
  service,
  clusterId,
  onBack,
  onUpdated
}: ServiceEditorProps) {
  const [activeTab, setActiveTab] = useState("config");
  const [isUpdating, setIsUpdating] = useState(false);
  const [yamlContent, setYamlContent] = useState("");
  const [isYamlLoading, setIsYamlLoading] = useState(false);
  const [isYamlSaving, setIsYamlSaving] = useState(false);
  const [isYamlEditing, setIsYamlEditing] = useState(false);

  // 服务配置
  const [serviceConfig, setServiceConfig] = useState({
    labels: { ...service.labels },
    selector: { ...service.selector },
    ports: [...service.ports],
    type: service.type,
    sessionAffinity: service.session_affinity || 'None',
    externalTrafficPolicy: service.external_traffic_policy || 'Cluster'
  });

  // 新端口
  const [newPort, setNewPort] = useState({
    port: '',
    targetPort: '',
    protocol: 'TCP',
    name: ''
  });

  // 新标签
  const [newLabelKey, setNewLabelKey] = useState("");
  const [newLabelValue, setNewLabelValue] = useState("");

  const fetchYaml = async () => {
    if (!clusterId) return;

    setIsYamlLoading(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/deployments/${namespace}/${deployment}/services/${service.name}/yaml?cluster_id=${clusterId}`,
        {
          headers: {
            "Authorization": `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setYamlContent(data.yaml);
      } else {
        toast.error("获取服务YAML失败");
      }
    } catch (error) {
      console.error("获取服务YAML出错:", error);
      toast.error("获取服务YAML失败");
    } finally {
      setIsYamlLoading(false);
    }
  };

  const saveYaml = async () => {
    if (!clusterId) return;

    setIsYamlSaving(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/deployments/${namespace}/${deployment}/services/${service.name}/yaml?cluster_id=${clusterId}`,
        {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ yaml_content: yamlContent }),
        }
      );

      if (response.ok) {
        toast.success("服务YAML更新成功");
        setIsYamlEditing(false);
        fetchYaml();
        onUpdated();
      } else {
        toast.error("更新服务YAML失败");
      }
    } catch (error) {
      console.error("更新服务YAML出错:", error);
      toast.error("更新服务YAML失败");
    } finally {
      setIsYamlSaving(false);
    }
  };

  const updateService = async () => {
    if (!clusterId) return;

    setIsUpdating(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/deployments/${namespace}/${deployment}/services/${service.name}?cluster_id=${clusterId}`,
        {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(serviceConfig),
        }
      );

      if (response.ok) {
        toast.success("服务配置更新成功");
        onUpdated();
      } else {
        toast.error("更新服务配置失败");
      }
    } catch (error) {
      console.error("更新服务配置出错:", error);
      toast.error("更新服务配置失败");
    } finally {
      setIsUpdating(false);
    }
  };

  const addPort = () => {
    if (newPort.port && newPort.targetPort) {
      setServiceConfig({
        ...serviceConfig,
        ports: [...serviceConfig.ports, {
          port: parseInt(newPort.port),
          target_port: newPort.targetPort,
          protocol: newPort.protocol,
          name: newPort.name || undefined
        }]
      });
      setNewPort({ port: '', targetPort: '', protocol: 'TCP', name: '' });
    }
  };

  const removePort = (index: number) => {
    setServiceConfig({
      ...serviceConfig,
      ports: serviceConfig.ports.filter((_, i) => i !== index)
    });
  };

  const addLabel = () => {
    if (newLabelKey && newLabelValue) {
      setServiceConfig({
        ...serviceConfig,
        labels: { ...serviceConfig.labels, [newLabelKey]: newLabelValue }
      });
      setNewLabelKey("");
      setNewLabelValue("");
    }
  };

  const removeLabel = (key: string) => {
    const newLabels = { ...serviceConfig.labels };
    delete newLabels[key];
    setServiceConfig({
      ...serviceConfig,
      labels: newLabels
    });
  };

  useEffect(() => {
    if (activeTab === "yaml") {
      fetchYaml();
    }
  }, [activeTab]);

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
        <div>
          <h2 className="text-2xl font-bold">编辑服务: {service.name}</h2>
          <p className="text-gray-600 dark:text-gray-400">
            命名空间: {namespace}
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="config">配置编辑</TabsTrigger>
          <TabsTrigger value="yaml">YAML编辑</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6">
          {/* 服务类型 */}
          <Card>
            <CardHeader>
              <CardTitle>服务类型</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>类型</Label>
                  <Select
                    value={serviceConfig.type}
                    onValueChange={(value) => setServiceConfig({ ...serviceConfig, type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ClusterIP">ClusterIP</SelectItem>
                      <SelectItem value="NodePort">NodePort</SelectItem>
                      <SelectItem value="LoadBalancer">LoadBalancer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>会话亲和性</Label>
                  <Select
                    value={serviceConfig.sessionAffinity}
                    onValueChange={(value) => setServiceConfig({ ...serviceConfig, sessionAffinity: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="None">None</SelectItem>
                      <SelectItem value="ClientIP">ClientIP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 端口配置 */}
          <Card>
            <CardHeader>
              <CardTitle>端口配置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {serviceConfig.ports.map((port, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input value={port.port} disabled className="w-20" />
                  <span>:</span>
                  <Input value={port.target_port} disabled className="w-20" />
                  <Badge variant="outline">{port.protocol}</Badge>
                  <Button variant="outline" size="sm" onClick={() => removePort(index)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="端口"
                  value={newPort.port}
                  onChange={(e) => setNewPort({ ...newPort, port: e.target.value })}
                  className="w-20"
                />
                <span>:</span>
                <Input
                  placeholder="目标端口"
                  value={newPort.targetPort}
                  onChange={(e) => setNewPort({ ...newPort, targetPort: e.target.value })}
                  className="w-20"
                />
                <Select
                  value={newPort.protocol}
                  onValueChange={(value) => setNewPort({ ...newPort, protocol: value })}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TCP">TCP</SelectItem>
                    <SelectItem value="UDP">UDP</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="名称(可选)"
                  value={newPort.name}
                  onChange={(e) => setNewPort({ ...newPort, name: e.target.value })}
                  className="w-24"
                />
                <Button onClick={addPort} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  添加
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* 标签配置 */}
          <Card>
            <CardHeader>
              <CardTitle>标签</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {Object.entries(serviceConfig.labels).map(([key, value]) => (
                  <Badge key={key} variant="secondary" className="flex items-center gap-1">
                    {key}: {String(value)}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => removeLabel(key)} />
                  </Badge>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  placeholder="键"
                  value={newLabelKey}
                  onChange={(e) => setNewLabelKey(e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="值"
                  value={newLabelValue}
                  onChange={(e) => setNewLabelValue(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={addLabel} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  添加
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={updateService} disabled={isUpdating}>
              {isUpdating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              保存配置
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="yaml" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>YAML配置</CardTitle>
                  <CardDescription>直接编辑服务的YAML配置</CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <Button variant="outline" onClick={fetchYaml} disabled={isYamlLoading}>
                    {isYamlLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowLeft className="h-4 w-4 mr-2" />
                    )}
                    刷新
                  </Button>
                  {isYamlEditing ? (
                    <>
                      <Button variant="outline" onClick={() => setIsYamlEditing(false)}>
                        <Eye className="h-4 w-4 mr-2" />
                        预览
                      </Button>
                      <Button onClick={saveYaml} disabled={isYamlSaving}>
                        {isYamlSaving ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        保存
                      </Button>
                    </>
                  ) : (
                    <Button onClick={() => setIsYamlEditing(true)}>
                      <Edit className="h-4 w-4 mr-2" />
                      编辑
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isYamlLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin mr-2" />
                  <span className="text-lg">加载YAML中...</span>
                </div>
              ) : (
                <Textarea
                  value={yamlContent}
                  onChange={(e) => setYamlContent(e.target.value)}
                  readOnly={!isYamlEditing}
                  className={`min-h-[600px] font-mono text-sm ${isYamlEditing ? 'border-blue-500' : 'border-gray-200'}`}
                  placeholder="YAML配置将在这里显示..."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
