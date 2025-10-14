"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Eye, Loader2, FileText, Code, ArrowLeft } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import YamlEditor from "@/components/YamlEditor";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { configmapApi } from "@/lib/api";
import { toast } from "sonner";

interface ConfigMap {
  name: string;
  namespace: string;
  data: Record<string, any>;
  labels: Record<string, any>;
  annotations: Record<string, any>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

export default function ConfigMapsManagement() {
  const [configmaps, setConfigmaps] = useState<ConfigMap[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("default");
  const [namespaces, setNamespaces] = useState<string[]>([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [cmForm, setCmForm] = useState({
    name: "",
    namespace: "",
    data: {} as Record<string, any>,
    labels: {} as Record<string, any>,
    annotations: {} as Record<string, any>
  });

  // YAML编辑状态
  const [yamlContent, setYamlContent] = useState("");
  const [yamlError, setYamlError] = useState("");

  // 预览对话框状态
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedCm, setSelectedCm] = useState<any | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [yamlPreview, setYamlPreview] = useState("");
  const [isYamlPreviewOpen, setIsYamlPreviewOpen] = useState(false);

  const { user } = useAuth();
  const { clusters } = useCluster();
  const router = useRouter();

  const fetchConfigMaps = async () => {
    if (!selectedClusterId || !selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await configmapApi.getConfigMaps(selectedClusterId, selectedNamespace);
      if (response.data) {
        setConfigmaps(response.data);
      } else if (response.error) {
        toast.error(`获取ConfigMap列表失败: ${response.error}`);
      }
    } catch {
      toast.error("获取ConfigMap列表失败");
    } finally {
      setIsLoading(false);
    }
  };

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
      fetchConfigMaps();
    }
  }, [selectedClusterId, selectedNamespace]);

  const handleDeleteConfigMap = async (cm: ConfigMap) => {
    try {
      const response = await configmapApi.deleteConfigMap(cm.cluster_id, cm.namespace, cm.name);
      if (!response.error) {
        toast.success("ConfigMap删除成功");
        fetchConfigMaps();
      } else {
        toast.error(`删除ConfigMap失败: ${response.error}`);
      }
    } catch {
      toast.error("删除ConfigMap失败");
    }
  };

  // 查看ConfigMap详情
  const handleViewConfigMap = async (cm: ConfigMap) => {
    try {
      setIsPreviewLoading(true);
      const response = await configmapApi.getConfigMap(cm.cluster_id, cm.namespace, cm.name);
      if (response.data) {
        setSelectedCm(response.data);
        setIsPreviewOpen(true);
      } else {
        toast.error(`获取ConfigMap详情失败: ${response.error}`);
      }
    } catch {
      toast.error("获取ConfigMap详情失败");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // 查看ConfigMap YAML
  const handleViewYaml = async (cm: ConfigMap) => {
    try {
      setIsPreviewLoading(true);
      const response = await configmapApi.getConfigMapYaml(cm.cluster_id, cm.namespace, cm.name);
      if (response.data) {
        setYamlPreview(response.data.yaml);
        setSelectedCm(cm);
        setIsYamlPreviewOpen(true);
      } else {
        toast.error(`获取ConfigMap YAML失败: ${response.error}`);
      }
    } catch {
      toast.error("获取ConfigMap YAML失败");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const resetForm = () => {
    const initialForm = {
      name: "",
      namespace: selectedNamespace || "default",
      data: {},
      labels: {},
      annotations: {}
    };

    setCmForm(initialForm);
    setYamlContent(`apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
  namespace: ${initialForm.namespace}
data: {}
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
kind: ConfigMap
metadata:
  name: my-config
  namespace: ${selectedNamespace || "default"}
  labels:
    environment: production
    config-type: application
    managed-by: canvas
data:
  config.yaml: |
    apiVersion: v1
    kind: ConfigMap
    data:
      key: value
  app.properties: |
    database.url=jdbc:mysql://localhost:3306/mydb
    database.username=user
    database.password=password
  nginx.conf: |
    server {
      listen 80;
      server_name example.com;
      location / {
        proxy_pass http://localhost:8080;
      }
    }
`;
    setYamlContent(template);
  };

  // 创建ConfigMap (使用YAML)
  const handleCreateConfigMap = async () => {
    if (!selectedClusterId || !yamlContent.trim()) return;

    try {
      // 从YAML中解析基本信息
      const lines = yamlContent.split('\n');
      let name = cmForm.name;
      let namespace = cmForm.namespace;

      // 简单的YAML解析来获取metadata
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('name:')) {
          name = line.split(':')[1].trim();
        } else if (line.startsWith('namespace:')) {
          namespace = line.split(':')[1].trim();
        }
      }

      // 使用YAML API创建ConfigMap
      const response = await configmapApi.createConfigMapYaml(selectedClusterId, yamlContent);
      if (response.data) {
        toast.success("ConfigMap创建成功");
        setIsCreateOpen(false);
        resetForm();
        fetchConfigMaps();
      } else {
        toast.error(`创建ConfigMap失败: ${response.error}`);
      }
    } catch {
      toast.error("创建ConfigMap失败");
    }
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
            ConfigMaps管理
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            管理Kubernetes集群中的配置映射（支持YAML格式编辑）
          </p>
        </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>ConfigMap列表</CardTitle>
              <CardDescription>
                {selectedNamespace ? `命名空间: ${selectedNamespace}` : "请选择命名空间"}
              </CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} disabled={!selectedNamespace}>
                    <Plus className="w-4 h-4 mr-2" />
                    创建ConfigMap
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>创建ConfigMap</DialogTitle>
                  <DialogDescription>使用YAML格式创建新的配置映射</DialogDescription>
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
                      label="ConfigMap YAML配置"
                      template={`apiVersion: v1
kind: ConfigMap
metadata:
  name: my-config
  namespace: ${selectedNamespace || "default"}
  labels:
    environment: production
    config-type: application
data:
  config.yaml: |
    apiVersion: v1
    kind: ConfigMap
    data:
      key: value`}
                      onApplyTemplate={applyYamlTemplate}
                    />
                  </TabsContent>
                </Tabs>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>取消</Button>
                  <Button
                    onClick={handleCreateConfigMap}
                    disabled={!yamlContent.trim() || !!yamlError}
                  >
                    创建ConfigMap
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
          ) : configmaps.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {selectedNamespace ? "该命名空间下没有ConfigMaps" : "请选择命名空间查看ConfigMaps"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>数据项数量</TableHead>
                  <TableHead>年龄</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {configmaps.map((cm) => (
                  <TableRow key={`${cm.cluster_id}-${cm.namespace}-${cm.name}`}>
                    <TableCell className="font-medium">{cm.name}</TableCell>
                    <TableCell>{Object.keys(cm.data).length} 项</TableCell>
                    <TableCell>{cm.age}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewConfigMap(cm)}
                          disabled={isPreviewLoading}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewYaml(cm)}
                          disabled={isPreviewLoading}
                        >
                          <Code className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteConfigMap(cm)}
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
      </main>

      {/* ConfigMap详情预览对话框 */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCm ? `${selectedCm.namespace}/${selectedCm.name} - ConfigMap详情` : "ConfigMap详情"}
            </DialogTitle>
          </DialogHeader>
          {selectedCm && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-medium">名称</Label>
                  <p className="text-sm text-muted-foreground">{selectedCm.name}</p>
                </div>
                <div>
                  <Label className="font-medium">命名空间</Label>
                  <p className="text-sm text-muted-foreground">{selectedCm.namespace}</p>
                </div>
                <div>
                  <Label className="font-medium">年龄</Label>
                  <p className="text-sm text-muted-foreground">{selectedCm.age}</p>
                </div>
                <div>
                  <Label className="font-medium">数据项数量</Label>
                  <p className="text-sm text-muted-foreground">{Object.keys(selectedCm.data || {}).length} 项</p>
                </div>
              </div>

              <div>
                <Label className="font-medium">数据</Label>
                <div className="mt-1">
                  {selectedCm.data && Object.keys(selectedCm.data).length > 0 ? (
                    <div className="space-y-2">
                      {Object.entries(selectedCm.data).map(([key, value]) => (
                        <div key={key} className="bg-muted p-3 rounded">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium text-sm">{key}</span>
                          </div>
                          <div className="bg-black p-3 rounded text-xs font-mono whitespace-pre-wrap text-gray-100">
                            {String(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无数据</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">标签</Label>
                <div className="mt-1">
                  {selectedCm.labels && Object.keys(selectedCm.labels).length > 0 ? (
                    <div className="bg-black p-3 rounded text-xs font-mono text-gray-100">
                      {JSON.stringify(selectedCm.labels, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无标签</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">注解</Label>
                <div className="mt-1">
                  {selectedCm.annotations && Object.keys(selectedCm.annotations).length > 0 ? (
                    <div className="bg-black p-3 rounded text-xs font-mono text-gray-100">
                      {JSON.stringify(selectedCm.annotations, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无注解</p>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsPreviewOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ConfigMap YAML预览对话框 */}
      <Dialog open={isYamlPreviewOpen} onOpenChange={setIsYamlPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {selectedCm ? `${selectedCm.namespace}/${selectedCm.name} - YAML配置` : "YAML配置"}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <Textarea
              value={yamlPreview}
              readOnly
              className="font-mono text-xs min-h-[400px] bg-black text-gray-100"
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setIsYamlPreviewOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
