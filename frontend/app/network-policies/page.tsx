"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Eye, Edit, Loader2, Shield, ArrowLeft } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import NetworkPolicyForm from "@/components/NetworkPolicyForm";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { networkPolicyApi, namespaceApi } from "@/lib/api";
import { toast } from "sonner";

interface NetworkPolicy {
  name: string;
  namespace: string;
  pod_selector: Record<string, any>;
  policy_types: string[];
  labels: Record<string, any>;
  annotations: Record<string, any>;
  age: string;
  cluster_name: string;
  cluster_id: number;
}

export default function NetworkPoliciesManagement() {
  const [policies, setPolicies] = useState<NetworkPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("default");
  const [namespaces, setNamespaces] = useState<string[]>([]);

  // 预览对话框状态
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<any | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // 创建/编辑对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<any | null>(null);

  const { user } = useAuth();
  const { clusters } = useCluster();
  const router = useRouter();

  const fetchNetworkPolicies = async () => {
    if (!selectedClusterId || !selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await networkPolicyApi.getNetworkPolicies(selectedClusterId, selectedNamespace);
      if (response.data) {
        setPolicies(response.data);
      } else if (response.error) {
        toast.error(`获取Network Policy列表失败: ${response.error}`);
      }
    } catch {
      toast.error("获取Network Policy列表失败");
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
      fetchNetworkPolicies();
    }
  }, [selectedClusterId, selectedNamespace]);

  const handleDeleteNetworkPolicy = async (policy: NetworkPolicy) => {
    try {
      const response = await networkPolicyApi.deleteNetworkPolicy(policy.cluster_id, policy.namespace, policy.name);
      if (!response.error) {
        toast.success("Network Policy删除成功");
        fetchNetworkPolicies();
      } else {
        toast.error(`删除Network Policy失败: ${response.error}`);
      }
    } catch {
      toast.error("删除Network Policy失败");
    }
  };

  // 查看Network Policy详情
  const handleViewNetworkPolicy = async (policy: NetworkPolicy) => {
    try {
      setIsPreviewLoading(true);
      const response = await networkPolicyApi.getNetworkPolicy(policy.cluster_id, policy.namespace, policy.name);
      if (response.data) {
        setSelectedPolicy(response.data);
        setIsPreviewOpen(true);
      } else {
        toast.error(`获取Network Policy详情失败: ${response.error}`);
      }
    } catch {
      toast.error("获取Network Policy详情失败");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // 创建Network Policy
  const handleCreateNetworkPolicy = async (policyData: any) => {
    if (!selectedClusterId) return;

    const response = await networkPolicyApi.createNetworkPolicy(selectedClusterId, policyData);
    if (!response.error) {
      toast.success("Network Policy创建成功");
      setIsCreateOpen(false);
      fetchNetworkPolicies();
    } else {
      toast.error(`创建Network Policy失败: ${response.error}`);
    }
  };

  // 编辑Network Policy
  const handleEditNetworkPolicy = async (policy: NetworkPolicy) => {
    try {
      setIsPreviewLoading(true);
      const response = await networkPolicyApi.getNetworkPolicy(policy.cluster_id, policy.namespace, policy.name);
      if (response.data) {
        setEditingPolicy(response.data);
        setIsEditOpen(true);
      } else {
        toast.error(`获取Network Policy详情失败: ${response.error}`);
      }
    } catch {
      toast.error("获取Network Policy详情失败");
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // 更新Network Policy
  const handleUpdateNetworkPolicy = async (policyData: any) => {
    if (!selectedClusterId || !editingPolicy) return;

    const response = await networkPolicyApi.updateNetworkPolicy(
      selectedClusterId,
      editingPolicy.namespace,
      editingPolicy.name,
      policyData
    );
    if (!response.error) {
      toast.success("Network Policy更新成功");
      setIsEditOpen(false);
      setEditingPolicy(null);
      fetchNetworkPolicies();
    } else {
      toast.error(`更新Network Policy失败: ${response.error}`);
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
            <Shield className="w-8 h-8" />
            Network Policies管理
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            管理Kubernetes集群中的网络策略
          </p>
        </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Network Policy列表</CardTitle>
              <CardDescription>
                {selectedNamespace ? `命名空间: ${selectedNamespace}` : "请选择命名空间"}
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              创建Network Policy
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="ml-2">加载中...</span>
            </div>
          ) : policies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {selectedNamespace ? "该命名空间下没有Network Policies" : "请选择命名空间查看Network Policies"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>Pod选择器</TableHead>
                  <TableHead>策略类型</TableHead>
                  <TableHead>年龄</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {policies.map((policy) => (
                  <TableRow key={`${policy.cluster_id}-${policy.namespace}-${policy.name}`}>
                    <TableCell className="font-medium">{policy.name}</TableCell>
                    <TableCell>
                      {Object.keys(policy.pod_selector).length > 0 ? (
                        <div className="text-sm">
                          {Object.entries(policy.pod_selector).map(([key, value]) => (
                            <div key={key}>{key}: {String(value)}</div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">无选择器</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {policy.policy_types.map((type, index) => (
                          <Badge key={index} variant="outline">{type}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{policy.age}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewNetworkPolicy(policy)}
                          disabled={isPreviewLoading}
                          title="查看详情"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEditNetworkPolicy(policy)}
                          disabled={isPreviewLoading}
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteNetworkPolicy(policy)}
                          className="text-red-600 hover:text-red-700"
                          title="删除"
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

      {/* Network Policy详情预览对话框 */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedPolicy ? `${selectedPolicy.namespace}/${selectedPolicy.name} - Network Policy详情` : "Network Policy详情"}
            </DialogTitle>
          </DialogHeader>
          {selectedPolicy && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-medium">名称</Label>
                  <p className="text-sm text-muted-foreground">{selectedPolicy.name}</p>
                </div>
                <div>
                  <Label className="font-medium">命名空间</Label>
                  <p className="text-sm text-muted-foreground">{selectedPolicy.namespace}</p>
                </div>
                <div>
                  <Label className="font-medium">年龄</Label>
                  <p className="text-sm text-muted-foreground">{selectedPolicy.age}</p>
                </div>
              </div>

              <div>
                <Label className="font-medium">Pod选择器</Label>
                <div className="mt-1">
                  {selectedPolicy.pod_selector && Object.keys(selectedPolicy.pod_selector).length > 0 ? (
                    <div className="bg-muted p-2 rounded text-sm font-mono">
                      {JSON.stringify(selectedPolicy.pod_selector, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无Pod选择器（适用于所有Pod）</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">策略类型</Label>
                <div className="mt-1">
                  {selectedPolicy.policy_types && selectedPolicy.policy_types.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedPolicy.policy_types.map((type: string, index: number) => (
                        <Badge key={index} variant="secondary">{type}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无策略类型</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">标签</Label>
                <div className="mt-1">
                  {selectedPolicy.labels && Object.keys(selectedPolicy.labels).length > 0 ? (
                    <div className="bg-muted p-2 rounded text-sm font-mono">
                      {JSON.stringify(selectedPolicy.labels, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无标签</p>
                  )}
                </div>
              </div>

              <div>
                <Label className="font-medium">注解</Label>
                <div className="mt-1">
                  {selectedPolicy.annotations && Object.keys(selectedPolicy.annotations).length > 0 ? (
                    <div className="bg-muted p-2 rounded text-sm font-mono">
                      {JSON.stringify(selectedPolicy.annotations, null, 2)}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">无注解</p>
                  )}
                </div>
              </div>

              {selectedPolicy.ingress && selectedPolicy.ingress.length > 0 && (
                <div>
                  <Label className="font-medium">入站规则</Label>
                  <div className="mt-1 space-y-2">
                    {selectedPolicy.ingress.map((rule: any, index: number) => (
                      <div key={index} className="bg-muted p-3 rounded">
                        <p className="text-sm font-medium">规则 {index + 1}</p>
                        {rule.from && rule.from.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-muted-foreground">来源:</p>
                            {rule.from.map((from: any, fromIndex: number) => (
                              <div key={fromIndex} className="text-xs text-muted-foreground mt-1">
                                {from.podSelector && `Pod选择器: ${JSON.stringify(from.podSelector)}`}
                                {from.namespaceSelector && `命名空间选择器: ${JSON.stringify(from.namespaceSelector)}`}
                                {from.ipBlock && `IP块: ${from.ipBlock.cidr}`}
                              </div>
                            ))}
                          </div>
                        )}
                        {rule.ports && rule.ports.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-muted-foreground">端口:</p>
                            {rule.ports.map((port: any, portIndex: number) => (
                              <div key={portIndex} className="text-xs text-muted-foreground mt-1">
                                {port.port} ({port.protocol})
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPolicy.egress && selectedPolicy.egress.length > 0 && (
                <div>
                  <Label className="font-medium">出站规则</Label>
                  <div className="mt-1 space-y-2">
                    {selectedPolicy.egress.map((rule: any, index: number) => (
                      <div key={index} className="bg-muted p-3 rounded">
                        <p className="text-sm font-medium">规则 {index + 1}</p>
                        {rule.to && rule.to.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-muted-foreground">目标:</p>
                            {rule.to.map((to: any, toIndex: number) => (
                              <div key={toIndex} className="text-xs text-muted-foreground mt-1">
                                {to.podSelector && `Pod选择器: ${JSON.stringify(to.podSelector)}`}
                                {to.namespaceSelector && `命名空间选择器: ${JSON.stringify(to.namespaceSelector)}`}
                                {to.ipBlock && `IP块: ${to.ipBlock.cidr}`}
                              </div>
                            ))}
                          </div>
                        )}
                        {rule.ports && rule.ports.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-medium text-muted-foreground">端口:</p>
                            {rule.ports.map((port: any, portIndex: number) => (
                              <div key={portIndex} className="text-xs text-muted-foreground mt-1">
                                {port.port} ({port.protocol})
                              </div>
                            ))}
                          </div>
                        )}
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

      {/* 创建Network Policy对话框 */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">创建Network Policy</DialogTitle>
          <NetworkPolicyForm
            onSubmit={handleCreateNetworkPolicy}
            onCancel={() => setIsCreateOpen(false)}
            namespaces={namespaces}
          />
        </DialogContent>
      </Dialog>

      {/* 编辑Network Policy对话框 */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">编辑Network Policy</DialogTitle>
          <NetworkPolicyForm
            onSubmit={handleUpdateNetworkPolicy}
            onCancel={() => setIsEditOpen(false)}
            initialData={editingPolicy}
            isEditing={true}
            namespaces={namespaces}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
