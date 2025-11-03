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
import { ArrowLeft, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface DaemonSet {
  name: string;
  namespace: string;
  desired: number;
  current: number;
  ready: number;
  updated: number;
  available: number;
  age: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

interface Namespace {
  name: string;
  status: string;
}

function DaemonSetsContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [daemonsets, setDaemonSets] = useState<DaemonSet[]>([]);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedNamespace, setSelectedNamespace] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: "",
    description: "",
    onConfirm: () => {},
  });

  const router = useRouter();
  const searchParams = useSearchParams();
  const clusterId = searchParams.get('cluster_id');

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
      fetchDaemonSets();
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

  const fetchDaemonSets = async () => {
    if (!selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/daemonsets/clusters/${clusterId}/namespaces/${selectedNamespace}/daemonsets`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDaemonSets(data);
      } else {
        toast.error('获取DaemonSets失败');
      }
    } catch (error) {
      console.error('获取DaemonSets失败:', error);
      toast.error('获取DaemonSets失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    setIsOperationLoading(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/daemonsets/clusters/${clusterId}/namespaces/${selectedNamespace}/daemonsets/${name}`,
        {
          method: "DELETE",
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.ok) {
        toast.success('DaemonSet删除成功');
        fetchDaemonSets();
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

  const filteredDaemonSets = daemonsets.filter(ds =>
    ds.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isAuthenticated) {
    return <div>验证中...</div>;
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
            <h1 className="text-3xl font-bold">DaemonSets管理</h1>
            <p className="text-muted-foreground">管理守护进程工作负载</p>
          </div>
        </div>
        <Button onClick={fetchDaemonSets} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>DaemonSet列表</CardTitle>
          <CardDescription>选择命名空间查看其中的DaemonSets</CardDescription>
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
                    placeholder="搜索DaemonSet名称..."
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
                      <TableHead>期望/当前</TableHead>
                      <TableHead>就绪</TableHead>
                      <TableHead>更新</TableHead>
                      <TableHead>可用</TableHead>
                      <TableHead>年龄</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDaemonSets.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {selectedNamespace ? '该命名空间中没有DaemonSets' : '请选择命名空间'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDaemonSets.map((ds) => (
                        <TableRow key={ds.name}>
                          <TableCell className="font-medium">{ds.name}</TableCell>
                          <TableCell>
                            <Badge variant={ds.current === ds.desired ? "default" : "secondary"}>
                              {ds.desired}/{ds.current}
                            </Badge>
                          </TableCell>
                          <TableCell>{ds.ready}</TableCell>
                          <TableCell>{ds.updated}</TableCell>
                          <TableCell>{ds.available}</TableCell>
                          <TableCell>{ds.age}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmDialog({
                                open: true,
                                title: "删除DaemonSet",
                                description: `确定要删除DaemonSet "${ds.name}" 吗？`,
                                onConfirm: () => handleDelete(ds.name),
                              })}
                              disabled={isOperationLoading}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
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

export default function DaemonSetsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <DaemonSetsContent />
    </Suspense>
  );
}
