"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle, Upload, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ClusterFormData {
  name: string;
  endpoint: string;
  auth_type: 'kubeconfig' | 'token';
  kubeconfig_content: string;
  token: string;
  ca_cert: string;
  is_active: boolean;
}

interface ClusterFormProps {
  initialData?: Partial<ClusterFormData>;
  isEdit?: boolean;
  clusterId?: number;
}

export default function ClusterForm({ initialData, isEdit = false, clusterId }: ClusterFormProps) {
  const [formData, setFormData] = useState<ClusterFormData>({
    name: initialData?.name || '',
    endpoint: initialData?.endpoint || '',
    auth_type: initialData?.auth_type || 'kubeconfig',
    kubeconfig_content: initialData?.kubeconfig_content || '',
    token: initialData?.token || '',
    ca_cert: initialData?.ca_cert || '',
    is_active: initialData?.is_active ?? true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleInputChange = (field: keyof ClusterFormData, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        setFormData(prev => ({
          ...prev,
          kubeconfig_content: content
        }));
      };
      reader.readAsText(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem("token");
      const url = isEdit && clusterId
        ? `http://localhost:8000/api/clusters/${clusterId}`
        : "http://localhost:8000/api/clusters";

      const method = isEdit ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push("/clusters");
      } else {
        const errorData = await response.json();
        setError(errorData.detail || "操作失败");
      }
    } catch (error) {
      console.error("提交表单出错:", error);
      setError("网络错误，请检查后端服务");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>{isEdit ? '编辑集群' : '添加新集群'}</CardTitle>
        <CardDescription>
          {isEdit ? '修改集群配置信息' : '配置新的Kubernetes集群连接'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">集群名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="production-cluster"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endpoint">API服务器地址 *</Label>
              <Input
                id="endpoint"
                value={formData.endpoint}
                onChange={(e) => handleInputChange('endpoint', e.target.value)}
                placeholder="https://k8s-api.example.com:6443"
                required
              />
            </div>
          </div>

          <div className="space-y-4">
            <Label>认证方式</Label>
            <RadioGroup
              value={formData.auth_type}
              onValueChange={(value: 'kubeconfig' | 'token') => handleInputChange('auth_type', value)}
              className="flex space-x-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="kubeconfig" id="kubeconfig" />
                <Label htmlFor="kubeconfig">Kubeconfig文件</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="token" id="token" />
                <Label htmlFor="token">服务账号Token</Label>
              </div>
            </RadioGroup>
          </div>

          {formData.auth_type === 'kubeconfig' && (
            <div className="space-y-2">
              <Label htmlFor="kubeconfig">Kubeconfig内容 *</Label>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Input
                    type="file"
                    accept=".yaml,.yml"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="kubeconfig-file"
                  />
                  <Label
                    htmlFor="kubeconfig-file"
                    className="flex items-center space-x-2 cursor-pointer bg-gray-50 dark:bg-gray-800 px-3 py-2 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <Upload className="h-4 w-4" />
                    <span>选择Kubeconfig文件</span>
                  </Label>
                </div>
                <Textarea
                  id="kubeconfig"
                  value={formData.kubeconfig_content}
                  onChange={(e) => handleInputChange('kubeconfig_content', e.target.value)}
                  placeholder="粘贴或上传您的kubeconfig内容..."
                  rows={10}
                  required={formData.auth_type === 'kubeconfig'}
                />
              </div>
            </div>
          )}

          {formData.auth_type === 'token' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="token">服务账号Token *</Label>
                <Textarea
                  id="token"
                  value={formData.token}
                  onChange={(e) => handleInputChange('token', e.target.value)}
                  placeholder="eyJhbGciOiJSUzI1NiIsImtpZCI6..."
                  rows={3}
                  required={formData.auth_type === 'token'}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ca_cert">CA证书 (可选)</Label>
                <Textarea
                  id="ca_cert"
                  value={formData.ca_cert}
                  onChange={(e) => handleInputChange('ca_cert', e.target.value)}
                  placeholder="-----BEGIN CERTIFICATE-----..."
                  rows={5}
                />
              </div>
            </div>
          )}

          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => handleInputChange('is_active', checked as boolean)}
            />
            <Label htmlFor="is_active">启用集群</Label>
          </div>

          <div className="flex space-x-4">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {isEdit ? '更新集群' : '添加集群'}
            </Button>
            <Button type="button" variant="outline" onClick={() => router.back()}>
              取消
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
