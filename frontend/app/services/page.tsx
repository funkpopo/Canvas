"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Plus, Trash2, Eye, Loader2, Code, FileText, ArrowLeft } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import YamlEditor from "@/components/YamlEditor";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { serviceApi, Service, namespaceApi } from "@/lib/api";
import { canManageResources } from "@/lib/utils";
import type { Cluster } from "@/lib/cluster-context";
import { toast } from "sonner";
import { useTranslations } from "@/hooks/use-translations";
import { BatchOperations, ItemCheckbox } from "@/components/BatchOperations";

export default function ServicesManagement() {
  const t = useTranslations("services");
  const tCommon = useTranslations("common");

  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("default");
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);

  // 创建对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isYamlOpen, setIsYamlOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);

  // 表单数据
  const [serviceForm, setServiceForm] = useState({
    name: "",
    namespace: "",
    type: "ClusterIP",
    selector: {} as Record<string, any>,
    ports: [{ port: 80, target_port: 80, protocol: "TCP", name: "" }],
    labels: {} as Record<string, any>,
    annotations: {} as Record<string, any>,
    cluster_ip: "",
    load_balancer_ip: "",
    external_traffic_policy: "",
    session_affinity: "",
    session_affinity_config: { timeout_seconds: 10800 }
  });

  // YAML编辑状态
  const [yamlContent, setYamlContent] = useState("");
  const [yamlPreview, setYamlPreview] = useState("");
  const [yamlError, setYamlError] = useState("");

  const { user } = useAuth();
  const { clusters } = useCluster();
  const router = useRouter();

  // 获取服务列表
  const fetchServices = async () => {
    if (!selectedClusterId || !selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await serviceApi.getServices(selectedClusterId, selectedNamespace);
      if (response.data) {
        // 为每个service添加唯一ID
        const servicesWithIds = response.data.map((service: Service) => ({
          ...service,
          id: `${service.cluster_id}-${service.namespace}-${service.name}`
        } as Service));
        setServices(servicesWithIds);
      } else if (response.error) {
        toast.error(`获取服务列表失败: ${response.error}`);
      }
    } catch {
      toast.error("获取服务列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchDelete = async (selectedServicesData: Service[]) => {
    try {
      // 使用 serviceApi 进行删除
      for (const service of selectedServicesData) {
        const result = await serviceApi.deleteService(service.cluster_id, service.namespace, service.name);

        if (result.error) {
          throw new Error(`删除服务 ${service.namespace}/${service.name} 失败`);
        }
      }

      toast.success(`批量删除成功，共删除 ${selectedServicesData.length} 个服务`);
      fetchServices();
    } catch (error) {
      console.error("批量删除服务出错:", error);
      toast.error("批量删除服务时发生错误");
      throw error;
    }
  };

  // 获取命名空间列表
  const fetchNamespaces = async () => {
    if (!selectedClusterId) return;
    try {
      const result = await namespaceApi.getNamespaces(selectedClusterId);

      if (result.data) {
        const namespaceNames = (result.data as any[]).map((ns: any) => ns.name);
        setNamespaces(namespaceNames);
      } else {
        console.error("获取命名空间列表失败");
        setNamespaces(["default"]);
      }
    } catch {
      console.error("获取命名空间列表出错");
      setNamespaces(["default"]);
    }
  };

  useEffect(() => {
    if (user && clusters.length > 0 && !selectedClusterId) {
      setSelectedClusterId(clusters[0].id);
    }
  }, [user, clusters, selectedClusterId]);

  useEffect(() => {
    if (selectedClusterId) {
      fetchNamespaces();
    }
  }, [selectedClusterId]);

  useEffect(() => {
    if (selectedClusterId && selectedNamespace) {
      fetchServices();
    }
  }, [selectedClusterId, selectedNamespace]);

  // 创建服务 (使用YAML)
  const handleCreateService = async () => {
    if (!selectedClusterId || !yamlContent.trim()) return;

    try {
      // 从YAML中解析基本信息
      const lines = yamlContent.split('\n');
      let name = serviceForm.name;
      let namespace = serviceForm.namespace;

      // 简单的YAML解析来获取metadata
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('name:')) {
          name = line.split(':')[1].trim();
        } else if (line.startsWith('namespace:')) {
          namespace = line.split(':')[1].trim();
        }
      }

      // 使用YAML API创建服务
      const response = await serviceApi.updateServiceYaml(selectedClusterId, namespace, name, yamlContent);
      if (response.data) {
        toast.success("服务创建成功");
        setIsCreateOpen(false);
        resetServiceForm();
        fetchServices();
      } else {
        toast.error(`创建服务失败: ${response.error}`);
      }
    } catch {
      toast.error("创建服务失败");
    }
  };

  // 删除服务
  const handleDeleteService = async (service: Service) => {
    try {
      const response = await serviceApi.deleteService(service.cluster_id, service.namespace, service.name);
      if (!response.error) {
        toast.success("服务删除成功");
        fetchServices();
      } else {
        toast.error(`删除服务失败: ${response.error}`);
      }
    } catch {
      toast.error("删除服务失败");
    }
  };

  // 查看YAML
  const handleViewYaml = async (service: Service) => {
    try {
      const response = await serviceApi.getServiceYaml(service.cluster_id, service.namespace, service.name);
      if (response.data) {
        setYamlPreview(response.data.yaml);
        setSelectedService(service);
        setIsYamlOpen(true);
      } else {
        toast.error(`获取YAML失败: ${response.error}`);
      }
    } catch {
      toast.error("获取YAML失败");
    }
  };

  // 重置表单
  const resetServiceForm = () => {
    const initialForm = {
      name: "",
      namespace: selectedNamespace || "default",
      type: "ClusterIP",
      selector: {},
      ports: [{ port: 80, target_port: 80, protocol: "TCP", name: "" }],
      labels: {},
      annotations: {},
      cluster_ip: "",
      load_balancer_ip: "",
      external_traffic_policy: "",
      session_affinity: "",
      session_affinity_config: { timeout_seconds: 10800 }
    };

    setServiceForm(initialForm);
    setYamlContent(`apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: ${initialForm.namespace}
spec:
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 80
    protocol: TCP
  selector:
    app: my-app
`);
    setYamlError("");
  };

  // 处理YAML变化
  const handleYamlChange = (value: string) => {
    setYamlContent(value);
    setYamlError("");
  };

  // 应用YAML模板
  const applyYamlTemplate = () => {
    const template = `apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: ${selectedNamespace || "default"}
  labels:
    environment: production
    team: backend
    version: "1.2.3"
  annotations:
    description: "Web service for user authentication"
    created-by: "canvas"
spec:
  type: ClusterIP
  ports:
  - name: http
    port: 80
    targetPort: 8080
    protocol: TCP
  - name: https
    port: 443
    targetPort: 8443
    protocol: TCP
  selector:
    app: my-app
    version: v1.0
`;
    setYamlContent(template);
  };

  // 添加端口
  const addPort = () => {
    setServiceForm(prev => ({
      ...prev,
      ports: [...prev.ports, { port: 80, target_port: 80, protocol: "TCP", name: "" }]
    }));
  };

  // 删除端口
  const removePort = (index: number) => {
    setServiceForm(prev => ({
      ...prev,
      ports: prev.ports.filter((_, i) => i !== index)
    }));
  };

  // 更新端口
  const updatePort = (index: number, field: string, value: any) => {
    setServiceForm(prev => ({
      ...prev,
      ports: prev.ports.map((port, i) => i === index ? { ...port, [field]: value } : port)
    }));
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">请先登录</h2>
          <Button onClick={() => router.push('/login')}>前往登录</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">返回仪表板</span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <ClusterSelector
                value={selectedClusterId?.toString() || ""}
                onValueChange={(value) => setSelectedClusterId(value ? parseInt(value) : null)}
              />
              <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                <SelectTrigger className="w-[200px]">
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
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("title")}
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {t("description")}
          </p>
        </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t("list")}</CardTitle>
              <CardDescription>
                {selectedNamespace ? `${tCommon("namespace")}: ${selectedNamespace}` : t("selectNamespace")}
              </CardDescription>
            </div>
            {canManageResources(user) && (
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { resetServiceForm(); setIsCreateOpen(true); }} disabled={!selectedNamespace}>
                    <Plus className="w-4 h-4 mr-2" />
                    {t("createService")}
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t("createServiceTitle")}</DialogTitle>
                  <DialogDescription>{t("createServiceDescription")}</DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="yaml" className="w-full">
                  <TabsList className="grid w-full grid-cols-1">
                    <TabsTrigger value="yaml">{t("yamlConfig")}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="yaml" className="space-y-4">
                    <YamlEditor
                      value={yamlContent}
                      onChange={handleYamlChange}
                      error={yamlError}
                      label={t("serviceYamlConfig")}
                      template={`apiVersion: v1
kind: Service
metadata:
  name: my-service
  namespace: ${selectedNamespace || "default"}
  labels:
    environment: production
    team: backend
    version: "1.2.3"
  annotations:
    description: "Web service for user authentication"
    created-by: "canvas"
spec:
  type: ClusterIP
  ports:
  - name: http
    port: 80
    targetPort: 8080
    protocol: TCP
  - name: https
    port: 443
    targetPort: 8443
    protocol: TCP
  selector:
    app: my-app
    version: v1.0
`}
                      onApplyTemplate={applyYamlTemplate}
                    />
                  </TabsContent>
                </Tabs>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>{tCommon("cancel")}</Button>
                  <Button
                    onClick={handleCreateService}
                    disabled={!yamlContent.trim() || !!yamlError}
                  >
                    {t("create")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="ml-2">{tCommon("loading")}</span>
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {selectedNamespace ? t("noServices") : t("selectNamespace")}
            </div>
          ) : (
            <>
              <BatchOperations
                items={services}
                selectedItems={selectedServices}
                onSelectionChange={setSelectedServices}
                onBatchDelete={handleBatchDelete}
                resourceType="Service"
                supportedOperations={{
                  delete: true,
                  restart: false,
                  label: false,
                }}
              />

              <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>{tCommon("name")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead>{t("clusterIP")}</TableHead>
                  <TableHead>{t("externalIP")}</TableHead>
                  <TableHead>{t("ports")}</TableHead>
                  <TableHead>{tCommon("age")}</TableHead>
                  <TableHead>{tCommon("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service) => (
                  <TableRow key={`${service.cluster_id}-${service.namespace}-${service.name}`}>
                    <TableCell>
                      <ItemCheckbox
                        itemId={service.id}
                        isSelected={selectedServices.includes(service.id)}
                        onChange={(itemId, checked) => {
                          if (checked) {
                            setSelectedServices([...selectedServices, itemId]);
                          } else {
                            setSelectedServices(selectedServices.filter(id => id !== itemId));
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{service.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{service.type}</Badge>
                    </TableCell>
                    <TableCell>{service.cluster_ip}</TableCell>
                    <TableCell>{service.external_ip || "-"}</TableCell>
                    <TableCell>
                      {service.ports.map((port: any, index: number) => (
                        <div key={index} className="text-sm">
                          {port.port}:{port.target_port}/{port.protocol}
                        </div>
                      ))}
                    </TableCell>
                    <TableCell>{service.age}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => handleViewYaml(service)}>
                          <Code className="w-4 h-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                        {canManageResources(user) && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteService(service)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>
      </main>

      {/* YAML查看对话框 */}
      <Dialog open={isYamlOpen} onOpenChange={setIsYamlOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedService ? `${selectedService.namespace}/${selectedService.name} - ${t("yamlConfig")}` : t("yamlConfig")}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Textarea
              value={yamlPreview}
              readOnly
              className="font-mono text-sm min-h-[400px]"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setIsYamlOpen(false)}>{tCommon("close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
