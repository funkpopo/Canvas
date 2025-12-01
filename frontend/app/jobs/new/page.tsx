"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, FileText, Search } from "lucide-react";
import { jobApi, namespaceApi, JobTemplate } from "@/lib/api";
import { toast } from "sonner";

interface Namespace {
  name: string;
  status: string;
}

function CreateJobContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<JobTemplate | null>(null);
  const [yamlContent, setYamlContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [templateSearch, setTemplateSearch] = useState("");

  const router = useRouter();
  const searchParams = useSearchParams();
  const clusterId = searchParams.get('cluster_id');

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setIsAuthenticated(true);
  }, [router]);

  useEffect(() => {
    if (isAuthenticated && clusterId) {
      fetchNamespaces();
      fetchTemplates();
    }
  }, [isAuthenticated, clusterId]);

  const fetchNamespaces = async () => {
    try {
      const response = await namespaceApi.getNamespaces(parseInt(clusterId!));
      if (response.data) {
        setNamespaces(response.data);
        if (response.data.length > 0 && !selectedNamespace) {
          setSelectedNamespace(response.data[0].name);
        }
      } else if (response.error) {
        toast.error('获取命名空间失败: ' + response.error);
      }
    } catch (error) {
      console.error('获取命名空间失败:', error);
      toast.error('获取命名空间失败');
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await jobApi.getJobTemplates();
      if (response.data) {
        setTemplates(response.data);
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('获取模板失败:', error);
      toast.error('获取模板失败');
    }
  };

  const handleSelectTemplate = async (template: JobTemplate) => {
    setSelectedTemplate(template);
    setIsLoading(true);

    try {
      const response = await jobApi.getJobTemplate(template.id);
      if (response.data) {
        setYamlContent(response.data.yaml_content);
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('获取模板详情失败:', error);
      toast.error('获取模板详情失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateJob = async () => {
    if (!selectedNamespace) {
      toast.error('请选择命名空间');
      return;
    }

    if (!yamlContent.trim()) {
      toast.error('请输入YAML配置');
      return;
    }

    setIsOperationLoading(true);
    try {
      const response = await jobApi.createJob(
        parseInt(clusterId!),
        selectedNamespace,
        yamlContent,
        selectedTemplate?.id
      );

      if (response.data) {
        toast.success('Job创建成功');
        router.push(`/jobs?cluster_id=${clusterId}`);
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('创建Job失败:', error);
      toast.error('创建Job失败');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
    (template.description && template.description.toLowerCase().includes(templateSearch.toLowerCase())) ||
    (template.category && template.category.toLowerCase().includes(templateSearch.toLowerCase()))
  );

  if (!isAuthenticated) {
    return <div>验证中...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href={`/jobs?cluster_id=${clusterId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回Jobs
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">创建Job</h1>
            <p className="text-muted-foreground">选择模板或直接输入YAML配置来创建Job</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：模板选择 */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>选择模板</CardTitle>
              <CardDescription>
                从预设模板开始，或直接输入YAML配置
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 命名空间选择 */}
              <div>
                <Label htmlFor="namespace">命名空间</Label>
                <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择命名空间" />
                  </SelectTrigger>
                  <SelectContent>
                    {namespaces.map((ns) => (
                      <SelectItem key={ns.name} value={ns.name}>
                        {ns.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 模板搜索 */}
              <div>
                <Label htmlFor="template-search">搜索模板</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    id="template-search"
                    placeholder="搜索模板名称、描述或分类..."
                    value={templateSearch}
                    onChange={(e) => setTemplateSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* 模板列表 */}
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                <div
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    !selectedTemplate ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setSelectedTemplate(null);
                    setYamlContent("");
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">自定义YAML</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    直接输入或粘贴YAML配置
                  </p>
                </div>

                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedTemplate?.id === template.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => handleSelectTemplate(template)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4" />
                        <span className="font-medium">{template.name}</span>
                      </div>
                      {template.is_public && (
                        <Badge variant="outline" className="text-xs">公开</Badge>
                      )}
                    </div>
                    {template.category && (
                      <Badge variant="secondary" className="text-xs mt-1 mr-2">
                        {template.category}
                      </Badge>
                    )}
                    {template.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {template.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* 模板管理链接 */}
              <div className="pt-4 border-t">
                <Link href="/jobs/templates">
                  <Button variant="outline" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    管理模板
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 右侧：YAML编辑器 */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>
                YAML配置
                {selectedTemplate && (
                  <Badge variant="outline" className="ml-2">
                    模板: {selectedTemplate.name}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {selectedTemplate
                  ? `基于模板 "${selectedTemplate.name}" 进行配置`
                  : "输入或粘贴Job的YAML配置"
                }
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="ml-2">加载模板中...</span>
                </div>
              ) : (
                <Textarea
                  placeholder="粘贴Job的YAML配置..."
                  value={yamlContent}
                  onChange={(e) => setYamlContent(e.target.value)}
                  className="min-h-[500px] font-mono text-sm"
                />
              )}

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setYamlContent("")}>
                  清空
                </Button>
                <Button onClick={handleCreateJob} disabled={isOperationLoading || !selectedNamespace}>
                  {isOperationLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  创建Job
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function CreateJobPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <CreateJobContent />
    </Suspense>
  );
}

