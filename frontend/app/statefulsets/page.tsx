"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, RefreshCw, Search, Trash2, Settings, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useCluster } from "@/lib/cluster-context";

interface StatefulSet {
  name: string;
  namespace: string;
  replicas: number;
  ready_replicas: number;
  current_replicas: number;
  updated_replicas: number;
  age: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

interface Namespace {
  name: string;
  status: string;
}

function StatefulSetsContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [statefulsets, setStatefulSets] = useState<StatefulSet[]>([]);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isScaleDialogOpen, setIsScaleDialogOpen] = useState(false);
  const [scaleTarget, setScaleTarget] = useState<{ name: string; replicas: number } | null>(null);
  const [newReplicas, setNewReplicas] = useState(0);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedCluster, clusters } = useCluster();
  const clusterIdFromUrl = searchParams.get('cluster_id');
  const clusterId = clusterIdFromUrl || (selectedCluster ? String(selectedCluster) : null);

  // 获取集群信息
  const currentCluster = clusters.find(c => c.id === parseInt(clusterId || '0'));

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/login");
      return;
    }
    setIsAuthenticated(true);
  }, [router]);

  useEffect(() => {
    if (isAuthenticated && clusterId) {
      fetchNamespaces();
    }
  }, [isAuthenticated, clusterId]);

  useEffect(() => {
    if (isAuthenticated && clusterId && selectedNamespace) {
      fetchStatefulSets();
    }
  }, [isAuthenticated, clusterId, selectedNamespace]);

  const fetchNamespaces = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/namespaces?cluster_id=${clusterId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setNamespaces(data);
        if (data.length > 0 && !selectedNamespace) {
          setSelectedNamespace(data[0].name);
        }
      }
    } catch (error) {
      console.error('获取命名空间失败:', error);
      toast.error('获取命名空间失败');
    }
  };

  const fetchStatefulSets = async () => {
    if (!selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/statefulsets/clusters/${clusterId}/namespaces/${selectedNamespace}/statefulsets`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setStatefulSets(data);
      } else {
        toast.error('获取StatefulSets失败');
      }
    } catch (error) {
      console.error('获取StatefulSets失败:', error);
      toast.error('获取StatefulSets失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleScale = async () => {
    if (!scaleTarget) return;

    setIsOperationLoading(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/statefulsets/clusters/${clusterId}/namespaces/${selectedNamespace}/statefulsets/${scaleTarget.name}/scale`,
        {
          method: "POST",
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ replicas: newReplicas }),
        }
      );

      if (response.ok) {
        toast.success('扩缩容成功');
        setIsScaleDialogOpen(false);
        setScaleTarget(null);
        fetchStatefulSets();
      } else {
        toast.error('扩缩容失败');
      }
    } catch (error) {
      console.error('扩缩容失败:', error);
      toast.error('扩缩容失败');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    setIsOperationLoading(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/statefulsets/clusters/${clusterId}/namespaces/${selectedNamespace}/statefulsets/${name}`,
        {
          method: "DELETE",
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.ok) {
        toast.success('StatefulSet删除成功');
        fetchStatefulSets();
      } else {
        toast.error('删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败');
    } finally {
      setIsOperationLoading(false);
    }
  };

  const openScaleDialog = (sts: StatefulSet) => {
    setScaleTarget({ name: sts.name, replicas: sts.replicas });
    setNewReplicas(sts.replicas);
    setIsScaleDialogOpen(true);
  };

  const filteredStatefulSets = statefulsets.filter(sts =>
    sts.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAuthenticated) {
    return <div>验证中...</div>;
  }

  if (!clusterId) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center text-yellow-600">
              <AlertCircle className="h-5 w-5 mr-2" />
              未选择集群
            </CardTitle>
            <CardDescription>
              请先从首页选择一个集群，或者确保 URL 中包含 cluster_id 参数
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                返回首页选择集群
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">StatefulSets管理</h1>
            <p className="text-muted-foreground">
              管理有状态应用工作负载
              {currentCluster && (
                <span className="ml-2">
                  • 集群: <span className="font-semibold text-foreground">{currentCluster.name}</span>
                </span>
              )}
            </p>
          </div>
        </div>
        <Button onClick={fetchStatefulSets} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>StatefulSet列表</CardTitle>
          <CardDescription>选择命名空间查看其中的StatefulSets</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择命名空间" />
                  </SelectTrigger>
                  <SelectContent>
                    {namespaces.map((ns) => (
                      <SelectItem key={ns.name} value={ns.name}>
                        {ns.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="搜索StatefulSet名称..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="ml-2">加载中...</span>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>副本数</TableHead>
                      <TableHead>就绪/当前/更新</TableHead>
                      <TableHead>年龄</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStatefulSets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          {selectedNamespace ? '该命名空间中没有StatefulSets' : '请选择命名空间'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredStatefulSets.map((sts) => (
                        <TableRow key={sts.name}>
                          <TableCell className="font-medium">{sts.name}</TableCell>
                          <TableCell>
                            <Badge variant={sts.ready_replicas === sts.replicas ? "default" : "secondary"}>
                              {sts.ready_replicas}/{sts.replicas}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {sts.ready_replicas}/{sts.current_replicas}/{sts.updated_replicas}
                          </TableCell>
                          <TableCell>{sts.age}</TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openScaleDialog(sts)}
                                disabled={isOperationLoading}
                              >
                                <Settings className="h-3 w-3 mr-1" />
                                扩容
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmDialog({
                                  open: true,
                                  title: "删除StatefulSet",
                                  description: `确定要删除StatefulSet "${sts.name}" 吗？`,
                                  onConfirm: () => handleDelete(sts.name),
                                })}
                                disabled={isOperationLoading}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={isScaleDialogOpen} onOpenChange={setIsScaleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>调整副本数</DialogTitle>
            <DialogDescription>
              修改StatefulSet {scaleTarget?.name} 的副本数量
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="replicas" className="text-right">
                副本数
              </Label>
              <Input
                id="replicas"
                type="number"
                value={newReplicas}
                onChange={(e) => setNewReplicas(parseInt(e.target.value) || 0)}
                className="col-span-3"
                min="0"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleScale} disabled={isOperationLoading || newReplicas < 0}>
              {isOperationLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认调整
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        title={confirmDialog.title}
        description={confirmDialog.description}
        onConfirm={confirmDialog.onConfirm}
      />
    </div>
  );
}

export default function StatefulSetsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <StatefulSetsContent />
    </Suspense>
  );
}
