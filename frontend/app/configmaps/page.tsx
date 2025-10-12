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
import { Plus, Trash2, Eye, Loader2, Code } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
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
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [namespaces, setNamespaces] = useState<string[]>([]);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [cmForm, setCmForm] = useState({
    name: "",
    namespace: "",
    data: {} as Record<string, any>,
    labels: {} as Record<string, any>,
    annotations: {} as Record<string, any>
  });

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
    } catch (error) {
      toast.error("获取ConfigMap列表失败");
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
        fetchConfigMaps();
      }
    }
  }, [selectedClusterId, selectedNamespace]);

  const handleCreateConfigMap = async () => {
    if (!selectedClusterId) return;

    try {
      const response = await configmapApi.createConfigMap(selectedClusterId, cmForm);
      if (response.data) {
        toast.success("ConfigMap创建成功");
        setIsCreateOpen(false);
        resetForm();
        fetchConfigMaps();
      } else {
        toast.error(`创建ConfigMap失败: ${response.error}`);
      }
    } catch (error) {
      toast.error("创建ConfigMap失败");
    }
  };

  const handleDeleteConfigMap = async (cm: ConfigMap) => {
    try {
      const response = await configmapApi.deleteConfigMap(cm.cluster_id, cm.namespace, cm.name);
      if (response.data) {
        toast.success("ConfigMap删除成功");
        fetchConfigMaps();
      } else {
        toast.error(`删除ConfigMap失败: ${response.error}`);
      }
    } catch (error) {
      toast.error("删除ConfigMap失败");
    }
  };

  const resetForm = () => {
    setCmForm({
      name: "",
      namespace: selectedNamespace,
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
          <h1 className="text-3xl font-bold">ConfigMaps管理</h1>
          <p className="text-muted-foreground">管理Kubernetes集群中的配置映射</p>
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
              <CardTitle>ConfigMap列表</CardTitle>
              <CardDescription>
                {selectedNamespace ? `命名空间: ${selectedNamespace}` : "请选择命名空间"}
              </CardDescription>
            </div>
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { resetForm(); setIsCreateOpen(true); }}>
                  <Plus className="w-4 h-4 mr-2" />
                  创建ConfigMap
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>创建ConfigMap</DialogTitle>
                  <DialogDescription>创建新的配置映射</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cm-name">名称</Label>
                      <Input
                        id="cm-name"
                        value={cmForm.name}
                        onChange={(e) => setCmForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="my-config"
                      />
                    </div>
                    <div>
                      <Label htmlFor="cm-namespace">命名空间</Label>
                      <Input
                        id="cm-namespace"
                        value={cmForm.namespace}
                        onChange={(e) => setCmForm(prev => ({ ...prev, namespace: e.target.value }))}
                        placeholder="default"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>数据 (JSON格式)</Label>
                    <Textarea
                      placeholder='{"config.yaml": "key: value"}'
                      value={JSON.stringify(cmForm.data, null, 2)}
                      onChange={(e) => {
                        try {
                          const data = JSON.parse(e.target.value);
                          setCmForm(prev => ({ ...prev, data }));
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
                      value={JSON.stringify(cmForm.labels, null, 2)}
                      onChange={(e) => {
                        try {
                          const labels = JSON.parse(e.target.value);
                          setCmForm(prev => ({ ...prev, labels }));
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
                  <Button onClick={handleCreateConfigMap} disabled={!cmForm.name || !cmForm.namespace}>
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
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4" />
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
    </div>
  );
}
