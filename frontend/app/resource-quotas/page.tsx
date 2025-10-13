"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Eye, Loader2, Cpu } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { resourceQuotaApi } from "@/lib/api";
import { toast } from "sonner";

interface ResourceQuota {
  name: string;
  namespace: string;
  hard: Record<string, any>;
  used: Record<string, any>;
  labels: Record<string, any>;
  annotations: Record<string, any>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

export default function ResourceQuotasManagement() {
  const [quotas, setQuotas] = useState<ResourceQuota[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("default");
  const [namespaces, setNamespaces] = useState<string[]>([]);

  // 预览对话框状态
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedQuota, setSelectedQuota] = useState<any | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const { user } = useAuth();
  const { clusters } = useCluster();
  const router = useRouter();

  const fetchResourceQuotas = async () => {
    if (!selectedClusterId || !selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await resourceQuotaApi.getResourceQuotas(selectedClusterId, selectedNamespace);
      if (response.data) {
        setQuotas(response.data);
      } else if (response.error) {
        toast.error(`获取Resource Quota列表失败: ${response.error}`);
      }
    } catch {
      toast.error("获取Resource Quota列表失败");
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
      fetchResourceQuotas();
    }
  }, [selectedClusterId, selectedNamespace]);

  const handleDeleteResourceQuota = async (quota: ResourceQuota) => {
    try {
      const response = await resourceQuotaApi.deleteResourceQuota(quota.cluster_id, quota.namespace, quota.name);
      if (response.data) {
        toast.success("Resource Quota删除成功");
        fetchResourceQuotas();
      } else {
        toast.error(`删除Resource Quota失败: ${response.error}`);
      }
    } catch {
      toast.error("删除Resource Quota失败");
    }
  };

  // 查看Resource Quota详情
  const handleViewResourceQuota = async (quota: ResourceQuota) => {
    try {
      setIsPreviewLoading(true);
      const response = await resourceQuotaApi.getResourceQuota(quota.cluster_id, quota.namespace, quota.name);
      if (response.data) {
        setSelectedQuota(response.data);
        setIsPreviewOpen(true);
      } else {
        toast.error(`获取Resource Quota详情失败: ${response.error}`);
      }
    } catch {
      toast.error("获取Resource Quota详情失败");
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
            <Cpu className="w-8 h-8" />
            Resource Quotas管理
          </h1>
          <p className="text-muted-foreground">管理Kubernetes集群中的资源配额</p>
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
              <CardTitle>Resource Quota列表</CardTitle>
              <CardDescription>
                {selectedNamespace ? `命名空间: ${selectedNamespace}` : "请选择命名空间"}
              </CardDescription>
            </div>
            <Button disabled>
              <Plus className="w-4 h-4 mr-2" />
              创建Resource Quota (开发中)
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="ml-2">加载中...</span>
            </div>
          ) : quotas.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {selectedNamespace ? "该命名空间下没有Resource Quotas" : "请选择命名空间查看Resource Quotas"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>硬限制</TableHead>
                  <TableHead>已使用</TableHead>
                  <TableHead>年龄</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotas.map((quota) => (
                  <TableRow key={`${quota.cluster_id}-${quota.namespace}-${quota.name}`}>
                    <TableCell className="font-medium">{quota.name}</TableCell>
                    <TableCell>
                      <div className="text-sm max-w-xs">
                        {Object.entries(quota.hard).slice(0, 3).map(([key, value]) => (
                          <div key={key} className="truncate">{key}: {String(value)}</div>
                        ))}
                        {Object.keys(quota.hard).length > 3 && (
                          <div className="text-muted-foreground">+{Object.keys(quota.hard).length - 3} 更多</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm max-w-xs">
                        {Object.entries(quota.used).slice(0, 3).map(([key, value]) => (
                          <div key={key} className="truncate">{key}: {String(value)}</div>
                        ))}
                        {Object.keys(quota.used).length > 3 && (
                          <div className="text-muted-foreground">+{Object.keys(quota.used).length - 3} 更多</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{quota.age}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewResourceQuota(quota)}
                          disabled={isPreviewLoading}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteResourceQuota(quota)}
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

      {/* Resource Quota详情预览对话框 */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedQuota ? `${selectedQuota.namespace}/${selectedQuota.name} - Resource Quota详情` : "Resource Quota详情"}
            </DialogTitle>
          </DialogHeader>
          {selectedQuota && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-medium">名称</Label>
                  <p className="text-sm text-muted-foreground">{selectedQuota.name}</p>
                </div>
                <div>
                  <Label className="font-medium">命名空间</Label>
                  <p className="text-sm text-muted-foreground">{selectedQuota.namespace}</p>
                </div>
                <div>
                  <Label className="font-medium">年龄</Label>
                  <p className="text-sm text-muted-foreground">{selectedQuota.age}</p>
                </div>
              </div>

              <div>
                <Label className="font-medium">硬限制</Label>
                <div className="mt-1">
                  {selectedQuota.hard && Object.keys(selectedQuota.hard).length > 0 ? (
                    <div className="bg-gray-50 p-3 rounded">
                      <div className="grid grid-cols-2 gap-4">
                        {Object.entries(selectedQuota.hard).map(([key, value]) => (
                          <div key={key} className="flex justify-between items-center">
                            <span className="text-sm font-medium">{key}:</span>
                            <span className="text-sm text-muted-foreground">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无硬限制</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">已使用</Label>
                <div className="mt-1">
                  {selectedQuota.used && Object.keys(selectedQuota.used).length > 0 ? (
                    <div className="bg-gray-50 p-3 rounded">
                      <div className="grid grid-cols-2 gap-4">
                        {Object.entries(selectedQuota.used).map(([key, value]) => (
                          <div key={key} className="flex justify-between items-center">
                            <span className="text-sm font-medium">{key}:</span>
                            <span className="text-sm text-muted-foreground">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无使用记录</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">标签</Label>
                <div className="mt-1">
                  {selectedQuota.labels && Object.keys(selectedQuota.labels).length > 0 ? (
                    <div className="bg-gray-50 p-2 rounded text-sm font-mono">
                      {JSON.stringify(selectedQuota.labels, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无标签</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">注解</Label>
                <div className="mt-1">
                  {selectedQuota.annotations && Object.keys(selectedQuota.annotations).length > 0 ? (
                    <div className="bg-gray-50 p-2 rounded text-sm font-mono">
                      {JSON.stringify(selectedQuota.annotations, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无注解</p>
                  )}
                </div>
              </div>

              {selectedQuota.scopes && selectedQuota.scopes.length > 0 && (
                <div>
                  <Label className="font-medium">作用域</Label>
                  <div className="mt-1">
                    <div className="flex flex-wrap gap-2">
                      {selectedQuota.scopes.map((scope: string, index: number) => (
                        <Badge key={index} variant="outline">{scope}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {selectedQuota.scope_selector && selectedQuota.scope_selector.length > 0 && (
                <div>
                  <Label className="font-medium">作用域选择器</Label>
                  <div className="mt-1">
                    <div className="bg-gray-50 p-2 rounded text-sm font-mono">
                      {JSON.stringify(selectedQuota.scope_selector, null, 2)}
                    </div>
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
    </div>
  );
}
