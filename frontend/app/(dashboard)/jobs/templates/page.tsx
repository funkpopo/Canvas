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
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function JobTemplatesPage() {
  const t = useTranslations("jobs");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [templates, setTemplates] = useState<JobTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
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
  const [isEditTemplateLoading, setIsEditTemplateLoading] = useState(false);
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
      const response = await jobApi.getJobTemplates(categoryFilter && categoryFilter !== "all" ? categoryFilter : undefined);
      if (response.data) {
        setTemplates(response.data);
      } else if (response.error) {
        toast.error(t("templatesLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load templates failed:", error);
      toast.error(t("templatesLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!formData.name.trim() || !formData.yaml_content.trim()) {
      toast.error(t("templateNameAndYamlRequired"));
      return;
    }

    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await jobApi.createJobTemplate(formData);
          if (!response.data) {
            throw new Error(response.error || t("templateCreateErrorUnknown"));
          }

          setIsCreateDialogOpen(false);
          resetForm();
          await fetchTemplates();
        },
        {
          loading: t("templateCreateLoading"),
          success: t("templateCreateSuccess"),
          error: t("templateCreateError"),
        }
      );
    } catch (error) {
      console.error("create template failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleEditTemplate = async () => {
    if (!selectedTemplate || !formData.name.trim() || !formData.yaml_content.trim()) {
      toast.error(t("templateNameAndYamlRequired"));
      return;
    }

    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await jobApi.updateJobTemplate(selectedTemplate.id, formData);
          if (!response.data) {
            throw new Error(response.error || t("templateUpdateErrorUnknown"));
          }

          setIsEditDialogOpen(false);
          resetForm();
          await fetchTemplates();
        },
        {
          loading: t("templateUpdateLoading"),
          success: t("templateUpdateSuccess"),
          error: t("templateUpdateError"),
        }
      );
    } catch (error) {
      console.error("update template failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleDeleteTemplate = async (templateId: number) => {
    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await jobApi.deleteJobTemplate(templateId);
          if (!response.data) {
            throw new Error(response.error || t("templateDeleteErrorUnknown"));
          }
          await fetchTemplates();
        },
        {
          loading: t("templateDeleteLoading"),
          success: t("templateDeleteSuccess"),
          error: t("templateDeleteError"),
        }
      );
    } catch (error) {
      console.error("delete template failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const openEditDialog = async (template: JobTemplate) => {
    setSelectedTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      category: template.category || "",
      yaml_content: "", // 需要从API获取
      is_public: template.is_public,
    });
    setIsEditDialogOpen(true);
    setIsEditTemplateLoading(true);

    try {
      await runWithFeedback(
        async () => {
          const response = await jobApi.getJobTemplate(template.id);
          if (!response.data) {
            throw new Error(response.error || t("templateDetailsLoadErrorUnknown"));
          }

          setFormData(prev => ({
            ...prev,
            yaml_content: response.data.yaml_content,
          }));
        },
        {
          loading: t("templateDetailsLoadLoading", { name: template.name }),
          success: t("templateDetailsLoadSuccess", { name: template.name }),
          error: t("templateDetailsLoadError"),
        }
      );
    } catch (error) {
      console.error("load template details failed:", error);
    } finally {
      setIsEditTemplateLoading(false);
    }
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
  const categories = Array.from(new Set(templates.map(t => t.category).filter(Boolean))) as string[];

  if (!isAuthenticated) {
    return <div>{t("authVerifying")}</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/jobs">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("backToJobs")}
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{t("templatesTitle")}</h1>
            <p className="text-muted-foreground">{t("templatesDescription")}</p>
          </div>
        </div>
        <div className="flex space-x-2">
          <Button onClick={fetchTemplates} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            {t("refresh")}
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                {t("createTemplate")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>{t("createTemplateTitle")}</DialogTitle>
                <DialogDescription>
                  {t("createTemplateDescription")}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="template-name">{t("templateNameRequired")}</Label>
                    <Input
                      id="template-name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder={t("templateNamePlaceholder")}
                    />
                  </div>
                  <div>
                    <Label htmlFor="template-category">{t("categoryLabel")}</Label>
                    <Input
                      id="template-category"
                      value={formData.category}
                      onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                      placeholder={t("categoryPlaceholder")}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="template-description">{t("descriptionLabel")}</Label>
                  <Input
                    id="template-description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder={t("descriptionPlaceholder")}
                  />
                </div>
                <div>
                  <Label htmlFor="template-yaml">{t("yamlConfigRequired")}</Label>
                  <Textarea
                    id="template-yaml"
                    placeholder={t("yamlPlaceholder")}
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
                  <Label htmlFor="template-public">{t("publicTemplateDescription")}</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button onClick={handleCreateTemplate} disabled={isOperationLoading}>
                  {isOperationLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t("create")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("templatesListTitle")}</CardTitle>
          <CardDescription>
            {t("templatesListDescription")}
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
                    placeholder={t("searchTemplateNameOrDescription")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="min-w-[150px]">
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("allCategories")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("allCategories")}</SelectItem>
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
                <span className="ml-2">{tCommon("loading")}</span>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("templateName")}</TableHead>
                      <TableHead>{t("categoryLabel")}</TableHead>
                      <TableHead>{t("descriptionLabel")}</TableHead>
                      <TableHead>{t("publicLabel")}</TableHead>
                      <TableHead>{t("createdAtLabel")}</TableHead>
                      <TableHead>{tCommon("actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTemplates.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          {t("noMatchingTemplates")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTemplates.map((template) => (
                        <TableRow key={template.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{template.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {t("templateId", { id: template.id })}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {template.category && (
                              <Badge variant="outline">{template.category}</Badge>
                            )}
                          </TableCell>
                          <TableCell>{template.description || t("emptyValue")}</TableCell>
                          <TableCell>
                            {template.is_public ? (
                              <Badge variant="default">
                                <Eye className="h-3 w-3 mr-1" />
                                {t("publicTemplate")}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <EyeOff className="h-3 w-3 mr-1" />
                                {t("privateTemplate")}
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
                                disabled={isOperationLoading || isEditTemplateLoading}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmDialog({
                                  open: true,
                                  title: t("deleteTemplateTitle"),
                                  description: t("deleteTemplateDescription", { name: template.name }),
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
            <DialogTitle>{t("editTemplateTitle")}</DialogTitle>
            <DialogDescription>
              {t("editTemplateDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-template-name">{t("templateNameRequired")}</Label>
                <Input
                  id="edit-template-name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder={t("templateNamePlaceholder")}
                />
              </div>
              <div>
                <Label htmlFor="edit-template-category">{t("categoryLabel")}</Label>
                <Input
                  id="edit-template-category"
                  value={formData.category}
                  onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                  placeholder={t("categoryPlaceholder")}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="edit-template-description">{t("descriptionLabel")}</Label>
              <Input
                id="edit-template-description"
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder={t("descriptionPlaceholder")}
              />
            </div>
            <div>
              <Label htmlFor="edit-template-yaml">{t("yamlConfigRequired")}</Label>
              <Textarea
                id="edit-template-yaml"
                placeholder={t("yamlPlaceholder")}
                value={formData.yaml_content}
                onChange={(e) => setFormData(prev => ({ ...prev, yaml_content: e.target.value }))}
                disabled={isEditTemplateLoading}
                className="min-h-[300px] font-mono text-sm"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-template-public"
                checked={formData.is_public}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_public: checked as boolean }))}
              />
              <Label htmlFor="edit-template-public">{t("publicTemplateDescription")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleEditTemplate} disabled={isOperationLoading || isEditTemplateLoading}>
              {isOperationLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("update")}
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

