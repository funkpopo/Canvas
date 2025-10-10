"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface DeploymentConfigTabProps {
  deploymentDetails: any;
  clusterId: string | null;
  onUpdate: () => void;
}

export default function DeploymentConfigTab({ deploymentDetails, clusterId, onUpdate }: DeploymentConfigTabProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  // 镜像和拉取策略
  const [containers, setContainers] = useState(
    deploymentDetails?.spec?.template?.spec?.containers?.map((container: any) => ({
      name: container.name,
      image: container.image,
      imagePullPolicy: container.imagePullPolicy || 'IfNotPresent'
    })) || []
  );

  // 副本数
  const [replicas, setReplicas] = useState(deploymentDetails?.replicas || 1);

  // 标签
  const [labels, setLabels] = useState(Object.entries(deploymentDetails?.labels || {}).map(([key, value]) => ({ key, value: value as string })));
  const [newLabelKey, setNewLabelKey] = useState("");
  const [newLabelValue, setNewLabelValue] = useState("");

  // 环境变量
  const [envVars, setEnvVars] = useState(
    deploymentDetails?.spec?.template?.spec?.containers?.[0]?.env?.map((env: any) => ({
      name: env.name,
      value: env.value || ''
    })) || []
  );
  const [newEnvName, setNewEnvName] = useState("");
  const [newEnvValue, setNewEnvValue] = useState("");

  // 资源限制
  const [resources, setResources] = useState(
    deploymentDetails?.spec?.template?.spec?.containers?.[0]?.resources || {}
  );

  const handleUpdateDeployment = async () => {
    if (!deploymentDetails || !clusterId) return;

    setIsUpdating(true);
    try {
      const token = localStorage.getItem("token");

      const updates: any = {
        replicas: replicas,
        containers: containers.map((container: any) => ({
          name: container.name,
          image: container.image,
          image_pull_policy: container.imagePullPolicy
        })),
        labels: Object.fromEntries(labels.map(label => [label.key, label.value])),
        env_vars: [{
          name: containers[0]?.name || 'app',
          env: envVars
        }],
        resources: [{
          name: containers[0]?.name || 'app',
          requests: resources.requests || {},
          limits: resources.limits || {}
        }]
      };

      const response = await fetch(
        `http://localhost:8000/api/deployments/${deploymentDetails.namespace}/${deploymentDetails.name}?cluster_id=${clusterId}`,
        {
          method: "PATCH",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updates),
        }
      );

      if (response.ok) {
        toast.success("部署配置更新成功");
        onUpdate();
      } else {
        toast.error("更新失败");
      }
    } catch (error) {
      console.error("更新部署配置出错:", error);
      toast.error("更新失败");
    } finally {
      setIsUpdating(false);
    }
  };

  const addLabel = () => {
    if (newLabelKey && newLabelValue) {
      setLabels([...labels, { key: newLabelKey, value: newLabelValue }]);
      setNewLabelKey("");
      setNewLabelValue("");
    }
  };

  const removeLabel = (index: number) => {
    setLabels(labels.filter((_, i) => i !== index));
  };

  const addEnvVar = () => {
    if (newEnvName) {
      setEnvVars([...envVars, { name: newEnvName, value: newEnvValue }]);
      setNewEnvName("");
      setNewEnvValue("");
    }
  };

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_: any, i: number) => i !== index));
  };

  return (
    <div className="space-y-6">
      {/* 镜像配置 */}
      <Card>
        <CardHeader>
          <CardTitle>镜像配置</CardTitle>
          <CardDescription>配置容器的镜像和拉取策略</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {containers.map((container: any, index: number) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>容器名称</Label>
                <Input value={container.name} disabled />
              </div>
              <div>
                <Label>镜像</Label>
                <Input
                  value={container.image}
                  onChange={(e) => {
                    const newContainers = [...containers];
                    newContainers[index].image = e.target.value;
                    setContainers(newContainers);
                  }}
                />
              </div>
              <div>
                <Label>拉取策略</Label>
                <Select
                  value={container.imagePullPolicy}
                  onValueChange={(value) => {
                    const newContainers = [...containers];
                    newContainers[index].imagePullPolicy = value;
                    setContainers(newContainers);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Always">Always</SelectItem>
                    <SelectItem value="IfNotPresent">IfNotPresent</SelectItem>
                    <SelectItem value="Never">Never</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 副本数配置 */}
      <Card>
        <CardHeader>
          <CardTitle>副本数配置</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>副本数</Label>
              <Input
                type="number"
                value={replicas}
                onChange={(e) => setReplicas(parseInt(e.target.value) || 1)}
                min="1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 标签配置 */}
      <Card>
        <CardHeader>
          <CardTitle>标签配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {labels.map((label: {key: string, value: string}, index: number) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                {label.key}: {label.value}
                <X className="h-3 w-3 cursor-pointer" onClick={() => removeLabel(index)} />
              </Badge>
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <Input
              placeholder="键"
              value={newLabelKey}
              onChange={(e) => setNewLabelKey(e.target.value)}
            />
            <Input
              placeholder="值"
              value={newLabelValue}
              onChange={(e) => setNewLabelValue(e.target.value)}
            />
            <Button onClick={addLabel} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 环境变量配置 */}
      <Card>
        <CardHeader>
          <CardTitle>环境变量</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {envVars.map((env: {name: string, value: string}, index: number) => (
            <div key={index} className="flex items-center gap-2">
              <Input value={env.name} disabled className="flex-1" />
              <Input
                value={env.value}
                onChange={(e) => {
                  const newEnvVars = [...envVars];
                  newEnvVars[index].value = e.target.value;
                  setEnvVars(newEnvVars);
                }}
                placeholder="值"
                className="flex-1"
              />
              <Button variant="outline" size="sm" onClick={() => removeEnvVar(index)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              placeholder="变量名"
              value={newEnvName}
              onChange={(e) => setNewEnvName(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="变量值"
              value={newEnvValue}
              onChange={(e) => setNewEnvValue(e.target.value)}
              className="flex-1"
            />
            <Button onClick={addEnvVar} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              添加
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 资源配置 */}
      <Card>
        <CardHeader>
          <CardTitle>资源配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>CPU请求</Label>
              <Input
                value={resources.requests?.cpu || ''}
                onChange={(e) => setResources({
                  ...resources,
                  requests: { ...resources.requests, cpu: e.target.value }
                })}
                placeholder="例如: 100m"
              />
            </div>
            <div>
              <Label>内存请求</Label>
              <Input
                value={resources.requests?.memory || ''}
                onChange={(e) => setResources({
                  ...resources,
                  requests: { ...resources.requests, memory: e.target.value }
                })}
                placeholder="例如: 128Mi"
              />
            </div>
            <div>
              <Label>CPU限制</Label>
              <Input
                value={resources.limits?.cpu || ''}
                onChange={(e) => setResources({
                  ...resources,
                  limits: { ...resources.limits, cpu: e.target.value }
                })}
                placeholder="例如: 500m"
              />
            </div>
            <div>
              <Label>内存限制</Label>
              <Input
                value={resources.limits?.memory || ''}
                onChange={(e) => setResources({
                  ...resources,
                  limits: { ...resources.limits, memory: e.target.value }
                })}
                placeholder="例如: 512Mi"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <Button onClick={handleUpdateDeployment} disabled={isUpdating}>
          {isUpdating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          保存配置
        </Button>
      </div>
    </div>
  );
}
