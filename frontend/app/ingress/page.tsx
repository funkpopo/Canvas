"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Eye, Loader2, Route, Settings } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import ControllerManager from "@/components/ControllerManager";
import IngressEditor from "@/components/IngressEditor";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { ingressApi } from "@/lib/api";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Ingress {
  name: string;
  namespace: string;
  hosts: string[];
  tls_hosts: string[];
  class_name: string | null;
  labels: Record<string, any>;
  annotations: Record<string, any>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

export default function IngressManagement() {
  const [ingresses, setIngresses] = useState<Ingress[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("default");
  const [namespaces, setNamespaces] = useState<string[]>([]);

  // 预览对话框状态
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedIngress, setSelectedIngress] = useState<any | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // 创建Ingress对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // 删除确认对话框状态
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const { user } = useAuth();
  const { clusters } = useCluster();
  const router = useRouter();

  const fetchIngresses = async () => {
    if (!selectedClusterId || !selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await ingressApi.getIngresses(selectedClusterId, selectedNamespace);
      if (response.data) {
        setIngresses(response.data);
      } else if (response.error) {
        toast.error(`获取Ingress列表失败: ${response.error}`);
      }
    } catch {
      toast.error("获取Ingress列表失败");
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
      fetchIngresses();
    }
  }, [selectedClusterId, selectedNamespace]);

  const handleDeleteIngress = (ingress: Ingress) => {
    setConfirmDialog({
      open: true,
      title: "确认删除",
      description: `确定要删除Ingress "${ingress.namespace}/${ingress.name}" 吗？此操作无法撤销。`,
      onConfirm: async () => {
        try {
          const response = await ingressApi.deleteIngress(ingress.cluster_id, ingress.namespace, ingress.name);
          if (!response.error) {
            toast.success("Ingress删除成功");
            fetchIngresses();
          } else {
            toast.error(`删除Ingress失败: ${response.error}`);
          }
        } catch {
          toast.error("删除Ingress失败");
        }
      },
    });
  };

  // 查看Ingress详情
  const handleViewIngress = async (ingress: Ingress) => {
    try {
      setIsPreviewLoading(true);
      const response = await ingressApi.getIngress(ingress.cluster_id, ingress.namespace, ingress.name);
      if (response.data) {
        setSelectedIngress(response.data);
        setIsPreviewOpen(true);
      } else {
        toast.error(`获取Ingress详情失败: ${response.error}`);
      }
    } catch {
      toast.error("获取Ingress详情失败");
    } finally {
      setIsPreviewLoading(false);
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
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Route className="w-8 h-8" />
            Ingress生态系统管理
          </h1>
          <p className="text-muted-foreground">管理Kubernetes集群中的入口控制器和Ingress资源</p>
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

      <Tabs defaultValue="ingress" className="space-y-4">
        <TabsList>
          <TabsTrigger value="ingress" className="flex items-center gap-2">
            <Route className="w-4 h-4" />
            Ingress管理
          </TabsTrigger>
          <TabsTrigger value="controller" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Controller管理
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ingress" className="space-y-4">
          <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Ingress列表</CardTitle>
              <CardDescription>
                {selectedNamespace ? `命名空间: ${selectedNamespace}` : "请选择命名空间"}
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              创建Ingress
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="ml-2">加载中...</span>
            </div>
          ) : ingresses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {selectedNamespace ? "该命名空间下没有Ingress资源" : "请选择命名空间查看Ingress"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>主机</TableHead>
                  <TableHead>类名</TableHead>
                  <TableHead>TLS主机</TableHead>
                  <TableHead>年龄</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ingresses.map((ingress) => (
                  <TableRow key={`${ingress.cluster_id}-${ingress.namespace}-${ingress.name}`}>
                    <TableCell className="font-medium">{ingress.name}</TableCell>
                    <TableCell>
                      {ingress.hosts.slice(0, 2).map((host, index) => (
                        <div key={index} className="text-sm">{host}</div>
                      ))}
                      {ingress.hosts.length > 2 && (
                        <div className="text-sm text-muted-foreground">+{ingress.hosts.length - 2} 更多</div>
                      )}
                    </TableCell>
                    <TableCell>{ingress.class_name || "-"}</TableCell>
                    <TableCell>
                      {ingress.tls_hosts.length > 0 ? (
                        <Badge variant="secondary">{ingress.tls_hosts.length} 个TLS主机</Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell>{ingress.age}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewIngress(ingress)}
                          disabled={isPreviewLoading}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteIngress(ingress)}
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

      {/* Ingress详情预览对话框 */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedIngress ? `${selectedIngress.namespace}/${selectedIngress.name} - Ingress详情` : "Ingress详情"}
            </DialogTitle>
          </DialogHeader>
          {selectedIngress && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-medium">名称</Label>
                  <p className="text-sm text-muted-foreground">{selectedIngress.name}</p>
                </div>
                <div>
                  <Label className="font-medium">命名空间</Label>
                  <p className="text-sm text-muted-foreground">{selectedIngress.namespace}</p>
                </div>
                <div>
                  <Label className="font-medium">类名</Label>
                  <p className="text-sm text-muted-foreground">{selectedIngress.class_name || "默认"}</p>
                </div>
                <div>
                  <Label className="font-medium">年龄</Label>
                  <p className="text-sm text-muted-foreground">{selectedIngress.age}</p>
                </div>
              </div>

              <div>
                <Label className="font-medium">主机</Label>
                <div className="mt-1">
                  {selectedIngress.hosts && selectedIngress.hosts.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedIngress.hosts.map((host: string, index: number) => (
                        <Badge key={index} variant="secondary">{host}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无主机配置</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">TLS主机</Label>
                <div className="mt-1">
                  {selectedIngress.tls_hosts && selectedIngress.tls_hosts.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedIngress.tls_hosts.map((host: string, index: number) => (
                        <Badge key={index} variant="outline">{host}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无TLS主机配置</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">标签</Label>
                <div className="mt-1">
                  {selectedIngress.labels && Object.keys(selectedIngress.labels).length > 0 ? (
                    <div className="bg-gray-50 p-2 rounded text-sm font-mono">
                      {JSON.stringify(selectedIngress.labels, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无标签</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">注解</Label>
                <div className="mt-1">
                  {selectedIngress.annotations && Object.keys(selectedIngress.annotations).length > 0 ? (
                    <div className="bg-gray-50 p-2 rounded text-sm font-mono">
                      {JSON.stringify(selectedIngress.annotations, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无注解</p>
                  )}
                </div>
              </div>

              {selectedIngress.rules && selectedIngress.rules.length > 0 && (
                <div>
                  <Label className="font-medium">规则</Label>
                  <div className="mt-1 space-y-2">
                    {selectedIngress.rules.map((rule: any, index: number) => (
                      <div key={index} className="bg-gray-50 p-3 rounded">
                        <p className="text-sm font-medium">{rule.host || "默认主机"}</p>
                        {rule.http && rule.http.paths && rule.http.paths.map((path: any, pathIndex: number) => (
                          <div key={pathIndex} className="text-xs text-muted-foreground mt-1">
                            {path.path} → {path.backend.service?.name}:{path.backend.service?.port?.number || path.backend.service?.port?.name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setIsPreviewOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        </TabsContent>

        <TabsContent value="controller" className="space-y-4">
          <ControllerManager clusterId={selectedClusterId} />
        </TabsContent>
      </Tabs>

      {/* 创建Ingress对话框 */}
      <IngressEditor
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        namespace={selectedNamespace}
        clusterId={selectedClusterId}
        onSuccess={fetchIngresses}
        mode="create"
      />

      {/* 删除确认对话框 */}
      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
        confirmText="删除"
        variant="destructive"
      />
    </div>
  );
}
