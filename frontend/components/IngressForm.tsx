"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X, Loader2, LayoutTemplate, Code } from "lucide-react";
import { toast } from "sonner";
import yaml from 'js-yaml';

// Ingress模板定义
const INGRESS_TEMPLATES = {
  basic: {
    name: "basic",
    label: "基础HTTP",
    description: "简单的HTTP入口配置",
    class_name: "nginx",
    rules: [{
      host: "",
      paths: [{
        path: "/",
        path_type: "Prefix",
        service_name: "",
        service_port: ""
      }]
    }],
    tls: [],
    labels: {},
    annotations: {}
  },
  https: {
    name: "https",
    label: "HTTPS with TLS",
    description: "带TLS证书的HTTPS入口配置",
    class_name: "nginx",
    rules: [{
      host: "",
      paths: [{
        path: "/",
        path_type: "Prefix",
        service_name: "",
        service_port: ""
      }]
    }],
    tls: [{
      hosts: [""],
      secret_name: "tls-secret"
    }],
    labels: {},
    annotations: {
      "nginx.ingress.kubernetes.io/ssl-redirect": "true"
    }
  },
  multipleHosts: {
    name: "multipleHosts",
    label: "多主机配置",
    description: "支持多个域名的入口配置",
    class_name: "nginx",
    rules: [
      {
        host: "",
        paths: [{
          path: "/",
          path_type: "Prefix",
          service_name: "",
          service_port: ""
        }]
      },
      {
        host: "",
        paths: [{
          path: "/",
          path_type: "Prefix",
          service_name: "",
          service_port: ""
        }]
      }
    ],
    tls: [],
    labels: {},
    annotations: {}
  },
  pathBased: {
    name: "pathBased",
    label: "路径路由",
    description: "基于路径的路由配置",
    class_name: "nginx",
    rules: [{
      host: "",
      paths: [
        {
          path: "/api",
          path_type: "Prefix",
          service_name: "",
          service_port: ""
        },
        {
          path: "/",
          path_type: "Prefix",
          service_name: "",
          service_port: ""
        }
      ]
    }],
    tls: [],
    labels: {},
    annotations: {}
  }
};

interface IngressFormData {
  name: string;
  namespace: string;
  class_name: string;
  rules: Array<{
    host: string;
    paths: Array<{
      path: string;
      path_type: string;
      service_name: string;
      service_port: string;
    }>;
  }>;
  tls: Array<{
    hosts: string[];
    secret_name: string;
  }>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

interface IngressFormProps {
  initialData?: Partial<IngressFormData>;
  namespace: string;
  clusterId: number | null;
  onSubmit: (data: IngressFormData) => Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  mode?: 'create' | 'update';
}

export default function IngressForm({
  initialData,
  namespace,
  clusterId,
  onSubmit,
  onCancel,
  isLoading = false,
  mode = 'create'
}: IngressFormProps) {
  const [formData, setFormData] = useState<IngressFormData>({
    name: initialData?.name || '',
    namespace: namespace,
    class_name: initialData?.class_name || '',
    rules: initialData?.rules || [{ host: '', paths: [{ path: '/', path_type: 'Prefix', service_name: '', service_port: '' }] }],
    tls: initialData?.tls || [],
    labels: initialData?.labels || {},
    annotations: initialData?.annotations || {}
  });

  // 标签和注解输入
  const [newLabelKey, setNewLabelKey] = useState("");
  const [newLabelValue, setNewLabelValue] = useState("");
  const [newAnnotationKey, setNewAnnotationKey] = useState("");
  const [newAnnotationValue, setNewAnnotationValue] = useState("");

  // TLS配置
  const [newTlsHosts, setNewTlsHosts] = useState("");
  const [newTlsSecret, setNewTlsSecret] = useState("");

  const addRule = () => {
    setFormData(prev => ({
      ...prev,
      rules: [...prev.rules, { host: '', paths: [{ path: '/', path_type: 'Prefix', service_name: '', service_port: '' }] }]
    }));
  };

  const removeRule = (ruleIndex: number) => {
    setFormData(prev => ({
      ...prev,
      rules: prev.rules.filter((_, index) => index !== ruleIndex)
    }));
  };

  const updateRule = (ruleIndex: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      rules: prev.rules.map((rule, index) =>
        index === ruleIndex ? { ...rule, [field]: value } : rule
      )
    }));
  };

  const addPath = (ruleIndex: number) => {
    setFormData(prev => ({
      ...prev,
      rules: prev.rules.map((rule, index) =>
        index === ruleIndex
          ? { ...rule, paths: [...rule.paths, { path: '/', path_type: 'Prefix', service_name: '', service_port: '' }] }
          : rule
      )
    }));
  };

  const removePath = (ruleIndex: number, pathIndex: number) => {
    setFormData(prev => ({
      ...prev,
      rules: prev.rules.map((rule, index) =>
        index === ruleIndex
          ? { ...rule, paths: rule.paths.filter((_, pIndex) => pIndex !== pathIndex) }
          : rule
      )
    }));
  };

  const updatePath = (ruleIndex: number, pathIndex: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      rules: prev.rules.map((rule, index) =>
        index === ruleIndex
          ? {
              ...rule,
              paths: rule.paths.map((path, pIndex) =>
                pIndex === pathIndex ? { ...path, [field]: value } : path
              )
            }
          : rule
      )
    }));
  };

  const addLabel = () => {
    if (!newLabelKey.trim() || !newLabelValue.trim()) {
      toast.error("请输入标签键和值");
      return;
    }
    setFormData(prev => ({
      ...prev,
      labels: { ...prev.labels, [newLabelKey]: newLabelValue }
    }));
    setNewLabelKey("");
    setNewLabelValue("");
  };

  const removeLabel = (key: string) => {
    setFormData(prev => {
      const newLabels = { ...prev.labels };
      delete newLabels[key];
      return { ...prev, labels: newLabels };
    });
  };

  const addAnnotation = () => {
    if (!newAnnotationKey.trim() || !newAnnotationValue.trim()) {
      toast.error("请输入注解键和值");
      return;
    }
    setFormData(prev => ({
      ...prev,
      annotations: { ...prev.annotations, [newAnnotationKey]: newAnnotationValue }
    }));
    setNewAnnotationKey("");
    setNewAnnotationValue("");
  };

  const removeAnnotation = (key: string) => {
    setFormData(prev => {
      const newAnnotations = { ...prev.annotations };
      delete newAnnotations[key];
      return { ...prev, annotations: newAnnotations };
    });
  };

  const addTls = () => {
    if (!newTlsSecret.trim()) {
      toast.error("请输入TLS密钥名称");
      return;
    }
    const hosts = newTlsHosts.split(',').map(host => host.trim()).filter(host => host);
    if (hosts.length === 0) {
      toast.error("请输入至少一个主机名");
      return;
    }
    setFormData(prev => ({
      ...prev,
      tls: [...prev.tls, { hosts, secret_name: newTlsSecret }]
    }));
    setNewTlsHosts("");
    setNewTlsSecret("");
  };

  const removeTls = (tlsIndex: number) => {
    setFormData(prev => ({
      ...prev,
      tls: prev.tls.filter((_, index) => index !== tlsIndex)
    }));
  };

  const applyTemplate = (templateName: string) => {
    const template = INGRESS_TEMPLATES[templateName as keyof typeof INGRESS_TEMPLATES];
    if (template) {
      setFormData(prev => ({
        ...prev,
        class_name: template.class_name,
        rules: template.rules.map(rule => ({
          ...rule,
          paths: rule.paths.map(path => ({ ...path }))
        })),
        tls: template.tls.map(tls => ({
          hosts: [...tls.hosts],
          secret_name: tls.secret_name
        })),
        labels: { ...template.labels },
        annotations: { ...template.annotations }
      }));
      toast.success(`已应用"${template.label}"模板`);
    }
  };

  const convertFormToYaml = () => {
    try {
      // 验证必要字段
      if (!formData.name.trim()) {
        toast.error("请输入Ingress名称");
        return;
      }

      // 构建YAML对象
      const yamlObject = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: formData.name,
          namespace: formData.namespace,
          ...(Object.keys(formData.labels).length > 0 && { labels: formData.labels }),
          ...(Object.keys(formData.annotations).length > 0 && { annotations: formData.annotations })
        },
        spec: {
          ...(formData.class_name && { ingressClassName: formData.class_name }),
          ...(formData.rules.length > 0 && {
            rules: formData.rules.map(rule => ({
              ...(rule.host && { host: rule.host }),
              http: {
                paths: rule.paths.map(path => ({
                  path: path.path,
                  pathType: path.path_type,
                  backend: {
                    service: {
                      name: path.service_name,
                      port: {
                        number: parseInt(path.service_port) || path.service_port
                      }
                    }
                  }
                }))
              }
            }))
          }),
          ...(formData.tls.length > 0 && {
            tls: formData.tls.map(tls => ({
              ...(tls.hosts.length > 0 && { hosts: tls.hosts }),
              ...(tls.secret_name && { secretName: tls.secret_name })
            }))
          })
        }
      };

      const yamlContent = yaml.dump(yamlObject, {
        indent: 2,
        lineWidth: -1,
        noRefs: true
      });

      // 复制到剪贴板
      navigator.clipboard.writeText(yamlContent).then(() => {
        toast.success("YAML已复制到剪贴板");
      }).catch(() => {
        toast.error("复制失败，请手动复制");
        console.log("Generated YAML:", yamlContent);
      });

    } catch (error) {
      console.error("表单转YAML错误:", error);
      toast.error("转换为YAML失败");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 基础验证
    if (!formData.name.trim()) {
      toast.error("请输入Ingress名称");
      return;
    }

    if (formData.rules.some(rule => rule.paths.some(path => !path.service_name || !path.service_port))) {
      toast.error("请填写所有路径的服务信息");
      return;
    }

    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 模板选择 */}
      {mode === 'create' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5" />
              快速模板
            </CardTitle>
            <CardDescription>选择预定义模板快速开始配置</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {Object.values(INGRESS_TEMPLATES).map((template) => (
                <Button
                  key={template.name}
                  type="button"
                  variant="outline"
                  className="h-auto p-4 flex flex-col items-start gap-2"
                  onClick={() => applyTemplate(template.name)}
                >
                  <div className="font-medium">{template.label}</div>
                  <div className="text-xs text-muted-foreground text-left">
                    {template.description}
                  </div>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 基本信息 */}
      <Card>
        <CardHeader>
          <CardTitle>基本信息</CardTitle>
          <CardDescription>配置Ingress的基本信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="输入Ingress名称"
                required
              />
            </div>
            <div>
              <Label htmlFor="namespace">命名空间</Label>
              <Input
                id="namespace"
                value={formData.namespace}
                readOnly
                className="bg-gray-50"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="class_name">Ingress类名 (可选)</Label>
            <Input
              id="class_name"
              value={formData.class_name}
              onChange={(e) => setFormData(prev => ({ ...prev, class_name: e.target.value }))}
              placeholder="nginx, traefik等"
            />
          </div>
        </CardContent>
      </Card>

      {/* 规则配置 */}
      <Card>
        <CardHeader>
          <CardTitle>规则配置</CardTitle>
          <CardDescription>配置Ingress的路由规则</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {formData.rules.map((rule, ruleIndex) => (
            <Card key={ruleIndex} className="border-l-4 border-l-blue-500">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">规则 {ruleIndex + 1}</CardTitle>
                  {formData.rules.length > 1 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removeRule(ruleIndex)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      删除规则
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>主机名 (可选)</Label>
                  <Input
                    value={rule.host}
                    onChange={(e) => updateRule(ruleIndex, 'host', e.target.value)}
                    placeholder="example.com"
                  />
                </div>

                <div>
                  <Label>路径配置</Label>
                  <div className="mt-2 space-y-3">
                    {rule.paths.map((path, pathIndex) => (
                      <div key={pathIndex} className="flex items-center gap-2 p-3 bg-gray-50 rounded">
                        <Select
                          value={path.path_type}
                          onValueChange={(value) => updatePath(ruleIndex, pathIndex, 'path_type', value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Prefix">Prefix</SelectItem>
                            <SelectItem value="Exact">Exact</SelectItem>
                            <SelectItem value="ImplementationSpecific">ImplementationSpecific</SelectItem>
                          </SelectContent>
                        </Select>

                        <Input
                          value={path.path}
                          onChange={(e) => updatePath(ruleIndex, pathIndex, 'path', e.target.value)}
                          placeholder="/"
                          className="flex-1"
                        />

                        <Input
                          value={path.service_name}
                          onChange={(e) => updatePath(ruleIndex, pathIndex, 'service_name', e.target.value)}
                          placeholder="服务名"
                          required
                        />

                        <Input
                          type="number"
                          value={path.service_port}
                          onChange={(e) => updatePath(ruleIndex, pathIndex, 'service_port', e.target.value)}
                          placeholder="端口"
                          className="w-20"
                          required
                        />

                        {rule.paths.length > 1 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removePath(ruleIndex, pathIndex)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => addPath(ruleIndex)}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      添加路径
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button type="button" variant="outline" onClick={addRule}>
            <Plus className="w-4 h-4 mr-1" />
            添加规则
          </Button>
        </CardContent>
      </Card>

      {/* TLS配置 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            TLS配置 (可选)
          </CardTitle>
          <CardDescription>配置HTTPS证书，为域名启用SSL/TLS加密</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 已配置的TLS条目 */}
          {formData.tls.length > 0 && (
            <div className="space-y-3">
              <Label className="text-sm font-medium text-muted-foreground">已配置的TLS证书</Label>
              {formData.tls.map((tls, tlsIndex) => (
                <Card key={tlsIndex} className="border-l-4 border-l-green-500 bg-green-50/30">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          <span className="text-sm font-medium">TLS证书 #{tlsIndex + 1}</span>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">主机域名</Label>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {tls.hosts.map((host, hostIndex) => (
                                <Badge key={hostIndex} variant="secondary" className="text-xs">
                                  {host}
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">TLS密钥</Label>
                            <div className="text-sm font-mono bg-white px-2 py-1 rounded border mt-1">
                              {tls.secret_name}
                            </div>
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => removeTls(tlsIndex)}
                        className="flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* 添加新的TLS配置 */}
          <div className="space-y-4">
            <Label className="text-sm font-medium text-muted-foreground">
              {formData.tls.length === 0 ? '添加TLS证书' : '添加更多TLS证书'}
            </Label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tls-hosts" className="text-sm">主机域名</Label>
                <Input
                  id="tls-hosts"
                  value={newTlsHosts}
                  onChange={(e) => setNewTlsHosts(e.target.value)}
                  placeholder="example.com,*.example.com"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  多个域名用逗号分隔，支持通配符域名
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tls-secret" className="text-sm">TLS密钥名称</Label>
                <Input
                  id="tls-secret"
                  value={newTlsSecret}
                  onChange={(e) => setNewTlsSecret(e.target.value)}
                  placeholder="tls-secret-name"
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Kubernetes Secret资源名称
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={addTls}
                className="flex items-center gap-2"
                disabled={!newTlsHosts.trim() || !newTlsSecret.trim()}
              >
                <Plus className="w-4 h-4" />
                添加TLS证书
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 标签和注解 */}
      <Card>
        <CardHeader>
          <CardTitle>标签和注解 (可选)</CardTitle>
          <CardDescription>添加元数据标签和注解</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>标签</Label>
            <div className="mt-2 space-y-2">
              {Object.entries(formData.labels).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <Badge variant="secondary">{key}={value}</Badge>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeLabel(key)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <Input
                  value={newLabelKey}
                  onChange={(e) => setNewLabelKey(e.target.value)}
                  placeholder="键"
                  className="flex-1"
                />
                <Input
                  value={newLabelValue}
                  onChange={(e) => setNewLabelValue(e.target.value)}
                  placeholder="值"
                  className="flex-1"
                />
                <Button type="button" onClick={addLabel}>
                  <Plus className="w-4 h-4 mr-1" />
                  添加标签
                </Button>
              </div>
            </div>
          </div>

          <div>
            <Label>注解</Label>
            <div className="mt-2 space-y-2">
              {Object.entries(formData.annotations).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2">
                  <div className="flex-1 p-2 bg-gray-50 rounded text-sm">
                    <div className="font-medium">{key}</div>
                    <div className="text-muted-foreground">{value}</div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeAnnotation(key)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <div className="space-y-2">
                <Input
                  value={newAnnotationKey}
                  onChange={(e) => setNewAnnotationKey(e.target.value)}
                  placeholder="注解键"
                />
                <Textarea
                  value={newAnnotationValue}
                  onChange={(e) => setNewAnnotationValue(e.target.value)}
                  placeholder="注解值"
                  rows={2}
                />
                <Button type="button" onClick={addAnnotation}>
                  <Plus className="w-4 h-4 mr-1" />
                  添加注解
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 操作按钮 */}
      <div className="flex justify-between gap-3">
        <Button type="button" variant="outline" onClick={convertFormToYaml}>
          <Code className="w-4 h-4 mr-2" />
          转换为YAML
        </Button>
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {mode === 'create' ? '创建中...' : '更新中...'}
              </>
            ) : (
              mode === 'create' ? '创建Ingress' : '更新Ingress'
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
