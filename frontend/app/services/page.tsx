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
import { Settings, Plus, Trash2, Eye, Loader2, Code, FileText } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import YamlEditor from "@/components/YamlEditor";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { serviceApi } from "@/lib/api";
import type { Cluster } from "@/lib/cluster-context";
import { toast } from "sonner";

interface Service {
  name: string;
  namespace: string;
  type: string;
  cluster_ip: string;
  external_ip: string | null;
  ports: any[];
  selector: Record<string, any>;
  labels: Record<string, any>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

export default function ServicesManagement() {
  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("default");
  const [namespaces, setNamespaces] = useState<string[]>([]);

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
        setServices(response.data);
      } else if (response.error) {
        toast.error(`获取服务列表失败: ${response.error}`);
      }
    } catch {
      toast.error("获取服务列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  // 获取命名空间列表
  const fetchNamespaces = async () => {
    if (!selectedClusterId) return;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`http://localhost:8000/api/namespaces?cluster_id=${selectedClusterId}`, {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        const namespaceNames = data.map((ns: any) => ns.name);
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
      if (response.data) {
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
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">服务管理</h1>
          <p className="text-muted-foreground">管理Kubernetes集群中的服务资源（支持YAML格式编辑）</p>
        </div>
        <div className="flex items-center gap-4">
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>服务列表</CardTitle>
              <CardDescription>
                {selectedNamespace ? `命名空间: ${selectedNamespace}` : "请选择命名空间"}
              </CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetServiceForm(); setIsCreateOpen(true); }} disabled={!selectedNamespace}>
                  <Plus className="w-4 h-4 mr-2" />
                  创建服务
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>创建服务</DialogTitle>
                  <DialogDescription>创建新的Kubernetes服务</DialogDescription>
                </DialogHeader>
                <Tabs defaultValue="yaml" className="w-full">
                  <TabsList className="grid w-full grid-cols-1">
                    <TabsTrigger value="yaml">YAML配置</TabsTrigger>
                  </TabsList>
                  <TabsContent value="yaml" className="space-y-4">
                    <YamlEditor
                      value={yamlContent}
                      onChange={handleYamlChange}
                      error={yamlError}
                      label="Service YAML配置"
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
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>取消</Button>
                  <Button
                    onClick={handleCreateService}
                    disabled={!yamlContent.trim() || !!yamlError}
                  >
                    创建服务
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="ml-2">加载中...</span>
            </div>
          ) : services.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {selectedNamespace ? "该命名空间下没有服务" : "请选择命名空间查看服务"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>集群IP</TableHead>
                  <TableHead>外部IP</TableHead>
                  <TableHead>端口</TableHead>
                  <TableHead>年龄</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {services.map((service) => (
                  <TableRow key={`${service.cluster_id}-${service.namespace}-${service.name}`}>
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteService(service)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* YAML查看对话框 */}
      <Dialog open={isYamlOpen} onOpenChange={setIsYamlOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedService ? `${selectedService.namespace}/${selectedService.name} - YAML配置` : "YAML配置"}
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
            <Button onClick={() => setIsYamlOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
