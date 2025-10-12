"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Eye, Loader2, Lock } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { secretApi } from "@/lib/api";
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
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
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
    } catch (error) {
      toast.error("获取Secret列表失败");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchNamespaces = async () => {
    if (!selectedClusterId) return;
    setNamespaces(["default", "kube-system", "kube-public", "kube-node-lease"]);
  };

  useEffect(() => {
    if (user && clusters.length > 0 && !selectedClusterId) {
      setSelectedClusterId(clusters[0].id);
    }
  }, [user, clusters, selectedClusterId]);

  useEffect(() => {
    if (selectedClusterId) {
      fetchNamespaces();
      if (selectedNamespace) {
        fetchSecrets();
      }
    }
  }, [selectedClusterId, selectedNamespace]);

  const handleCreateSecret = async () => {
    if (!selectedClusterId) return;

    try {
      const response = await secretApi.createSecret(selectedClusterId, secretForm);
      if (response.data) {
        toast.success("Secret创建成功");
        setIsCreateOpen(false);
        resetForm();
        fetchSecrets();
      } else {
        toast.error(`创建Secret失败: ${response.error}`);
      }
    } catch (error) {
      toast.error("创建Secret失败");
    }
  };

  const handleDeleteSecret = async (secret: Secret) => {
    try {
      const response = await secretApi.deleteSecret(secret.cluster_id, secret.namespace, secret.name);
      if (response.data) {
        toast.success("Secret删除成功");
        fetchSecrets();
      } else {
        toast.error(`删除Secret失败: ${response.error}`);
      }
    } catch (error) {
      toast.error("删除Secret失败");
    }
  };

  const resetForm = () => {
    setSecretForm({
      name: "",
      namespace: selectedNamespace,
      type: "Opaque",
      data: {},
      labels: {},
      annotations: {}
    });
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
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Lock className="w-8 h-8" />
            Secrets管理
          </h1>
          <p className="text-muted-foreground">管理Kubernetes集群中的机密数据</p>
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
              <CardTitle>Secret列表</CardTitle>
              <CardDescription>
                {selectedNamespace ? `命名空间: ${selectedNamespace}` : "请选择命名空间"}
              </CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  创建Secret
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>创建Secret</DialogTitle>
                  <DialogDescription>创建新的机密数据</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="secret-name">名称</Label>
                      <Input
                        id="secret-name"
                        value={secretForm.name}
                        onChange={(e) => setSecretForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="my-secret"
                      />
                    </div>
                    <div>
                      <Label htmlFor="secret-type">类型</Label>
                      <Select value={secretForm.type} onValueChange={(value) => setSecretForm(prev => ({ ...prev, type: value }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Opaque">Opaque</SelectItem>
                          <SelectItem value="kubernetes.io/tls">TLS</SelectItem>
                          <SelectItem value="kubernetes.io/dockerconfigjson">Docker配置</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="secret-namespace">命名空间</Label>
                    <Input
                      id="secret-namespace"
                      value={secretForm.namespace}
                      onChange={(e) => setSecretForm(prev => ({ ...prev, namespace: e.target.value }))}
                      placeholder="default"
                    />
                  </div>

                  <div>
                    <Label>数据 (JSON格式)</Label>
                    <Textarea
                      placeholder='{"username": "admin", "password": "secret"}'
                      value={JSON.stringify(secretForm.data, null, 2)}
                      onChange={(e) => {
                        try {
                          const data = JSON.parse(e.target.value);
                          setSecretForm(prev => ({ ...prev, data }));
                        } catch {
                          // 忽略JSON解析错误
                        }
                      }}
                      className="font-mono text-sm"
                      rows={6}
                    />
                  </div>

                  <div>
                    <Label>标签 (JSON格式)</Label>
                    <Textarea
                      placeholder='{"environment": "production"}'
                      value={JSON.stringify(secretForm.labels, null, 2)}
                      onChange={(e) => {
                        try {
                          const labels = JSON.parse(e.target.value);
                          setSecretForm(prev => ({ ...prev, labels }));
                        } catch {
                          // 忽略JSON解析错误
                        }
                      }}
                      className="font-mono text-sm"
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>取消</Button>
                  <Button onClick={handleCreateSecret} disabled={!secretForm.name || !secretForm.namespace}>
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
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4" />
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
    </div>
  );
}
