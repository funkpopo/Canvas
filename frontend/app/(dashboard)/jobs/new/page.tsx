"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, FileText, Search } from "lucide-react";
import { jobApi, namespaceApi, JobTemplate } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import { toast } from "sonner";

interface Namespace {
  name: string;
  status: string;
}

function CreateJobContent() {
  const t = useTranslations("jobs");
  const { runWithFeedback } = useAsyncActionFeedback();
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
  const clusterId = searchParams.get("cluster_id");
  const clusterIdNum = clusterId ? parseInt(clusterId, 10) : null;

  useEffect(() => {
    if (clusterIdNum) {
      fetchNamespaces();
      fetchTemplates();
    }
  }, [clusterIdNum]);

  const fetchNamespaces = async () => {
    if (!clusterIdNum) return;

    try {
      const response = await namespaceApi.getNamespaces(clusterIdNum);
      if (response.data) {
        setNamespaces(response.data);
        if (response.data.length > 0 && !selectedNamespace) {
          setSelectedNamespace(response.data[0].name);
        }
      } else if (response.error) {
        toast.error(t("namespacesLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load namespaces failed:", error);
      toast.error(t("namespacesLoadError"));
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await jobApi.getJobTemplates();
      if (response.data) {
        setTemplates(response.data);
      } else if (response.error) {
        toast.error(t("templatesLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load templates failed:", error);
      toast.error(t("templatesLoadError"));
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
        toast.error(t("templateDetailsLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load template details failed:", error);
      toast.error(t("templateDetailsLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateJob = async () => {
    if (!clusterIdNum) {
      toast.error(t("selectClusterFirst"));
      return;
    }

    if (!selectedNamespace) {
      toast.error(t("selectNamespaceRequired"));
      return;
    }

    if (!yamlContent.trim()) {
      toast.error(t("yamlRequired"));
      return;
    }

    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await jobApi.createJob(
            clusterIdNum,
            selectedNamespace,
            yamlContent,
            selectedTemplate?.id
          );

          if (!response.data) {
            throw new Error(response.error || t("createErrorUnknown"));
          }

          router.push(`/jobs?cluster_id=${clusterIdNum}`);
        },
        {
          loading: t("createLoading"),
          success: t("createSuccess"),
          error: t("createError"),
        }
      );
    } catch (error) {
      console.error("create job failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const filteredTemplates = templates.filter(
    (template) =>
      template.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
      (template.description &&
        template.description.toLowerCase().includes(templateSearch.toLowerCase())) ||
      (template.category && template.category.toLowerCase().includes(templateSearch.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href={`/jobs?cluster_id=${clusterId}`}>
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("backToJobs")}
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{t("createJobTitle")}</h1>
            <p className="text-muted-foreground">{t("createPageDescription")}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：模板选择 */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle>{t("selectTemplate")}</CardTitle>
              <CardDescription>{t("selectTemplateDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 命名空间选择 */}
              <div>
                <Label htmlFor="namespace">{t("namespaceLabel")}</Label>
                <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("selectNamespacePlaceholder")} />
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
                <Label htmlFor="template-search">{t("searchTemplate")}</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    id="template-search"
                    placeholder={t("searchTemplatePlaceholder")}
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
                    !selectedTemplate ? "border-blue-500 bg-blue-50" : "hover:bg-gray-50"
                  }`}
                  onClick={() => {
                    setSelectedTemplate(null);
                    setYamlContent("");
                  }}
                >
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4" />
                    <span className="font-medium">{t("customYaml")}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{t("customYamlDescription")}</p>
                </div>

                {filteredTemplates.map((template) => (
                  <div
                    key={template.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedTemplate?.id === template.id
                        ? "border-blue-500 bg-blue-50"
                        : "hover:bg-gray-50"
                    }`}
                    onClick={() => handleSelectTemplate(template)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4" />
                        <span className="font-medium">{template.name}</span>
                      </div>
                      {template.is_public && (
                        <Badge variant="outline" className="text-xs">
                          {t("publicTemplate")}
                        </Badge>
                      )}
                    </div>
                    {template.category && (
                      <Badge variant="secondary" className="text-xs mt-1 mr-2">
                        {template.category}
                      </Badge>
                    )}
                    {template.description && (
                      <p className="text-sm text-muted-foreground mt-1">{template.description}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* 模板管理链接 */}
              <div className="pt-4 border-t">
                <Link href="/jobs/templates">
                  <Button variant="outline" className="w-full">
                    <Plus className="h-4 w-4 mr-2" />
                    {t("manageTemplates")}
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
                {t("yamlConfig")}
                {selectedTemplate && (
                  <Badge variant="outline" className="ml-2">
                    {t("templateBadge", { name: selectedTemplate.name })}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {selectedTemplate
                  ? t("templateBasedConfig", { name: selectedTemplate.name })
                  : t("yamlInputDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <Textarea
                  placeholder={t("yamlPlaceholder")}
                  value={yamlContent}
                  onChange={(e) => setYamlContent(e.target.value)}
                  className="min-h-[500px] font-mono text-sm"
                />
              )}

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setYamlContent("")}>
                  {t("clear")}
                </Button>
                <Button
                  onClick={handleCreateJob}
                  disabled={isOperationLoading || !selectedNamespace}
                >
                  {isOperationLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t("createJob")}
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
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <CreateJobContent />
    </Suspense>
  );
}
