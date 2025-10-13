"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface NetworkPolicyFormData {
  name: string;
  namespace: string;
  pod_selector: Record<string, string>;
  policy_types: string[];
  ingress: any[];
  egress: any[];
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

interface NetworkPolicyFormProps {
  onSubmit: (data: NetworkPolicyFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<NetworkPolicyFormData>;
  isEditing?: boolean;
  namespaces: string[];
}

export default function NetworkPolicyForm({
  onSubmit,
  onCancel,
  initialData,
  isEditing = false,
  namespaces
}: NetworkPolicyFormProps) {
  const [formData, setFormData] = useState<NetworkPolicyFormData>({
    name: initialData?.name || "",
    namespace: initialData?.namespace || "",
    pod_selector: initialData?.pod_selector || {},
    policy_types: initialData?.policy_types || [],
    ingress: initialData?.ingress || [],
    egress: initialData?.egress || [],
    labels: initialData?.labels || {},
    annotations: initialData?.annotations || {},
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pod选择器管理
  const [podSelectorKey, setPodSelectorKey] = useState("");
  const [podSelectorValue, setPodSelectorValue] = useState("");

  // 标签和注解管理
  const [labelKey, setLabelKey] = useState("");
  const [labelValue, setLabelValue] = useState("");
  const [annotationKey, setAnnotationKey] = useState("");
  const [annotationValue, setAnnotationValue] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.namespace) {
      toast.error("请填写必需字段");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (error) {
      console.error("提交失败:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const addPodSelector = () => {
    if (podSelectorKey && podSelectorValue) {
      setFormData(prev => ({
        ...prev,
        pod_selector: { ...prev.pod_selector, [podSelectorKey]: podSelectorValue }
      }));
      setPodSelectorKey("");
      setPodSelectorValue("");
    }
  };

  const removePodSelector = (key: string) => {
    setFormData(prev => {
      const newSelector = { ...prev.pod_selector };
      delete newSelector[key];
      return { ...prev, pod_selector: newSelector };
    });
  };

  const addLabel = () => {
    if (labelKey && labelValue) {
      setFormData(prev => ({
        ...prev,
        labels: { ...prev.labels, [labelKey]: labelValue }
      }));
      setLabelKey("");
      setLabelValue("");
    }
  };

  const removeLabel = (key: string) => {
    setFormData(prev => {
      const newLabels = { ...prev.labels };
      delete newLabels[key];
      return { ...prev, labels: newLabels };
    });
  };

  const addAnnotation = () => {
    if (annotationKey && annotationValue) {
      setFormData(prev => ({
        ...prev,
        annotations: { ...prev.annotations, [annotationKey]: annotationValue }
      }));
      setAnnotationKey("");
      setAnnotationValue("");
    }
  };

  const removeAnnotation = (key: string) => {
    setFormData(prev => {
      const newAnnotations = { ...prev.annotations };
      delete newAnnotations[key];
      return { ...prev, annotations: newAnnotations };
    });
  };

  const togglePolicyType = (type: string) => {
    setFormData(prev => ({
      ...prev,
      policy_types: prev.policy_types.includes(type)
        ? prev.policy_types.filter(t => t !== type)
        : [...prev.policy_types, type]
    }));
  };

  return (
    <div className="max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? "编辑Network Policy" : "创建Network Policy"}</CardTitle>
          <CardDescription>
            配置Kubernetes Network Policy来控制Pod间的网络流量
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 基本信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">名称 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="network-policy-name"
                  required
                  disabled={isEditing}
                />
              </div>
              <div>
                <Label htmlFor="namespace">命名空间 *</Label>
                <Select
                  value={formData.namespace}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, namespace: value }))}
                  disabled={isEditing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择命名空间" />
                  </SelectTrigger>
                  <SelectContent>
                    {namespaces.map(ns => (
                      <SelectItem key={ns} value={ns}>{ns}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="basic">基本配置</TabsTrigger>
                <TabsTrigger value="selectors">选择器</TabsTrigger>
                <TabsTrigger value="rules">规则配置</TabsTrigger>
                <TabsTrigger value="metadata">元数据</TabsTrigger>
              </TabsList>

              {/* 基本配置 */}
              <TabsContent value="basic" className="space-y-4">
                <div>
                  <Label>策略类型</Label>
                  <div className="flex gap-4 mt-2">
                    {["Ingress", "Egress"].map((type) => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={type.toLowerCase()}
                          checked={formData.policy_types.includes(type)}
                          onCheckedChange={() => togglePolicyType(type)}
                        />
                        <Label htmlFor={type.toLowerCase()}>{type}</Label>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* 选择器配置 */}
              <TabsContent value="selectors" className="space-y-4">
                <div>
                  <Label>Pod选择器</Label>
                  <div className="space-y-2 mt-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="键"
                        value={podSelectorKey}
                        onChange={(e) => setPodSelectorKey(e.target.value)}
                      />
                      <Input
                        placeholder="值"
                        value={podSelectorValue}
                        onChange={(e) => setPodSelectorValue(e.target.value)}
                      />
                      <Button type="button" onClick={addPodSelector} size="sm">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    {Object.entries(formData.pod_selector).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">{key}: {value}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removePodSelector(key)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* 规则配置 */}
              <TabsContent value="rules" className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  规则配置将在后续版本中实现。目前支持基本的策略类型配置。
                </div>
                {/* TODO: 实现详细的ingress/egress规则配置UI */}
              </TabsContent>

              {/* 元数据配置 */}
              <TabsContent value="metadata" className="space-y-4">
                {/* 标签 */}
                <div>
                  <Label>标签</Label>
                  <div className="space-y-2 mt-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="键"
                        value={labelKey}
                        onChange={(e) => setLabelKey(e.target.value)}
                      />
                      <Input
                        placeholder="值"
                        value={labelValue}
                        onChange={(e) => setLabelValue(e.target.value)}
                      />
                      <Button type="button" onClick={addLabel} size="sm">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    {Object.entries(formData.labels).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">{key}: {value}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeLabel(key)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 注解 */}
                <div>
                  <Label>注解</Label>
                  <div className="space-y-2 mt-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="键"
                        value={annotationKey}
                        onChange={(e) => setAnnotationKey(e.target.value)}
                      />
                      <Input
                        placeholder="值"
                        value={annotationValue}
                        onChange={(e) => setAnnotationValue(e.target.value)}
                      />
                      <Button type="button" onClick={addAnnotation} size="sm">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    {Object.entries(formData.annotations).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <span className="text-sm">{key}: {value}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => removeAnnotation(key)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={onCancel}>
                取消
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "提交中..." : (isEditing ? "更新" : "创建")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
