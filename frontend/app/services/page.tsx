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
import { Settings, Plus, Trash2, Eye, Loader2, Code } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
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

  const [yamlContent, setYamlContent] = useState("");

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

  // 创建服务
  const handleCreateService = async () => {
    if (!selectedClusterId) return;

    try {
      const response = await serviceApi.createService(selectedClusterId, serviceForm);
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
        setYamlContent(response.data.yaml);
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
    setServiceForm({
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
    });
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
          <p className="text-muted-foreground">管理Kubernetes集群中的服务资源</p>
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
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="basic">基本配置</TabsTrigger>
                    <TabsTrigger value="advanced">高级配置</TabsTrigger>
                  </TabsList>
                  <TabsContent value="basic" className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="service-name">服务名称</Label>
                        <Input
                          id="service-name"
                          value={serviceForm.name}
                          onChange={(e) => setServiceForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="my-service"
                        />
                      </div>
                      <div>
                        <Label htmlFor="service-namespace">命名空间</Label>
                        <Input
                          id="service-namespace"
                          value={serviceForm.namespace}
                          onChange={(e) => setServiceForm(prev => ({ ...prev, namespace: e.target.value }))}
                          placeholder="default"
                        />
                      </div>
                      <div>
                        <Label htmlFor="service-type">服务类型</Label>
                        <Select value={serviceForm.type} onValueChange={(value) => setServiceForm(prev => ({ ...prev, type: value }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ClusterIP">ClusterIP</SelectItem>
                            <SelectItem value="NodePort">NodePort</SelectItem>
                            <SelectItem value="LoadBalancer">LoadBalancer</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="cluster-ip">集群IP (可选)</Label>
                        <Input
                          id="cluster-ip"
                          value={serviceForm.cluster_ip}
                          onChange={(e) => setServiceForm(prev => ({ ...prev, cluster_ip: e.target.value }))}
                          placeholder="自动分配"
                        />
                      </div>
                    </div>

                    <div>
                      <Label>端口配置</Label>
                      {serviceForm.ports.map((port, index) => (
                        <div key={index} className="flex items-center gap-2 mt-2">
                          <Input
                            placeholder="名称"
                            value={port.name}
                            onChange={(e) => updatePort(index, 'name', e.target.value)}
                            className="w-24"
                          />
                          <Input
                            placeholder="端口"
                            type="number"
                            value={port.port}
                            onChange={(e) => updatePort(index, 'port', parseInt(e.target.value))}
                            className="w-20"
                          />
                          <Input
                            placeholder="目标端口"
                            value={port.target_port}
                            onChange={(e) => updatePort(index, 'target_port', e.target.value)}
                            className="w-24"
                          />
                          <Select value={port.protocol} onValueChange={(value) => updatePort(index, 'protocol', value)}>
                            <SelectTrigger className="w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="TCP">TCP</SelectItem>
                              <SelectItem value="UDP">UDP</SelectItem>
                              <SelectItem value="SCTP">SCTP</SelectItem>
                            </SelectContent>
                          </Select>
                          {serviceForm.ports.length > 1 && (
                            <Button variant="outline" size="sm" onClick={() => removePort(index)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={addPort} className="mt-2">
                        <Plus className="w-4 h-4 mr-2" />
                        添加端口
                      </Button>
                    </div>

                    <div>
                      <Label>选择器 (JSON格式)</Label>
                      <Textarea
                        placeholder='{"app": "my-app"}'
                        value={JSON.stringify(serviceForm.selector, null, 2)}
                        onChange={(e) => {
                          try {
                            const selector = JSON.parse(e.target.value);
                            setServiceForm(prev => ({ ...prev, selector }));
                          } catch {
                            // 忽略JSON解析错误
                          }
                        }}
                        className="font-mono text-sm"
                        rows={3}
                      />
                    </div>
                  </TabsContent>
                  <TabsContent value="advanced" className="space-y-4">
                    <div>
                      <Label>标签 (JSON格式)</Label>
                      <Textarea
                        placeholder='{"environment": "production"}'
                        value={JSON.stringify(serviceForm.labels, null, 2)}
                        onChange={(e) => {
                          try {
                            const labels = JSON.parse(e.target.value);
                            setServiceForm(prev => ({ ...prev, labels }));
                          } catch {
                            // 忽略JSON解析错误
                          }
                        }}
                        className="font-mono text-sm"
                        rows={3}
                      />
                    </div>
                    <div>
                      <Label>注解 (JSON格式)</Label>
                      <Textarea
                        placeholder='{"description": "My service"}'
                        value={JSON.stringify(serviceForm.annotations, null, 2)}
                        onChange={(e) => {
                          try {
                            const annotations = JSON.parse(e.target.value);
                            setServiceForm(prev => ({ ...prev, annotations }));
                          } catch {
                            // 忽略JSON解析错误
                          }
                        }}
                        className="font-mono text-sm"
                        rows={3}
                      />
                    </div>
                  </TabsContent>
                </Tabs>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>取消</Button>
                  <Button onClick={handleCreateService} disabled={!serviceForm.name || !serviceForm.namespace}>
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
              value={yamlContent}
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
