"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Settings } from "lucide-react";
import IngressForm from "@/components/IngressForm";
import IngressYamlEditor from "@/components/IngressYamlEditor";
import { ingressApi } from "@/lib/api";
import { toast } from "sonner";

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

interface IngressEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  namespace: string;
  clusterId: number | null;
  ingress?: any; // 用于编辑模式
  onSuccess: () => void;
  mode?: 'create' | 'update';
}

export default function IngressEditor({
  open,
  onOpenChange,
  namespace,
  clusterId,
  ingress,
  onSuccess,
  mode = 'create'
}: IngressEditorProps) {
  const [activeTab, setActiveTab] = useState("form");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<any>(null);

  const handleFormSubmit = async (formData: IngressFormData) => {
    // 显示确认对话框
    const confirmMessage = mode === 'create'
      ? `确定要创建Ingress "${formData.name}" 吗？`
      : `确定要更新Ingress "${ingress?.namespace}/${ingress?.name}" 吗？`;

    if (!confirm(confirmMessage)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = mode === 'create'
        ? await ingressApi.createIngress(clusterId!, formData)
        : await ingressApi.updateIngress(clusterId!, ingress.namespace, ingress.name, formData);

      if (response.data) {
        toast.success(`Ingress${mode === 'create' ? '创建' : '更新'}成功`);
        onOpenChange(false);
        onSuccess();
      } else {
        toast.error(`Ingress${mode === 'create' ? '创建' : '更新'}失败: ${response.error}`);
      }
    } catch (error) {
      toast.error(`Ingress${mode === 'create' ? '创建' : '更新'}失败`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleYamlSubmit = async (yamlContent: string) => {
    setIsSubmitting(true);
    try {
      // 这里需要后端API支持YAML创建/更新
      // 暂时使用现有的API，未来需要扩展后端支持YAML模式
      toast.error("YAML模式暂未实现，请使用表单模式");
      return;

      // 未来实现：
      // const response = mode === 'create'
      //   ? await ingressApi.createIngressYaml(clusterId!, { yaml_content: yamlContent })
      //   : await ingressApi.updateIngressYaml(clusterId!, namespace, ingress.name, { yaml_content: yamlContent });
    } catch (error) {
      toast.error(`YAML${mode === 'create' ? '创建' : '更新'}失败`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const handleYamlToForm = (convertedFormData: any) => {
    setFormData(convertedFormData);
    setActiveTab("form");
  };

  const getInitialFormData = () => {
    // 如果有转换的数据，优先使用
    if (formData) {
      return formData;
    }

    if (mode === 'update' && ingress) {
      return {
        name: ingress.name,
        namespace: ingress.namespace,
        class_name: ingress.class_name || '',
        rules: ingress.rules || [{ host: '', paths: [{ path: '/', path_type: 'Prefix', service_name: '', service_port: '' }] }],
        tls: ingress.tls || [],
        labels: ingress.labels || {},
        annotations: ingress.annotations || {}
      };
    }
    return {
      name: '',
      namespace: namespace,
      class_name: '',
      rules: [{ host: '', paths: [{ path: '/', path_type: 'Prefix', service_name: '', service_port: '' }] }],
      tls: [],
      labels: {},
      annotations: {}
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {mode === 'create' ? '创建Ingress' : `编辑 ${ingress?.namespace}/${ingress?.name}`}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
            <TabsTrigger value="form" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              表单编辑
            </TabsTrigger>
            <TabsTrigger value="yaml" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              YAML编辑
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4 min-h-0">
            <TabsContent value="form" className="mt-0">
              <IngressForm
                initialData={getInitialFormData()}
                namespace={namespace}
                clusterId={clusterId}
                onSubmit={handleFormSubmit}
                onCancel={handleCancel}
                isLoading={isSubmitting}
                mode={mode}
              />
            </TabsContent>

            <TabsContent value="yaml" className="mt-0">
              <IngressYamlEditor
                namespace={namespace}
                ingressName={ingress?.name}
                clusterId={clusterId}
                onSubmit={handleYamlSubmit}
                onCancel={handleCancel}
                onSwitchToForm={handleYamlToForm}
                isLoading={isSubmitting}
                mode={mode}
              />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
