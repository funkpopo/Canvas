"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Eye, Loader2, Route } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { ingressApi } from "@/lib/api";
import { toast } from "sonner";

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
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [namespaces, setNamespaces] = useState<string[]>([]);

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
    } catch (error) {
      toast.error("获取Ingress列表失败");
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
        fetchIngresses();
      }
    }
  }, [selectedClusterId, selectedNamespace]);

  const handleDeleteIngress = async (ingress: Ingress) => {
    try {
      const response = await ingressApi.deleteIngress(ingress.cluster_id, ingress.namespace, ingress.name);
      if (response.data) {
        toast.success("Ingress删除成功");
        fetchIngresses();
      } else {
        toast.error(`删除Ingress失败: ${response.error}`);
      }
    } catch (error) {
      toast.error("删除Ingress失败");
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
            Ingress管理
          </h1>
          <p className="text-muted-foreground">管理Kubernetes集群中的入口控制器</p>
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
              <CardTitle>Ingress列表</CardTitle>
              <CardDescription>
                {selectedNamespace ? `命名空间: ${selectedNamespace}` : "请选择命名空间"}
              </CardDescription>
            </div>
            <Button disabled>
              <Plus className="w-4 h-4 mr-2" />
              创建Ingress (开发中)
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
                        <Button variant="outline" size="sm">
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
    </div>
  );
}
