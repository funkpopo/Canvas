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
import { LogOut, Database, Plus, Trash2, Eye, Loader2, ArrowLeft } from "lucide-react";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { storageApi } from "@/lib/api";
import type { Cluster } from "@/lib/cluster-context";
import { toast } from "sonner";
import { useTranslations } from "@/hooks/use-translations";

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
  const t = useTranslations("storagePage");
  const tCommon = useTranslations("common");

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
    nfs_path: "",
    // Custom provisioner fields
    custom_provisioner: false,
    provisioner_image: ""
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
  const { activeCluster, clusters, isLoading: clusterLoading } = useCluster();

  useEffect(() => {
    console.log("Storage page useEffect:", { authLoading, isAuthenticated, activeCluster });

    if (!authLoading && !isAuthenticated) {
      console.log("Storage page: User not authenticated, redirecting to login");
      router.push("/login");
      return;
    }

    if (activeCluster) {
      console.log("Storage page: Setting active cluster", activeCluster.id);
      setSelectedClusterId(activeCluster.id);
      loadData(activeCluster.id);
    } else {
      console.log("Storage page: No active cluster");
      // 没有活跃集群时停止加载状态
      setIsLoading(false);
    }
  }, [isAuthenticated, authLoading, router, activeCluster]);

  const loadData = async (clusterId?: number) => {
    const id = clusterId ?? selectedClusterId;
    if (!id) {
      console.log("loadData: No cluster id, skipping");
      return;
    }

    console.log("loadData: Loading data for cluster", id);
    setIsLoading(true);
    try {
      // 并行加载所有存储数据
      const [scResponse, pvResponse, pvcResponse] = await Promise.all([
        storageApi.getStorageClasses(id),
        storageApi.getPersistentVolumes(id),
        storageApi.getPersistentVolumeClaims(id)
      ]);

      console.log("loadData: API responses", { scResponse, pvResponse, pvcResponse });

      // 处理存储类数据
      if (scResponse.data !== undefined) {
        console.log("loadData: Setting storage classes", scResponse.data);
        setStorageClasses(scResponse.data);
      } else if (scResponse.error) {
        console.error("加载存储类失败:", scResponse.error);
      } else {
        console.warn("loadData: No storage class data and no error");
      }

      // 处理持久卷数据
      if (pvResponse.data !== undefined) {
        setPersistentVolumes(pvResponse.data);
      } else if (pvResponse.error) {
        console.error("加载持久卷失败:", pvResponse.error);
      }

      // 处理PVC数据
      if (pvcResponse.data !== undefined) {
        setPersistentVolumeClaims(pvcResponse.data);
      } else if (pvcResponse.error) {
        console.error("加载PVC失败:", pvcResponse.error);
      }
    } catch (error) {
      console.error("加载存储数据失败:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateStorageClass = async () => {
    if (!selectedClusterId) return;

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
        nfs_path: "",
        custom_provisioner: false,
        provisioner_image: ""
      });
      // 重新加载数据以确保显示最新的存储类列表
      loadData(selectedClusterId ?? undefined);
    } else if (response.error) {
      console.error("创建存储类失败:", response.error);
      toast.error(t("createStorageClassErrorWithMessage", { message: response.error }));
    }
  };

  const handleDeleteStorageClass = async (scName: string) => {
    if (!selectedClusterId) return;

    try {
      await storageApi.deleteStorageClass(selectedClusterId, scName);
      setStorageClasses(storageClasses.filter(sc => sc.cluster_id === selectedClusterId && sc.name !== scName));
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">{tCommon("backToDashboard")}</span>
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <ClusterSelector />
            </div>
          </div>
        </div>
      </header>

      {/* 检查是否有活跃集群 */}
      {!activeCluster && !isLoading && !clusterLoading ? (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
            <Database className="h-16 w-16 text-gray-400 mb-4" />
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
              {t("noActiveClusterTitle")}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              {t("noActiveClusterDescription")}
            </p>
            <div className="text-sm text-gray-500 mt-4">
              <p>{t("authStatus", { status: isAuthenticated ? t("statusAuthenticated") : t("statusUnauthenticated") })}</p>
              <p>{t("clusterCount", { count: clusters.length })}</p>
              <p>{t("activeClusterStatus", { status: activeCluster ? t("statusSelected") : t("statusNone") })}</p>
            </div>
            <Button asChild>
              <Link href="/clusters/new">
                {t("createCluster")}
              </Link>
            </Button>
          </div>
        </main>
      ) : (
        /* Main Content */
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("title")}
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {t("description")}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("resourceManagementTitle")}</CardTitle>
            <CardDescription>{t("resourceManagementDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="classes">{t("tabStorageClasses")}</TabsTrigger>
                <TabsTrigger value="volumes">{t("tabVolumes")}</TabsTrigger>
                <TabsTrigger value="claims">{t("tabClaims")}</TabsTrigger>
              </TabsList>

              {/* 存储类选项卡 */}
              <TabsContent value="classes">
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">{t("storageClassesTitle")}</h3>
                    <Dialog open={isCreateSCOpen} onOpenChange={setIsCreateSCOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          {t("createStorageClass")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t("createStorageClass")}</DialogTitle>
                          <DialogDescription>
                            {t("createStorageClassDescription")}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="sc-name" className="text-right">{t("nameLabel")}</Label>
                            <Input
                              id="sc-name"
                              value={scForm.name}
                              onChange={(e) => setScForm({...scForm, name: e.target.value})}
                              className="col-span-3"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">{t("provisionerTypeLabel")}</Label>
                            <div className="col-span-3 flex items-center space-x-2">
                              <Select value={scForm.custom_provisioner ? "custom" : "preset"} onValueChange={(value) => setScForm({...scForm, custom_provisioner: value === "custom", provisioner: value === "custom" ? "" : scForm.provisioner, provisioner_image: value === "custom" ? scForm.provisioner_image : ""})}>
                                <SelectTrigger className="flex-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="preset">{t("presetProvisioner")}</SelectItem>
                                  <SelectItem value="custom">{t("customProvisioner")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {scForm.custom_provisioner ? (
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="sc-custom-provisioner" className="text-right">Provisioner</Label>
                              <Input
                                id="sc-custom-provisioner"
                                value={scForm.provisioner}
                                onChange={(e) => setScForm({...scForm, provisioner: e.target.value})}
                                className="col-span-3"
                                placeholder={t("customProvisionerPlaceholder")}
                              />
                            </div>
                          ) : (
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="sc-provisioner" className="text-right">Provisioner</Label>
                              <Select value={scForm.provisioner} onValueChange={(value) => setScForm({...scForm, provisioner: value, nfs_server: (value === "kubernetes.io/nfs" || value === "k8s-sigs.io/nfs-subdir-external-provisioner") ? scForm.nfs_server : "", nfs_path: (value === "kubernetes.io/nfs" || value === "k8s-sigs.io/nfs-subdir-external-provisioner") ? scForm.nfs_path : ""})}>
                                <SelectTrigger className="col-span-3">
                                  <SelectValue placeholder={t("selectProvisioner")} />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="kubernetes.io/aws-ebs">AWS EBS</SelectItem>
                                  <SelectItem value="kubernetes.io/gce-pd">GCE PD</SelectItem>
                                  <SelectItem value="kubernetes.io/nfs">{t("nfsBuiltIn")}</SelectItem>
                                  <SelectItem value="k8s-sigs.io/nfs-subdir-external-provisioner">NFS Subdir External Provisioner</SelectItem>
                                  <SelectItem value="kubernetes.io/host-path">Host Path</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          {scForm.custom_provisioner && (
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="sc-provisioner-image" className="text-right">{t("provisionerImageLabel")}</Label>
                              <Input
                                id="sc-provisioner-image"
                                value={scForm.provisioner_image}
                                onChange={(e) => setScForm({...scForm, provisioner_image: e.target.value})}
                                className="col-span-3"
                                placeholder={t("provisionerImagePlaceholder")}
                              />
                            </div>
                          )}
                          {(scForm.provisioner === "kubernetes.io/nfs" || scForm.provisioner === "k8s-sigs.io/nfs-subdir-external-provisioner") && (
                            <>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="sc-nfs-server" className="text-right">{t("nfsServerLabel")}</Label>
                                <Input
                                  id="sc-nfs-server"
                                  value={scForm.nfs_server}
                                  onChange={(e) => setScForm({...scForm, nfs_server: e.target.value})}
                                  className="col-span-3"
                                  placeholder="192.168.1.100"
                                />
                              </div>
                              <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="sc-nfs-path" className="text-right">{t("nfsPathLabel")}</Label>
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
                          {scForm.provisioner === "k8s-sigs.io/nfs-subdir-external-provisioner" && !scForm.custom_provisioner && (
                            <div className="grid grid-cols-4 items-center gap-4">
                              <Label htmlFor="sc-provisioner-image" className="text-right">{t("provisionerImageLabel")}</Label>
                              <Input
                                id="sc-provisioner-image"
                                value={scForm.provisioner_image || "eipwork/nfs-subdir-external-provisioner"}
                                onChange={(e) => setScForm({...scForm, provisioner_image: e.target.value})}
                                className="col-span-3"
                                placeholder="eipwork/nfs-subdir-external-provisioner"
                              />
                            </div>
                          )}
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="sc-reclaim" className="text-right">{t("reclaimPolicyLabel")}</Label>
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
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="sc-binding-mode" className="text-right">{t("bindingModeLabel")}</Label>
                            <Select value={scForm.volume_binding_mode} onValueChange={(value) => setScForm({...scForm, volume_binding_mode: value})}>
                              <SelectTrigger className="col-span-3">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Immediate">Immediate</SelectItem>
                                <SelectItem value="WaitForFirstConsumer">WaitForFirstConsumer</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <DialogFooter>
                          <Button onClick={handleCreateStorageClass}>{tCommon("create")}</Button>
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
                          <TableHead>{t("nameLabel")}</TableHead>
                          <TableHead>Provisioner</TableHead>
                          <TableHead>{t("reclaimPolicyLabel")}</TableHead>
                          <TableHead>{t("bindingModeLabel")}</TableHead>
                          <TableHead>{t("allowExpansionLabel")}</TableHead>
                          <TableHead>{t("clusterLabel")}</TableHead>
                          <TableHead>{tCommon("actions")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {storageClasses.map((sc) => (
                          <TableRow key={`${sc.cluster_id}-${sc.name}`}>
                            <TableCell className="font-medium">{sc.name}</TableCell>
                            <TableCell>{sc.provisioner}</TableCell>
                            <TableCell>
                              <Badge variant={sc.reclaim_policy === 'Delete' ? 'destructive' : 'secondary'}>
                                {sc.reclaim_policy}
                              </Badge>
                            </TableCell>
                            <TableCell>{sc.volume_binding_mode}</TableCell>
                            <TableCell>{sc.allow_volume_expansion ? t("yes") : t("no")}</TableCell>
                            <TableCell>{sc.cluster_name}</TableCell>
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
                    <h3 className="text-lg font-medium">{t("volumesTitle")}</h3>
                    <Dialog open={isCreatePVOpen} onOpenChange={setIsCreatePVOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          {t("createVolume")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t("createVolume")}</DialogTitle>
                          <DialogDescription>
                            {t("createVolumeDescription")}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pv-name" className="text-right">{t("nameLabel")}</Label>
                            <Input
                              id="pv-name"
                              value={pvForm.name}
                              onChange={(e) => setPvForm({...pvForm, name: e.target.value})}
                              className="col-span-3"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pv-capacity" className="text-right">{t("capacityLabel")}</Label>
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
                          <Button onClick={handleCreatePV}>{tCommon("create")}</Button>
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
                          <TableHead>{t("nameLabel")}</TableHead>
                          <TableHead>{t("capacityLabel")}</TableHead>
                          <TableHead>{t("accessModesLabel")}</TableHead>
                          <TableHead>{t("statusLabel")}</TableHead>
                          <TableHead>{t("storageClassLabel")}</TableHead>
                          <TableHead>{t("boundClaimLabel")}</TableHead>
                          <TableHead>{tCommon("actions")}</TableHead>
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
                    <h3 className="text-lg font-medium">{t("claimsTitle")}</h3>
                    <Dialog open={isCreatePVCOpen} onOpenChange={setIsCreatePVCOpen}>
                      <DialogTrigger asChild>
                        <Button>
                          <Plus className="h-4 w-4 mr-2" />
                          {t("createPvc")}
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{t("createPvc")}</DialogTitle>
                          <DialogDescription>
                            {t("createPvcDescription")}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pvc-name" className="text-right">{t("nameLabel")}</Label>
                            <Input
                              id="pvc-name"
                              value={pvcForm.name}
                              onChange={(e) => setPvcForm({...pvcForm, name: e.target.value})}
                              className="col-span-3"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pvc-namespace" className="text-right">{t("namespaceLabel")}</Label>
                            <Input
                              id="pvc-namespace"
                              value={pvcForm.namespace}
                              onChange={(e) => setPvcForm({...pvcForm, namespace: e.target.value})}
                              className="col-span-3"
                              placeholder="default"
                            />
                          </div>
                          <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="pvc-storage" className="text-right">{t("storageSizeLabel")}</Label>
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
                          <Button onClick={handleCreatePVC}>{tCommon("create")}</Button>
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
                          <TableHead>{t("nameLabel")}</TableHead>
                          <TableHead>{t("namespaceLabel")}</TableHead>
                          <TableHead>{t("statusLabel")}</TableHead>
                          <TableHead>{t("capacityLabel")}</TableHead>
                          <TableHead>{t("accessModesLabel")}</TableHead>
                          <TableHead>{t("storageClassLabel")}</TableHead>
                          <TableHead>{t("boundVolumeLabel")}</TableHead>
                          <TableHead>{tCommon("actions")}</TableHead>
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
      )}
    </div>
  );
}
