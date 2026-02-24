"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, RefreshCw, Eye, Edit } from "lucide-react";
import { toast } from "sonner";
import { deploymentApi } from "@/lib/api";

interface DeploymentYamlTabProps {
  namespace: string;
  deployment: string;
  clusterId: string | null;
}

export default function DeploymentYamlTab({ namespace, deployment, clusterId }: DeploymentYamlTabProps) {
  const [yamlContent, setYamlContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const fetchYaml = async (showSuccessToast = false) => {
    if (!clusterId) {
      console.error("clusterId 为空");
      toast.error("缺少集群信息");
      return;
    }

    setIsLoading(true);
    try {
      const result = await deploymentApi.getDeploymentYaml(
        parseInt(clusterId),
        namespace,
        deployment
      );

      if (result.data) {
        setYamlContent(result.data.yaml);
        if (showSuccessToast) {
          toast.success("YAML获取成功");
        }
      } else {
        const errorMessage = result.error || "获取YAML失败";
        toast.error(errorMessage);
        console.error("获取YAML失败:", result.error);
      }
    } catch (error) {
      console.error("获取YAML出错:", error);
      toast.error("获取YAML失败");
    } finally {
      setIsLoading(false);
    }
  };

  const saveYaml = async () => {
    if (!clusterId) return;

    setIsSaving(true);
    try {
      const result = await deploymentApi.updateDeploymentYaml(
        parseInt(clusterId),
        namespace,
        deployment,
        yamlContent
      );

      if (result.data) {
        toast.success("YAML更新成功");
        setIsEditing(false);
        fetchYaml(false); // 重新获取以确保显示最新内容，不显示成功提示
      } else {
        toast.error("更新YAML失败");
      }
    } catch (error) {
      console.error("更新YAML出错:", error);
      toast.error("更新YAML失败");
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    fetchYaml(false); // 初始加载不显示成功提示
  }, [namespace, deployment, clusterId]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>YAML配置</CardTitle>
            <CardDescription>
              查看和编辑部署的YAML配置。修改前请确保了解YAML语法。
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" onClick={() => fetchYaml(true)} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              刷新
            </Button>
            {isEditing ? (
              <>
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  <Eye className="h-4 w-4 mr-2" />
                  预览
                </Button>
                <Button onClick={saveYaml} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  保存
                </Button>
              </>
            ) : (
              <Button onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-2" />
                编辑
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span className="text-lg">加载YAML中...</span>
          </div>
        ) : (
          <Textarea
            value={yamlContent}
            onChange={(e) => setYamlContent(e.target.value)}
            readOnly={!isEditing}
            className={`min-h-[600px] font-mono text-sm ${isEditing ? 'border-zinc-500' : 'border-gray-200'}`}
            placeholder="YAML配置将在这里显示..."
          />
        )}
      </CardContent>
    </Card>
  );
}
