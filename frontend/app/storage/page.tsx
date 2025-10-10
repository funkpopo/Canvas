"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogOut, Database, Plus, Trash2, Eye, Loader2 } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { storageApi } from "@/lib/api";

interface StorageClass {
  name: string;
  provisioner: string;
  reclaim_policy: string;
  volume_binding_mode: string;
  allow_volume_expansion: boolean;
  cluster_name: string;
  cluster_id: number;
}

interface PersistentVolume {
  name: string;
  capacity: string;
  access_modes: string[];
  status: string;
  claim: string | null;
  storage_class: string | null;
  volume_mode: string;
  cluster_name: string;
  cluster_id: number;
}

interface PersistentVolumeClaim {
  name: string;
  namespace: string;
  status: string;
  volume: string | null;
  capacity: string;
  access_modes: string[];
  storage_class: string | null;
  volume_mode: string;
  cluster_name: string;
  cluster_id: number;
}

export default function StorageManagement() {
  const [activeTab, setActiveTab] = useState("classes");
  const [storageClasses, setStorageClasses] = useState<StorageClass[]>([]);
  const [persistentVolumes, setPersistentVolumes] = useState<PersistentVolume[]>([]);
  const [persistentVolumeClaims, setPersistentVolumeClaims] = useState<PersistentVolumeClaim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedClusterId, setSelectedClusterId] = useState<number | null>(null);

  // 创建对话框状态
  const [isCreateSCOpen, setIsCreateSCOpen] = useState(false);
  const [isCreatePVOpen, setIsCreatePVOpen] = useState(false);
  const [isCreatePVCOpen, setIsCreatePVCOpen] = useState(false);

  // 表单数据
  const [scForm, setScForm] = useState({
    name: "",
    provisioner: "",
    reclaim_policy: "Delete",
    volume_binding_mode: "Immediate",
    allow_volume_expansion: false,
    // NFS specific fields
    nfs_server: "",
    nfs_path: ""
  });

  const [pvForm, setPvForm] = useState({
    name: "",
    capacity: "",
    access_modes: ["ReadWriteOnce"],
    storage_class_name: "",
    volume_mode: "Filesystem",
    host_path: ""
  });

  const [pvcForm, setPvcForm] = useState({
    name: "",
    namespace: "",
    access_modes: ["ReadWriteOnce"],
    storage_class_name: "",
    volume_mode: "Filesystem",
    storage: "1Gi"
  });

  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { activeCluster } = useCluster();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }

    if (activeCluster) {
      setSelectedClusterId(activeCluster.id);
      loadData();
    }
  }, [isAuthenticated, authLoading, router, activeCluster]);

  const loadData = async () => {
    if (!selectedClusterId) return;

    setIsLoading(true);
    try {
      // 加载存储类
      const scResponse = await storageApi.getStorageClasses(selectedClusterId);
      if (scResponse.data) {
        setStorageClasses(scResponse.data);
      }

      // 加载持久卷
      const pvResponse = await storageApi.getPersistentVolumes(selectedClusterId);
      if (pvResponse.data) {
        setPersistentVolumes(pvResponse.data);
      }

      // 加载PVC
      const pvcResponse = await storageApi.getPersistentVolumeClaims(selectedClusterId);
      if (pvcResponse.data) {
        setPersistentVolumeClaims(pvcResponse.data);
      }
    } catch (error) {
      console.error("加载存储数据失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateStorageClass = async () => {
    if (!selectedClusterId) return;

    try {
      const response = await storageApi.createStorageClass(selectedClusterId, scForm);
      if (response.data) {
        setStorageClasses([...storageClasses, response.data]);
        setIsCreateSCOpen(false);
        setScForm({
          name: "",
          provisioner: "",
          reclaim_policy: "Delete",
          volume_binding_mode: "Immediate",
          allow_volume_expansion: false,
          nfs_server: "",
          nfs_path: ""
        });
      }
    } catch (error) {
      console.error("创建存储类失败:", error);
    }
  };

  const handleDeleteStorageClass = async (scName: string) => {
    if (!selectedClusterId) return;

    try {
      await storageApi.deleteStorageClass(selectedClusterId, scName);
      setStorageClasses(storageClasses.filter(sc => sc.name !== scName));
    } catch (error) {
      console.error("删除存储类失败:", error);
    }
  };

  const handleCreatePV = async () => {
    if (!selectedClusterId) return;

    try {
      const response = await storageApi.createPersistentVolume(selectedClusterId, pvForm);
      if (response.data) {
        setPersistentVolumes([...persistentVolumes, response.data]);
        setIsCreatePVOpen(false);
        setPvForm({
          name: "",
          capacity: "",
          access_modes: ["ReadWriteOnce"],
          storage_class_name: "",
          volume_mode: "Filesystem",
          host_path: ""
        });
      }
    } catch (error) {
      console.error("创建持久卷失败:", error);
    }
  };

  const handleDeletePV = async (pvName: string) => {
    if (!selectedClusterId) return;

    try {
      await storageApi.deletePersistentVolume(selectedClusterId, pvName);
      setPersistentVolumes(persistentVolumes.filter(pv => pv.name !== pvName));
    } catch (error) {
      console.error("删除持久卷失败:", error);
    }
  };

  const handleCreatePVC = async () => {
    if (!selectedClusterId) return;

    try {
      const response = await storageApi.createPersistentVolumeClaim(selectedClusterId, {
        ...pvcForm,
        requests: { storage: pvcForm.storage }
      });
      if (response.data) {
        setPersistentVolumeClaims([...persistentVolumeClaims, response.data]);
        setIsCreatePVCOpen(false);
        setPvcForm({
          name: "",
          namespace: "",
          access_modes: ["ReadWriteOnce"],
          storage_class_name: "",
          volume_mode: "Filesystem",
          storage: "1Gi"
        });
      }
    } catch (error) {
      console.error("创建PVC失败:", error);
    }
  };

  const handleDeletePVC = async (namespace: string, pvcName: string) => {
    if (!selectedClusterId) return;

    try {
      await storageApi.deletePersistentVolumeClaim(selectedClusterId, namespace, pvcName);
      setPersistentVolumeClaims(persistentVolumeClaims.filter(pvc => !(pvc.namespace === namespace && pvc.name === pvcName)));
    } catch (error) {
      console.error("删除PVC失败:", error);
    }
  };

  // 显示loading状态
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Database className="h-8 w-8 text-blue-600" />
              <h1 className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">
                Kubernetes管理面板
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <ClusterSelector />
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                登出
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                存储管理
              </h2>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                管理存储类、持久卷和持久卷声明
              </p>
            </div>
            <Button asChild>
              <Link href="/">
                返回首页
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>存储资源管理</CardTitle>
            <CardDescription>查看和管理Kubernetes集群的存储资源</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="classes">存储类</TabsTrigger>
                <TabsTrigger value="volumes">持久卷</TabsTrigger>
                <TabsTrigger value="claims">持久卷声明</TabsTrigger>
              </TabsList>

              {/* 存储类选项卡 */}
              <TabsContent value="classes">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">存储类管理</h3>
                    <Dialog open={isCreateSCOpen} onOpenChange={setIsCreateSCOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          创建存储类
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>创建存储类</DialogTitle>
                          <DialogDescription>
                            配置新的存储类参数
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="sc-name" className="text-right">名称</Label>
                            <Input
                              id="sc-name"
                              value={scForm.name}
                              onChange={(e) => setScForm({...scForm, name: e.target.value})}
                              className="col-span-3"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="sc-provisioner" className="text-right">Provisioner</Label>
                            <Select value={scForm.provisioner} onValueChange={(value) => setScForm({...scForm, provisioner: value, nfs_server: value === "kubernetes.io/nfs" ? scForm.nfs_server : "", nfs_path: value === "kubernetes.io/nfs" ? scForm.nfs_path : ""})}>
                              <SelectTrigger className="col-span-3">
                                <SelectValue placeholder="选择Provisioner" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="kubernetes.io/aws-ebs">AWS EBS</SelectItem>
                                <SelectItem value="kubernetes.io/gce-pd">GCE PD</SelectItem>
                                <SelectItem value="kubernetes.io/nfs">NFS</SelectItem>
                                <SelectItem value="kubernetes.io/host-path">Host Path</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {scForm.provisioner === "kubernetes.io/nfs" && (
                            <>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="sc-nfs-server" className="text-right">NFS服务器</Label>
                                <Input
                                  id="sc-nfs-server"
                                  value={scForm.nfs_server}
                                  onChange={(e) => setScForm({...scForm, nfs_server: e.target.value})}
                                  className="col-span-3"
                                  placeholder="192.168.1.100"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="sc-nfs-path" className="text-right">NFS路径</Label>
                                <Input
                                  id="sc-nfs-path"
                                  value={scForm.nfs_path}
                                  onChange={(e) => setScForm({...scForm, nfs_path: e.target.value})}
                                  className="col-span-3"
                                  placeholder="/export/data"
                                />
                              </div>
                            </>
                          )}
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="sc-reclaim" className="text-right">回收策略</Label>
                            <Select value={scForm.reclaim_policy} onValueChange={(value) => setScForm({...scForm, reclaim_policy: value})}>
                              <SelectTrigger className="col-span-3">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Delete">Delete</SelectItem>
                                <SelectItem value="Retain">Retain</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleCreateStorageClass}>创建</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>名称</TableHead>
                          <TableHead>Provisioner</TableHead>
                          <TableHead>回收策略</TableHead>
                          <TableHead>绑定模式</TableHead>
                          <TableHead>允许扩展</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {storageClasses.map((sc) => (
                          <TableRow key={sc.name}>
                            <TableCell className="font-medium">{sc.name}</TableCell>
                            <TableCell>{sc.provisioner}</TableCell>
                            <TableCell>
                              <Badge variant={sc.reclaim_policy === 'Delete' ? 'destructive' : 'secondary'}>
                                {sc.reclaim_policy}
                              </Badge>
                            </TableCell>
                            <TableCell>{sc.volume_binding_mode}</TableCell>
                            <TableCell>{sc.allow_volume_expansion ? '是' : '否'}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteStorageClass(sc.name)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </TabsContent>

              {/* 持久卷选项卡 */}
              <TabsContent value="volumes">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">持久卷管理</h3>
                    <Dialog open={isCreatePVOpen} onOpenChange={setIsCreatePVOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          创建持久卷
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>创建持久卷</DialogTitle>
                          <DialogDescription>
                            配置新的持久卷参数
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pv-name" className="text-right">名称</Label>
                            <Input
                              id="pv-name"
                              value={pvForm.name}
                              onChange={(e) => setPvForm({...pvForm, name: e.target.value})}
                              className="col-span-3"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pv-capacity" className="text-right">容量</Label>
                            <Input
                              id="pv-capacity"
                              value={pvForm.capacity}
                              onChange={(e) => setPvForm({...pvForm, capacity: e.target.value})}
                              className="col-span-3"
                              placeholder="1Gi"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pv-hostpath" className="text-right">Host Path</Label>
                            <Input
                              id="pv-hostpath"
                              value={pvForm.host_path}
                              onChange={(e) => setPvForm({...pvForm, host_path: e.target.value})}
                              className="col-span-3"
                              placeholder="/data/pv001"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleCreatePV}>创建</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>名称</TableHead>
                          <TableHead>容量</TableHead>
                          <TableHead>访问模式</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>存储类</TableHead>
                          <TableHead>绑定声明</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {persistentVolumes.map((pv) => (
                          <TableRow key={pv.name}>
                            <TableCell className="font-medium">{pv.name}</TableCell>
                            <TableCell>{pv.capacity}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {pv.access_modes.map((mode) => (
                                  <Badge key={mode} variant="outline">{mode}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={pv.status === 'Available' ? 'default' : 'secondary'}>
                                {pv.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{pv.storage_class || '-'}</TableCell>
                            <TableCell>{pv.claim || '-'}</TableCell>
                            <TableCell>
                              <div className="flex gap-2">
                                <Button variant="outline" size="sm" asChild>
                                  <Link href={`/storage/volumes/${pv.name}`}>
                                    <Eye className="h-4 w-4" />
                                  </Link>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeletePV(pv.name)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </TabsContent>

              {/* PVC选项卡 */}
              <TabsContent value="claims">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">持久卷声明管理</h3>
                    <Dialog open={isCreatePVCOpen} onOpenChange={setIsCreatePVCOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          创建PVC
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>创建持久卷声明</DialogTitle>
                          <DialogDescription>
                            配置新的持久卷声明参数
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pvc-name" className="text-right">名称</Label>
                            <Input
                              id="pvc-name"
                              value={pvcForm.name}
                              onChange={(e) => setPvcForm({...pvcForm, name: e.target.value})}
                              className="col-span-3"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pvc-namespace" className="text-right">命名空间</Label>
                            <Input
                              id="pvc-namespace"
                              value={pvcForm.namespace}
                              onChange={(e) => setPvcForm({...pvcForm, namespace: e.target.value})}
                              className="col-span-3"
                              placeholder="default"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pvc-storage" className="text-right">存储大小</Label>
                            <Input
                              id="pvc-storage"
                              value={pvcForm.storage}
                              onChange={(e) => setPvcForm({...pvcForm, storage: e.target.value})}
                              className="col-span-3"
                              placeholder="1Gi"
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleCreatePVC}>创建</Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>

                  {isLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>名称</TableHead>
                          <TableHead>命名空间</TableHead>
                          <TableHead>状态</TableHead>
                          <TableHead>容量</TableHead>
                          <TableHead>访问模式</TableHead>
                          <TableHead>存储类</TableHead>
                          <TableHead>绑定卷</TableHead>
                          <TableHead>操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {persistentVolumeClaims.map((pvc) => (
                          <TableRow key={`${pvc.namespace}-${pvc.name}`}>
                            <TableCell className="font-medium">{pvc.name}</TableCell>
                            <TableCell>{pvc.namespace}</TableCell>
                            <TableCell>
                              <Badge variant={pvc.status === 'Bound' ? 'default' : 'secondary'}>
                                {pvc.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{pvc.capacity}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {pvc.access_modes.map((mode) => (
                                  <Badge key={mode} variant="outline">{mode}</Badge>
                                ))}
                              </div>
                            </TableCell>
                            <TableCell>{pvc.storage_class || '-'}</TableCell>
                            <TableCell>{pvc.volume || '-'}</TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeletePVC(pvc.namespace, pvc.name)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
