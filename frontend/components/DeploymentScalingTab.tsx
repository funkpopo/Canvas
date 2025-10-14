"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Scale, TrendingUp, Activity, Users } from "lucide-react";
import { toast } from "sonner";

interface DeploymentScalingTabProps {
  deploymentDetails: any;
  clusterId: string | null;
  onScale: () => void;
}

export default function DeploymentScalingTab({ deploymentDetails, clusterId, onScale }: DeploymentScalingTabProps) {
  const [replicas, setReplicas] = useState(deploymentDetails?.replicas || 1);
  const [isScaling, setIsScaling] = useState(false);
  const [targetReplicas, setTargetReplicas] = useState(replicas);

  // 实时伸缩相关状态
  const [autoScalingEnabled, setAutoScalingEnabled] = useState(false);
  const [minReplicas, setMinReplicas] = useState(1);
  const [maxReplicas, setMaxReplicas] = useState(10);
  const [targetCPUUtilization, setTargetCPUUtilization] = useState(70);

  const handleScale = async () => {
    if (!deploymentDetails || !clusterId) return;

    setIsScaling(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/deployments/${deploymentDetails.namespace}/${deploymentDetails.name}/scale?cluster_id=${clusterId}`,
        {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ replicas: targetReplicas }),
        }
      );

      if (response.ok) {
        toast.success(`副本数已调整为 ${targetReplicas}`);
        setReplicas(targetReplicas);
        onScale();
      } else {
        toast.error("扩容失败");
      }
    } catch (error) {
      console.error("扩容出错:", error);
      toast.error("扩容失败");
    } finally {
      setIsScaling(false);
    }
  };

  useEffect(() => {
    if (deploymentDetails) {
      setReplicas(deploymentDetails.replicas);
      setTargetReplicas(deploymentDetails.replicas);
    }
  }, [deploymentDetails]);

  const getScalingRecommendation = () => {
    const currentReplicas = deploymentDetails?.replicas || 1;
    const readyReplicas = deploymentDetails?.ready_replicas || 0;

    if (readyReplicas < currentReplicas) {
      return { action: "increase", reason: "部分Pod未就绪，可能需要增加副本" };
    } else if (readyReplicas > currentReplicas) {
      return { action: "decrease", reason: "有额外就绪的Pod，可以减少副本" };
    }
    return { action: "stable", reason: "当前副本数正常" };
  };

  const recommendation = getScalingRecommendation();

  return (
    <div className="space-y-6">
      {/* 当前状态概览 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-zinc-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">期望副本</p>
                <p className="text-2xl font-bold">{deploymentDetails?.replicas || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Activity className="h-8 w-8 text-green-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">就绪副本</p>
                <p className="text-2xl font-bold">{deploymentDetails?.ready_replicas || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <TrendingUp className="h-8 w-8 text-yellow-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">可用副本</p>
                <p className="text-2xl font-bold">{deploymentDetails?.available_replicas || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center">
              <Scale className="h-8 w-8 text-purple-500" />
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">更新副本</p>
                <p className="text-2xl font-bold">{deploymentDetails?.updated_replicas || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 手动伸缩 */}
      <Card>
        <CardHeader>
          <CardTitle>手动伸缩</CardTitle>
          <CardDescription>手动调整部署的副本数量</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>当前副本数</Label>
                <Input value={replicas} disabled />
              </div>
              <div>
                <Label>目标副本数</Label>
                <Input
                  type="number"
                  value={targetReplicas}
                  onChange={(e) => setTargetReplicas(parseInt(e.target.value) || 0)}
                  min="0"
                  max="50"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTargetReplicas(Math.max(0, targetReplicas - 1))}
              >
                -1
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTargetReplicas(targetReplicas + 1)}
              >
                +1
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTargetReplicas(Math.max(0, targetReplicas - 5))}
              >
                -5
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTargetReplicas(targetReplicas + 5)}
              >
                +5
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Badge
                variant={
                  recommendation.action === "increase" ? "destructive" :
                  recommendation.action === "decrease" ? "secondary" : "default"
                }
              >
                {recommendation.reason}
              </Badge>
            </div>
            <Button
              onClick={handleScale}
              disabled={isScaling || targetReplicas === replicas}
            >
              {isScaling ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Scale className="h-4 w-4 mr-2" />
              )}
              应用伸缩
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 自动伸缩配置 (预留) */}
      <Card>
        <CardHeader>
          <CardTitle>自动伸缩配置</CardTitle>
          <CardDescription>配置基于CPU使用率的自动伸缩策略</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="auto-scaling"
              checked={autoScalingEnabled}
              onChange={(e) => setAutoScalingEnabled(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="auto-scaling">启用自动伸缩</Label>
          </div>

          {autoScalingEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>最小副本数</Label>
                <Input
                  type="number"
                  value={minReplicas}
                  onChange={(e) => setMinReplicas(parseInt(e.target.value) || 1)}
                  min="1"
                />
              </div>
              <div>
                <Label>最大副本数</Label>
                <Input
                  type="number"
                  value={maxReplicas}
                  onChange={(e) => setMaxReplicas(parseInt(e.target.value) || 1)}
                  min="1"
                />
              </div>
              <div>
                <Label>目标CPU利用率 (%)</Label>
                <Input
                  type="number"
                  value={targetCPUUtilization}
                  onChange={(e) => setTargetCPUUtilization(parseInt(e.target.value) || 1)}
                  min="1"
                  max="100"
                />
              </div>
            </div>
          )}

          <div className="text-sm text-gray-600 dark:text-gray-400">
            <p>注意: 自动伸缩功能需要配置HorizontalPodAutoscaler (HPA)，此功能将在后续版本中实现。</p>
          </div>
        </CardContent>
      </Card>

      {/* 伸缩历史 (预留) */}
      <Card>
        <CardHeader>
          <CardTitle>伸缩历史</CardTitle>
          <CardDescription>最近的伸缩操作记录</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-gray-500">
            <Scale className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>伸缩历史记录将在后续版本中实现</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
