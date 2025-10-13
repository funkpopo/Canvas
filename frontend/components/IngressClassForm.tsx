"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Loader2 } from "lucide-react";
import { ingressApi } from "@/lib/api";
import { toast } from "sonner";
import yaml from 'js-yaml';

interface IngressClassFormData {
  name: string;
  controller: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  parameters?: any;
  is_default?: boolean;
}

interface IngressClassFormProps {
  clusterId: number | null;
  initialData?: IngressClassFormData | null;
  onSuccess: () => void;
  onCancel: () => void;
}

const COMMON_CONTROLLERS = [
  { value: "k8s.io/ingress-nginx", label: "NGINX Ingress Controller" },
  { value: "k8s.io/ingress-traefik", label: "Traefik Ingress Controller" },
  { value: "k8s.io/ingress-haproxy", label: "HAProxy Ingress Controller" },
  { value: "k8s.io/ingress-istio", label: "Istio Ingress Controller" },
  { value: "k8s.io/ingress-aws-alb", label: "AWS ALB Ingress Controller" },
  { value: "k8s.io/ingress-gce", label: "GCE Ingress Controller" },
];

export default function IngressClassForm({
  clusterId,
  initialData,
  onSuccess,
  onCancel
}: IngressClassFormProps) {
  const [formData, setFormData] = useState<IngressClassFormData>({
    name: "",
    controller: "k8s.io/ingress-nginx",
    labels: {},
    annotations: {},
    is_default: false,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [labelKey, setLabelKey] = useState("");
  const [labelValue, setLabelValue] = useState("");
  const [annotationKey, setAnnotationKey] = useState("");
  const [annotationValue, setAnnotationValue] = useState("");

  const isEditing = !!initialData;

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name || "",
        controller: initialData.controller || "k8s.io/ingress-nginx",
        labels: initialData.labels ? { ...initialData.labels } : {},
        annotations: initialData.annotations ? { ...initialData.annotations } : {},
        is_default: initialData.is_default || false,
      });
    }
  }, [initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clusterId) return;

    if (!formData.name.trim()) {
      toast.error("请输入IngressClass名称");
      return;
    }

    if (!formData.controller.trim()) {
      toast.error("请选择控制器类型");
      return;
    }

    // 检查名称是否有效
    if (formData.name.trim() === "1" || /^\d+$/.test(formData.name.trim())) {
      toast.error("IngressClass名称不能只是数字，请使用有意义的名称");
      return;
    }

    // 检查IngressClass是否已存在
    try {
      const existingClasses = await ingressApi.getIngressClasses(clusterId);
      if (existingClasses.data && existingClasses.data.some((cls: any) => cls.name === formData.name.trim())) {
        toast.error(`IngressClass '${formData.name}' 已存在，请选择其他名称`);
        return;
      }
    } catch (error) {
      // 如果检查失败，继续创建（可能没有权限或其他问题）
      console.warn("无法检查IngressClass是否存在:", error);
    }

    setIsSubmitting(true);
    try {
      const submitData = {
        name: formData.name,
        controller: formData.controller,
        labels: formData.labels,
        annotations: {
          ...formData.annotations,
          ...(formData.is_default ? {
            "ingressclass.kubernetes.io/is-default-class": "true"
          } : {})
        },
      };

      const response = isEditing
        ? await ingressApi.updateIngressClass(clusterId, formData.name, submitData)
        : await ingressApi.createIngressClass(clusterId, submitData);

      if (response.data) {
        toast.success(`IngressClass${isEditing ? '更新' : '创建'}成功`);
        onSuccess();
      } else {
        toast.error(`${isEditing ? '更新' : '创建'}失败: ${response.error}`);
      }
    } catch (error) {
      toast.error(`IngressClass${isEditing ? '更新' : '创建'}失败`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addLabel = () => {
    if (!labelKey.trim() || !labelValue.trim()) return;

    setFormData(prev => ({
      ...prev,
      labels: {
        ...prev.labels,
        [labelKey]: labelValue
      }
    }));
    setLabelKey("");
    setLabelValue("");
  };

  const removeLabel = (key: string) => {
    setFormData(prev => {
      const newLabels = { ...prev.labels };
      delete newLabels[key];
      return { ...prev, labels: newLabels };
    });
  };

  const addAnnotation = () => {
    if (!annotationKey.trim() || !annotationValue.trim()) return;

    setFormData(prev => ({
      ...prev,
      annotations: {
        ...prev.annotations,
        [annotationKey]: annotationValue
      }
    }));
    setAnnotationKey("");
    setAnnotationValue("");
  };

  const removeAnnotation = (key: string) => {
    setFormData(prev => {
      const newAnnotations = { ...prev.annotations };
      delete newAnnotations[key];
      return { ...prev, annotations: newAnnotations };
    });
  };

  const handleYamlImport = (yamlContent: string) => {
    try {
      const parsed = yaml.load(yamlContent) as any;
      if (parsed && parsed.spec) {
        setFormData(prev => ({
          ...prev,
          controller: parsed.spec.controller || prev.controller,
          parameters: parsed.spec.parameters || prev.parameters,
        }));

        if (parsed.metadata) {
          if (parsed.metadata.labels) {
            setFormData(prev => ({
              ...prev,
              labels: { ...prev.labels, ...parsed.metadata.labels }
            }));
          }
          if (parsed.metadata.annotations) {
            setFormData(prev => ({
              ...prev,
              annotations: { ...prev.annotations, ...parsed.metadata.annotations }
            }));
          }
        }
      }
      toast.success("YAML导入成功");
    } catch (error) {
      toast.error("YAML格式错误");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">名称 *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder="例如: nginx"
            disabled={isEditing}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="controller">控制器 *</Label>
          <select
            id="controller"
            value={formData.controller}
            onChange={(e) => setFormData(prev => ({ ...prev, controller: e.target.value }))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {COMMON_CONTROLLERS.map(controller => (
              <option key={controller.value} value={controller.value}>
                {controller.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="is_default"
          checked={formData.is_default}
          onCheckedChange={(checked) =>
            setFormData(prev => ({ ...prev, is_default: !!checked }))
          }
        />
        <Label htmlFor="is_default">设为默认IngressClass</Label>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">标签</CardTitle>
          <CardDescription>为IngressClass添加标签</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="键"
              value={labelKey}
              onChange={(e) => setLabelKey(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="值"
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              className="flex-1"
            />
            <Button type="button" onClick={addLabel} variant="outline">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {Object.keys(formData.labels).length > 0 && (
            <div className="space-y-2">
              {Object.entries(formData.labels).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <code className="flex-1 text-sm">{key}={value}</code>
                  <Button
                    type="button"
                    onClick={() => removeLabel(key)}
                    variant="ghost"
                    size="sm"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">注解</CardTitle>
          <CardDescription>为IngressClass添加注解</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="键"
              value={annotationKey}
              onChange={(e) => setAnnotationKey(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="值"
              value={annotationValue}
              onChange={(e) => setAnnotationValue(e.target.value)}
              className="flex-1"
            />
            <Button type="button" onClick={addAnnotation} variant="outline">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {Object.keys(formData.annotations).length > 0 && (
            <div className="space-y-2">
              {Object.entries(formData.annotations).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <code className="flex-1 text-sm">{key}={value}</code>
                  <Button
                    type="button"
                    onClick={() => removeAnnotation(key)}
                    variant="ghost"
                    size="sm"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEditing ? '更新' : '创建'}IngressClass
        </Button>
      </div>
    </form>
  );
}
