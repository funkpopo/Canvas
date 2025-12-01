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
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Eye, Loader2, Lock, Code, ArrowLeft } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import YamlEditor from "@/components/YamlEditor";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { secretApi, namespaceApi } from "@/lib/api";
import { toast } from "sonner";

interface Secret {
  name: string;
  namespace: string;
  type: string;
  data_keys: string[];
  labels: Record<string, any>;
  annotations: Record<string, any>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

export default function SecretsManagement() {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("default");
  const [namespaces, setNamespaces] = useState<string[]>([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [secretForm, setSecretForm] = useState({
    name: "",
    namespace: "",
    type: "Opaque",
    data: {} as Record<string, any>,
    labels: {} as Record<string, any>,
    annotations: {} as Record<string, any>
  });

  // YAML编辑状态
  const [yamlContent, setYamlContent] = useState("");
  const [yamlError, setYamlError] = useState("");
  const [yamlPreview, setYamlPreview] = useState("");
  const [isYamlPreviewOpen, setIsYamlPreviewOpen] = useState(false);

  const { user } = useAuth();
  const { clusters } = useCluster();
  const router = useRouter();

  const fetchSecrets = async () => {
    if (!selectedClusterId || !selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await secretApi.getSecrets(selectedClusterId, selectedNamespace);
      if (response.data) {
        setSecrets(response.data);
      } else if (response.error) {
        toast.error(`获取Secret列表失败: ${response.error}`);
      }
    } catch {
      toast.error("获取Secret列表失败");
    } finally {
      setIsLoading(false);
    }
  };

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
      fetchSecrets();
    }
  }, [selectedClusterId, selectedNamespace]);

  // 创建Secret (使用YAML)
  const handleCreateSecret = async () => {
    if (!selectedClusterId || !yamlContent.trim()) return;

    try {
      // 从YAML中解析基本信息
      const lines = yamlContent.split('\n');
      let name = secretForm.name;
      let namespace = secretForm.namespace;

      // 简单的YAML解析来获取metadata
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('name:')) {
          name = line.split(':')[1].trim();
        } else if (line.startsWith('namespace:')) {
          namespace = line.split(':')[1].trim();
        }
      }

      // 使用YAML API创建Secret
      const response = await secretApi.createSecretYaml(selectedClusterId, yamlContent);
      if (response.data) {
        toast.success("Secret创建成功");
        setIsCreateOpen(false);
        resetForm();
        fetchSecrets();
      } else {
        toast.error(`创建Secret失败: ${response.error}`);
      }
    } catch {
      toast.error("创建Secret失败");
    }
  };

  const handleDeleteSecret = async (secret: Secret) => {
    try {
      const response = await secretApi.deleteSecret(secret.cluster_id, secret.namespace, secret.name);
      if (!response.error) {
        toast.success("Secret删除成功");
        fetchSecrets();
      } else {
        toast.error(`删除Secret失败: ${response.error}`);
      }
    } catch {
      toast.error("删除Secret失败");
    }
  };

  const resetForm = () => {
    const initialForm = {
      name: "",
      namespace: selectedNamespace || "default",
      type: "Opaque",
      data: {},
      labels: {},
      annotations: {}
    };

    setSecretForm(initialForm);
    setYamlContent(`apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: ${initialForm.namespace}
type: Opaque
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
kind: Secret
metadata:
  name: my-secret
  namespace: ${selectedNamespace || "default"}
  labels:
    environment: production
    managed-by: canvas
type: Opaque
data:
  username: YWRtaW4=  # base64 encoded "admin"
  password: c2VjcmV0  # base64 encoded "secret"
stringData:
  config.json: |
    {
      "database": {
        "host": "localhost",
        "port": 5432,
        "name": "mydb"
      },
      "features": {
        "debug": true,
        "cache": false
      }
    }`;
    setYamlContent(template);
  };

  // 查看Secret YAML
  const handleViewYaml = async (secret: Secret) => {
    try {
      const response = await secretApi.getSecretYaml(secret.cluster_id, secret.namespace, secret.name);
      if (response.data) {
        setYamlPreview(response.data.yaml);
        setIsYamlPreviewOpen(true);
      } else {
        toast.error(`获取Secret YAML失败: ${response.error}`);
      }
    } catch {
      toast.error("获取Secret YAML失败");
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
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Lock className="w-8 h-8" />
            Secrets管理
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            管理Kubernetes集群中的机密数据（支持YAML格式编辑）
          </p>
        </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Secret列表</CardTitle>
              <CardDescription>
                {selectedNamespace ? `命名空间: ${selectedNamespace}` : "请选择命名空间"}
              </CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} disabled={!selectedNamespace}>
                  <Plus className="w-4 h-4 mr-2" />
                  创建Secret
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>创建Secret</DialogTitle>
                  <DialogDescription>使用YAML格式创建新的机密数据</DialogDescription>
                </DialogHeader>
                <YamlEditor
                  value={yamlContent}
                  onChange={handleYamlChange}
                  error={yamlError}
                  label="Secret YAML配置"
                  template={`apiVersion: v1
kind: Secret
metadata:
  name: my-secret
  namespace: ${selectedNamespace || "default"}
  labels:
    environment: production
    managed-by: canvas
type: Opaque
data:
  username: YWRtaW4=  # base64 encoded "admin"
  password: c2VjcmV0  # base64 encoded "secret"
stringData:
  config.json: |
    {
      "database": {
        "host": "localhost",
        "port": 5432
      }
    }`}
                  onApplyTemplate={applyYamlTemplate}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>取消</Button>
                  <Button
                    onClick={handleCreateSecret}
                    disabled={!yamlContent.trim() || !!yamlError}
                  >
                    创建Secret
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
          ) : secrets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {selectedNamespace ? "该命名空间下没有Secrets" : "请选择命名空间查看Secrets"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>数据项数量</TableHead>
                  <TableHead>年龄</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secrets.map((secret) => (
                  <TableRow key={`${secret.cluster_id}-${secret.namespace}-${secret.name}`}>
                    <TableCell className="font-medium">{secret.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{secret.type}</Badge>
                    </TableCell>
                    <TableCell>{secret.data_keys.length} 项</TableCell>
                    <TableCell>{secret.age}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewYaml(secret)}
                        >
                          <Code className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteSecret(secret)}
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

      {/* Secret YAML预览对话框 */}
      <Dialog open={isYamlPreviewOpen} onOpenChange={setIsYamlPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              {yamlPreview ? "Secret YAML配置" : "YAML配置"}
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
            <Button onClick={() => setIsYamlPreviewOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
