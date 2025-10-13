"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Eye, Loader2, Shield } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { networkPolicyApi } from "@/lib/api";
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
      fetchNetworkPolicies();
    }
  }, [selectedClusterId, selectedNamespace]);

  const handleDeleteNetworkPolicy = async (policy: NetworkPolicy) => {
    try {
      const response = await networkPolicyApi.deleteNetworkPolicy(policy.cluster_id, policy.namespace, policy.name);
      if (response.data) {
        toast.success("Network Policy删除成功");
        fetchNetworkPolicies();
      } else {
        toast.error(`删除Network Policy失败: ${response.error}`);
      }
    } catch {
      toast.error("删除Network Policy失败");
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
            <Shield className="w-8 h-8" />
            Network Policies管理
          </h1>
          <p className="text-muted-foreground">管理Kubernetes集群中的网络策略</p>
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
              <CardTitle>Network Policy列表</CardTitle>
              <CardDescription>
                {selectedNamespace ? `命名空间: ${selectedNamespace}` : "请选择命名空间"}
              </CardDescription>
            </div>
            <Button disabled>
              <Plus className="w-4 h-4 mr-2" />
              创建Network Policy (开发中)
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
                        <Button variant="outline" size="sm">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteNetworkPolicy(policy)}
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
