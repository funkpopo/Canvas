"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface ResourceQuotaFormData {
  name: string;
  namespace: string;
  hard: Record<string, string>;
  scopes: string[];
  scope_selector: Array<{
    scope_name: string;
    operator: string;
    values: string[];
  }>;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

interface ResourceQuotaFormProps {
  onSubmit: (data: ResourceQuotaFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<ResourceQuotaFormData>;
  isEditing?: boolean;
  namespaces: string[];
}

export default function ResourceQuotaForm({
  onSubmit,
  onCancel,
  initialData,
  isEditing = false,
  namespaces
}: ResourceQuotaFormProps) {
  const [formData, setFormData] = useState<ResourceQuotaFormData>({
    name: initialData?.name || "",
    namespace: initialData?.namespace || "",
    hard: initialData?.hard || {},
    scopes: initialData?.scopes || [],
    scope_selector: initialData?.scope_selector || [],
    labels: initialData?.labels || {},
    annotations: initialData?.annotations || {},
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // 硬限制管理
  const [hardKey, setHardKey] = useState("");
  const [hardValue, setHardValue] = useState("");

  // 作用域管理
  const [selectedScope, setSelectedScope] = useState("");

  // 作用域选择器管理
  const [scopeSelectorScopeName, setScopeSelectorScopeName] = useState("");
  const [scopeSelectorOperator, setScopeSelectorOperator] = useState("");
  const [scopeSelectorValues, setScopeSelectorValues] = useState("");

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

  const addHardLimit = () => {
    if (hardKey && hardValue) {
      setFormData(prev => ({
        ...prev,
        hard: { ...prev.hard, [hardKey]: hardValue }
      }));
      setHardKey("");
      setHardValue("");
    }
  };

  const removeHardLimit = (key: string) => {
    setFormData(prev => {
      const newHard = { ...prev.hard };
      delete newHard[key];
      return { ...prev, hard: newHard };
    });
  };

  const addScope = () => {
    if (selectedScope && !formData.scopes.includes(selectedScope)) {
      setFormData(prev => ({
        ...prev,
        scopes: [...prev.scopes, selectedScope]
      }));
      setSelectedScope("");
    }
  };

  const removeScope = (scope: string) => {
    setFormData(prev => ({
      ...prev,
      scopes: prev.scopes.filter(s => s !== scope)
    }));
  };

  const addScopeSelector = () => {
    if (scopeSelectorScopeName && scopeSelectorOperator) {
      const values = scopeSelectorValues.split(',').map(v => v.trim()).filter(v => v);
      setFormData(prev => ({
        ...prev,
        scope_selector: [...prev.scope_selector, {
          scope_name: scopeSelectorScopeName,
          operator: scopeSelectorOperator,
          values: values
        }]
      }));
      setScopeSelectorScopeName("");
      setScopeSelectorOperator("");
      setScopeSelectorValues("");
    }
  };

  const removeScopeSelector = (index: number) => {
    setFormData(prev => ({
      ...prev,
      scope_selector: prev.scope_selector.filter((_, i) => i !== index)
    }));
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

  return (
    <div className="max-w-6xl mx-auto p-6">
      <form onSubmit={handleSubmit} className="space-y-8">
            {/* 基本信息 */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">基本信息</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="name" className="text-sm font-medium text-foreground">名称 *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="resource-quota-name"
                    className="h-10"
                    required
                  />
                </div>
                <div className="space-y-3">
                  <Label htmlFor="namespace" className="text-sm font-medium text-foreground">命名空间 *</Label>
                  <Select
                    value={formData.namespace}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, namespace: value }))}
                  >
                    <SelectTrigger className="h-10">
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
            </div>

            {/* 配置选项 */}
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">配置选项</h2>
              <Tabs defaultValue="hard-limits" className="w-full">
                <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-12">
                  <TabsTrigger value="hard-limits" className="text-sm">硬限制</TabsTrigger>
                  <TabsTrigger value="scopes" className="text-sm">作用域</TabsTrigger>
                  <TabsTrigger value="labels" className="text-sm">标签</TabsTrigger>
                  <TabsTrigger value="annotations" className="text-sm">注解</TabsTrigger>
                </TabsList>

                <TabsContent value="hard-limits" className="space-y-6 mt-6">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-foreground">资源硬限制</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        设置资源的最大使用限制，例如CPU、内存、Pod数量等
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <Input
                          placeholder="资源类型 (例如: cpu, memory, pods)"
                          value={hardKey}
                          onChange={(e) => setHardKey(e.target.value)}
                          className="h-10"
                        />
                        <Input
                          placeholder="限制值 (例如: 1000m, 1Gi, 10)"
                          value={hardValue}
                          onChange={(e) => setHardValue(e.target.value)}
                          className="h-10"
                        />
                        <Button type="button" onClick={addHardLimit} className="h-10">
                          <Plus className="w-4 h-4 mr-2" />
                          添加
                        </Button>
                      </div>
                    </div>

                    {Object.keys(formData.hard).length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium text-foreground">已配置的限制</Label>
                        <div className="space-y-2">
                          {Object.entries(formData.hard).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between p-3 bg-muted/50 rounded-md border">
                              <span className="font-mono text-sm font-medium">{key}: {value}</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeHardLimit(key)}
                                className="h-8 w-8 p-0"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="scopes" className="space-y-6 mt-6">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-foreground">作用域</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        设置Resource Quota的作用域限制
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                        <Select value={selectedScope} onValueChange={setSelectedScope}>
                          <SelectTrigger className="h-10">
                            <SelectValue placeholder="选择作用域" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Terminating">Terminating</SelectItem>
                            <SelectItem value="NotTerminating">NotTerminating</SelectItem>
                            <SelectItem value="BestEffort">BestEffort</SelectItem>
                            <SelectItem value="NotBestEffort">NotBestEffort</SelectItem>
                            <SelectItem value="PriorityClass">PriorityClass</SelectItem>
                            <SelectItem value="CrossNamespacePodAffinity">CrossNamespacePodAffinity</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="button" onClick={addScope} className="h-10 lg:col-span-3">
                          <Plus className="w-4 h-4 mr-2" />
                          添加作用域
                        </Button>
                      </div>
                    </div>

                    {formData.scopes.length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium text-foreground">已配置的作用域</Label>
                        <div className="flex flex-wrap gap-2">
                          {formData.scopes.map((scope) => (
                            <div key={scope} className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-2 rounded-md border">
                              <span className="text-sm font-medium">{scope}</span>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeScope(scope)}
                                className="h-6 w-6 p-0 hover:bg-primary/20"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="labels" className="space-y-6 mt-6">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-foreground">标签</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        为Resource Quota添加标签
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <Input
                          placeholder="标签键"
                          value={labelKey}
                          onChange={(e) => setLabelKey(e.target.value)}
                          className="h-10"
                        />
                        <Input
                          placeholder="标签值"
                          value={labelValue}
                          onChange={(e) => setLabelValue(e.target.value)}
                          className="h-10"
                        />
                        <Button type="button" onClick={addLabel} className="h-10">
                          <Plus className="w-4 h-4 mr-2" />
                          添加标签
                        </Button>
                      </div>
                    </div>

                    {Object.keys(formData.labels).length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium text-foreground">已配置的标签</Label>
                        <div className="space-y-2">
                          {Object.entries(formData.labels).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between p-3 bg-muted/50 rounded-md border">
                              <span className="font-mono text-sm font-medium">{key}: {value}</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeLabel(key)}
                                className="h-8 w-8 p-0"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="annotations" className="space-y-6 mt-6">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-foreground">注解</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        为Resource Quota添加注解
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                        <Input
                          placeholder="注解键"
                          value={annotationKey}
                          onChange={(e) => setAnnotationKey(e.target.value)}
                          className="h-10"
                        />
                        <Input
                          placeholder="注解值"
                          value={annotationValue}
                          onChange={(e) => setAnnotationValue(e.target.value)}
                          className="h-10"
                        />
                        <Button type="button" onClick={addAnnotation} className="h-10">
                          <Plus className="w-4 h-4 mr-2" />
                          添加注解
                        </Button>
                      </div>
                    </div>

                    {Object.keys(formData.annotations).length > 0 && (
                      <div className="space-y-3">
                        <Label className="text-sm font-medium text-foreground">已配置的注解</Label>
                        <div className="space-y-2">
                          {Object.entries(formData.annotations).map(([key, value]) => (
                            <div key={key} className="flex items-center justify-between p-3 bg-muted/50 rounded-md border">
                              <span className="font-mono text-sm font-medium">{key}: {value}</span>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => removeAnnotation(key)}
                                className="h-8 w-8 p-0"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {/* 操作按钮 */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                className="h-11 px-6"
                disabled={isSubmitting}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting}
                className="h-11 px-6"
              >
                {isSubmitting ? "提交中..." : (isEditing ? "更新" : "创建")}
              </Button>
            </div>
      </form>
    </div>
  );
}
