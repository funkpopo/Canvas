"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, RefreshCw, Plus, Search, Edit, Trash2, Eye, EyeOff } from "lucide-react";
import { jobApi, JobTemplate } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function JobTemplatesPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<JobTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    yaml_content: "",
    is_public: true,
  });
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }

    setIsAuthenticated(true);
  }, [router]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchTemplates();
    }
  }, [isAuthenticated]);

  const fetchTemplates = async () => {
    setIsLoading(true);
    try {
      const response = await jobApi.getJobTemplates(categoryFilter || undefined);
      if (response.data) {
        setTemplates(response.data);
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('获取模板失败:', error);
      toast.error('获取模板失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!formData.name.trim() || !formData.yaml_content.trim()) {
      toast.error('请填写模板名称和YAML内容');
      return;
    }

    setIsOperationLoading(true);
    try {
      const response = await jobApi.createJobTemplate(formData);
      if (response.data) {
        toast.success('模板创建成功');
        setIsCreateDialogOpen(false);
        resetForm();
        fetchTemplates();
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('创建模板失败:', error);
      toast.error('创建模板失败');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleEditTemplate = async () => {
    if (!selectedTemplate || !formData.name.trim() || !formData.yaml_content.trim()) {
      toast.error('请填写模板名称和YAML内容');
      return;
    }

    setIsOperationLoading(true);
    try {
      const response = await jobApi.updateJobTemplate(selectedTemplate.id, formData);
      if (response.data) {
        toast.success('模板更新成功');
        setIsEditDialogOpen(false);
        resetForm();
        fetchTemplates();
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('更新模板失败:', error);
      toast.error('更新模板失败');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleDeleteTemplate = async (templateId: number) => {
    setIsOperationLoading(true);
    try {
      const response = await jobApi.deleteJobTemplate(templateId);
      if (response.data) {
        toast.success('模板删除成功');
        fetchTemplates();
      } else if (response.error) {
        toast.error(response.error);
      }
    } catch (error) {
      console.error('删除模板失败:', error);
      toast.error('删除模板失败');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const openEditDialog = (template: JobTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      category: template.category || "",
      yaml_content: "", // 需要从API获取
      is_public: template.is_public,
    });
    setIsEditDialogOpen(true);

    // 获取模板的YAML内容
    jobApi.getJobTemplate(template.id).then(response => {
      if (response.data) {
        setFormData(prev => ({
          ...prev,
          yaml_content: response.data.yaml_content,
        }));
      }
    });
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      category: "",
      yaml_content: "",
      is_public: true,
    });
    setSelectedTemplate(null);
  };

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (template.description && template.description.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = !categoryFilter || template.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  // 获取所有分类
  const categories = Array.from(new Set(templates.map(t => t.category).filter(Boolean)));

  if (!isAuthenticated) {
    return <div>验证中...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/jobs">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回Jobs
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Job模板管理</h1>
            <p className="text-muted-foreground">管理和重用常用的Job配置模板</p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button onClick={fetchTemplates} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                创建模板
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>创建Job模板</DialogTitle>
                <DialogDescription>
                  创建可重用的Job配置模板
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="template-name">模板名称 *</Label>
                    <Input
                      id="template-name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="输入模板名称"
                    />
                  </div>
                  <div>
                    <Label htmlFor="template-category">分类</Label>
                    <Input
                      id="template-category"
                      value={formData.category}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                      placeholder="如：数据处理、备份、测试"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="template-description">描述</Label>
                  <Input
                    id="template-description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="模板描述"
                  />
                </div>
                <div>
                  <Label htmlFor="template-yaml">YAML配置 *</Label>
                  <Textarea
                    id="template-yaml"
                    placeholder="粘贴Job的YAML配置..."
                    value={formData.yaml_content}
                    onChange={(e) => setFormData(prev => ({ ...prev, yaml_content: e.target.value }))}
                    className="min-h-[300px] font-mono text-sm"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="template-public"
                    checked={formData.is_public}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_public: checked as boolean }))}
                  />
                  <Label htmlFor="template-public">公开模板（其他用户可以查看和使用）</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  取消
                </Button>
                <Button onClick={handleCreateTemplate} disabled={isOperationLoading}>
                  {isOperationLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  创建
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Job模板列表</CardTitle>
          <CardDescription>
            查看和管理所有可用的Job模板
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            {/* 筛选器 */}
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="搜索模板名称或描述..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="min-w-[150px]">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="所有分类" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">所有分类</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 模板列表 */}
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">加载中...</span>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>模板名称</TableHead>
                      <TableHead>分类</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead>公开</TableHead>
                      <TableHead>创建时间</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTemplates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          没有找到匹配的模板
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTemplates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{template.name}</div>
                              <div className="text-sm text-muted-foreground">
                                ID: {template.id}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {template.category && (
                              <Badge variant="outline">{template.category}</Badge>
                            )}
                          </TableCell>
                          <TableCell>{template.description || '-'}</TableCell>
                          <TableCell>
                            {template.is_public ? (
                              <Badge variant="default">
                                <Eye className="h-3 w-3 mr-1" />
                                公开
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <EyeOff className="h-3 w-3 mr-1" />
                                私有
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {new Date(template.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openEditDialog(template)}
                                disabled={isOperationLoading}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmDialog({
                                  open: true,
                                  title: "删除模板",
                                  description: `确定要删除模板 "${template.name}" 吗？`,
                                  onConfirm: () => handleDeleteTemplate(template.id),
                                })}
                                disabled={isOperationLoading}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 编辑模板对话框 */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>编辑Job模板</DialogTitle>
            <DialogDescription>
              修改模板配置信息
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-template-name">模板名称 *</Label>
                <Input
                  id="edit-template-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="输入模板名称"
                />
              </div>
              <div>
                <Label htmlFor="edit-template-category">分类</Label>
                <Input
                  id="edit-template-category"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder="如：数据处理、备份、测试"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-template-description">描述</Label>
              <Input
                id="edit-template-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="模板描述"
              />
            </div>
            <div>
              <Label htmlFor="edit-template-yaml">YAML配置 *</Label>
              <Textarea
                id="edit-template-yaml"
                placeholder="粘贴Job的YAML配置..."
                value={formData.yaml_content}
                onChange={(e) => setFormData(prev => ({ ...prev, yaml_content: e.target.value }))}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-template-public"
                checked={formData.is_public}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_public: checked as boolean }))}
              />
              <Label htmlFor="edit-template-public">公开模板（其他用户可以查看和使用）</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleEditTemplate} disabled={isOperationLoading}>
              {isOperationLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              更新
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
      />
    </div>
  );
}

