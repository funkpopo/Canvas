"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Loader2, RefreshCw, Search, Trash2, Globe, ExternalLink, Server, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Ingress {
  name: string;
  namespace: string;
  hosts: string[];
  addresses: string[];
  age: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

interface Namespace {
  name: string;
  status: string;
}

function IngressesContent() {
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { activeCluster } = useCluster();
  const [ingresses, setIngresses] = useState<Ingress[]>([]);
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
  const clusterId = activeCluster?.id.toString();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated && clusterId) {
      fetchNamespaces();
    }
  }, [isAuthenticated, clusterId]);

  useEffect(() => {
    if (isAuthenticated && clusterId && selectedNamespace) {
      fetchIngresses();
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
        // 自动选择第一个命名空间
        if (data.length > 0 && !selectedNamespace) {
          setSelectedNamespace(data[0].name);
        }
      }
    } catch (error) {
      console.error('获取命名空间失败:', error);
      toast.error('获取命名空间失败');
    }
  };

  const fetchIngresses = async () => {
    if (!selectedNamespace) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/ingresses/clusters/${clusterId}/namespaces/${selectedNamespace}/ingresses`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setIngresses(data);
      } else {
        toast.error('获取Ingresses失败');
      }
    } catch (error) {
      console.error('获取Ingresses失败:', error);
      toast.error('获取Ingresses失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    setIsOperationLoading(true);
    try {
      const response = await fetch(
        `http://localhost:8000/api/ingresses/clusters/${clusterId}/namespaces/${selectedNamespace}/ingresses/${name}`,
        {
          method: "DELETE",
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.ok) {
        toast.success('Ingress删除成功');
        fetchIngresses();
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

  const filteredIngresses = ingresses.filter(ing =>
    ing.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  if (!clusterId) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Server className="h-8 w-8 text-zinc-600" />
                <h1 className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">
                  Canvas
                </h1>
              </div>
              <div className="flex items-center space-x-4">
                <ClusterSelector />
                <LanguageToggle />
                <ThemeToggle />
                <Button variant="outline" onClick={logout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  退出登录
                </Button>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                请选择集群
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                请先从顶部选择一个集群来查看Ingress资源
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Main Header */}
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Server className="h-8 w-8 text-zinc-600" />
              <h1 className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">
                Canvas
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <ClusterSelector />
              <LanguageToggle />
              <ThemeToggle />
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                退出登录
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              返回
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Ingress管理</h1>
            <p className="text-muted-foreground">管理集群外部访问路由规则</p>
          </div>
        </div>
        <Button onClick={fetchIngresses} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ingress列表</CardTitle>
          <CardDescription>选择命名空间查看其中的Ingress资源</CardDescription>
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
                    placeholder="搜索Ingress名称..."
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
                      <TableHead>主机</TableHead>
                      <TableHead>地址</TableHead>
                      <TableHead>年龄</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredIngresses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          {selectedNamespace ? '该命名空间中没有Ingresses' : '请选择命名空间'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredIngresses.map((ing) => (
                        <TableRow key={ing.name}>
                          <TableCell className="font-medium">
                            <div className="flex items-center">
                              <Globe className="h-4 w-4 mr-2 text-blue-500" />
                              {ing.name}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {ing.hosts.length > 0 ? (
                                ing.hosts.map((host, idx) => (
                                  <Badge key={idx} variant="outline" className="w-fit">
                                    {host}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground text-sm">*</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {ing.addresses.length > 0 ? (
                                ing.addresses.map((addr, idx) => (
                                  <code key={idx} className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                    {addr}
                                  </code>
                                ))
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>{ing.age}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setConfirmDialog({
                                open: true,
                                title: "删除Ingress",
                                description: `确定要删除Ingress "${ing.name}" 吗？`,
                                onConfirm: () => handleDelete(ing.name),
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
      </main>
    </div>
  );
}

export default function IngressesPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <IngressesContent />
    </Suspense>
  );
}
