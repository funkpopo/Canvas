"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Save, Eye, Edit, Download, Upload, Settings } from "lucide-react";
import { toast } from "sonner";
import YamlEditor from "@/components/YamlEditor";
import yaml from 'js-yaml';

interface IngressYamlEditorProps {
  namespace: string;
  ingressName?: string;
  clusterId: number | null;
  onSubmit: (yamlContent: string) => Promise<void>;
  onCancel: () => void;
  onSwitchToForm?: (formData?: any) => void;
  isLoading?: boolean;
  mode?: 'create' | 'update';
}

export default function IngressYamlEditor({
  namespace,
  ingressName,
  clusterId,
  onSubmit,
  onCancel,
  onSwitchToForm,
  isLoading = false,
  mode = 'create'
}: IngressYamlEditorProps) {
  const [yamlContent, setYamlContent] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingYaml, setIsLoadingYaml] = useState(false);

  // 加载YAML内容
  const loadYaml = async () => {
    if (!clusterId || !ingressName) return;

    setIsLoadingYaml(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(
        `http://localhost:8000/api/ingress/${namespace}/${ingressName}/yaml?cluster_id=${clusterId}`,
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
        toast.error("加载YAML失败");
      }
    } catch (error) {
      console.error("加载YAML出错:", error);
      toast.error("加载YAML失败");
    } finally {
      setIsLoadingYaml(false);
    }
  };

  // 保存YAML内容
  const saveYaml = async () => {
    if (!yamlContent.trim()) {
      toast.error("YAML内容不能为空");
      return;
    }

    await onSubmit(yamlContent);
  };

  // 下载YAML文件
  const downloadYaml = () => {
    if (!yamlContent) {
      toast.error("没有YAML内容可下载");
      return;
    }

    const blob = new Blob([yamlContent], { type: 'application/x-yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ingressName || 'ingress'}.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 上传YAML文件
  const uploadYaml = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setYamlContent(content);
      toast.success("YAML文件已加载");
    };
    reader.readAsText(file);
  };

  // YAML转表单数据
  const convertYamlToForm = () => {
    if (!yamlContent.trim()) {
      toast.error("YAML内容为空");
      return;
    }

    try {
      const parsed = yaml.load(yamlContent) as any;

      if (!parsed || typeof parsed !== 'object') {
        toast.error("无效的YAML格式");
        return;
      }

      // 转换为表单数据格式
      const formData = {
        name: parsed.metadata?.name || '',
        namespace: parsed.metadata?.namespace || namespace,
        class_name: parsed.spec?.ingressClassName || '',
        rules: (parsed.spec?.rules || []).map((rule: any) => ({
          host: rule.host || '',
          paths: (rule.http?.paths || []).map((path: any) => ({
            path: path.path || '/',
            path_type: path.pathType || 'Prefix',
            service_name: path.backend?.service?.name || '',
            service_port: path.backend?.service?.port?.number || path.backend?.service?.port?.name || ''
          }))
        })),
        tls: (parsed.spec?.tls || []).map((tls: any) => ({
          hosts: tls.hosts || [],
          secret_name: tls.secretName || ''
        })),
        labels: parsed.metadata?.labels || {},
        annotations: parsed.metadata?.annotations || {}
      };

      if (onSwitchToForm) {
        onSwitchToForm(formData);
        toast.success("已转换为表单模式");
      }
    } catch (error) {
      console.error("YAML解析错误:", error);
      toast.error("YAML格式错误，无法转换为表单");
    }
  };

  // 初始化加载
  useEffect(() => {
    if (mode === 'update' && ingressName) {
      loadYaml();
    } else {
      // 创建模式下的默认YAML模板
      const defaultYaml = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${ingressName || 'my-ingress'}
  namespace: ${namespace}
spec:
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-service
            port:
              number: 80
  # tls:
  # - hosts:
  #   - example.com
  #   secretName: tls-secret`;
      setYamlContent(defaultYaml);
    }
  }, [mode, ingressName, namespace]);

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>YAML配置</CardTitle>
              <CardDescription>
                {mode === 'create' ? '创建新的Ingress' : `编辑 ${namespace}/${ingressName}`}
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              {mode === 'update' && (
                <Button variant="outline" onClick={loadYaml} disabled={isLoadingYaml}>
                  {isLoadingYaml ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ArrowLeft className="h-4 w-4 mr-2" />
                  )}
                  刷新
                </Button>
              )}

              <Button variant="outline" onClick={downloadYaml}>
                <Download className="h-4 w-4 mr-2" />
                下载
              </Button>

              <label className="cursor-pointer">
                <Button variant="outline" asChild>
                  <span>
                    <Upload className="h-4 w-4 mr-2" />
                    上传
                  </span>
                </Button>
                <input
                  type="file"
                  accept=".yaml,.yml"
                  onChange={uploadYaml}
                  className="hidden"
                />
              </label>

              {onSwitchToForm && (
                <Button variant="outline" onClick={convertYamlToForm}>
                  <Settings className="h-4 w-4 mr-2" />
                  转换为表单
                </Button>
              )}

              {isEditing ? (
                <>
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    <Eye className="h-4 w-4 mr-2" />
                    预览
                  </Button>
                  <Button onClick={saveYaml} disabled={isLoading}>
                    {isLoading ? (
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
      </Card>

      {/* YAML编辑器 */}
      <Card>
        <CardContent className="p-0">
          {isLoadingYaml ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin mr-2" />
              <span className="text-lg">加载YAML中...</span>
            </div>
          ) : (
            <YamlEditor
              value={yamlContent}
              onChange={setYamlContent}
              readOnly={!isEditing}
              height="600px"
              className={isEditing ? 'border-blue-500' : 'border-gray-200'}
            />
          )}
        </CardContent>
      </Card>

      {/* 底部操作栏 */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        {isEditing && (
          <Button onClick={saveYaml} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                保存中...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                保存Ingress
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
