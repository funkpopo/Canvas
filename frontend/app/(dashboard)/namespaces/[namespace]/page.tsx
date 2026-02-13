"use client";

import { useEffect, useMemo, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Loader2, RefreshCw, Users, Settings, FileText, Database, Cpu, MemoryStick, HardDrive, ExternalLink, Briefcase } from "lucide-react";
import { ClusterContextRequired } from "@/components/ClusterContextRequired";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { resolveClusterContext, withClusterId } from "@/lib/cluster-context-resolver";
import { toast } from "sonner";
import { jobApi, Job, namespaceApi, storageApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";

interface NamespaceResources {
  cpu_requests: string;
  cpu_limits: string;
  memory_requests: string;
  memory_limits: string;
  pods: number;
  persistent_volume_claims: number;
  config_maps: number;
  secrets: number;
  services: number;
}

interface Deployment {
  name: string;
  replicas: number;
  ready_replicas: number;
  available_replicas: number;
  updated_replicas: number;
  age: string;
  images: string[];
  labels: Record<string, string>;
  status: string;
}

interface Service {
  name: string;
  type: string;
  cluster_ip: string;
  external_ip?: string;
  ports: Array<{
    port: number;
    target_port: number | string;
    protocol: string;
    node_port?: number;
  }>;
  selector: Record<string, string>;
  age: string;
  labels: Record<string, string>;
}

interface CRD {
  name: string;
  kind: string;
  api_version: string;
  namespace: string;
  age: string;
  labels: Record<string, string>;
}

interface PVC {
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

export default function NamespaceDetailsPage({ params }: { params: Promise<{ namespace: string }> }) {
  const t = useTranslations("namespaceDetails");
  const tCommon = useTranslations("common");
  const resolvedParams = use(params);
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [resources, setResources] = useState<NamespaceResources | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [pvcs, setPvcs] = useState<PVC[]>([]);
  const [crds, setCrds] = useState<CRD[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeCluster } = useCluster();
  const clusterContext = useMemo(
    () =>
      resolveClusterContext({
        clusterIdFromUrl: searchParams.get("cluster_id"),
        activeClusterId: activeCluster?.id ?? null,
      }),
    [searchParams, activeCluster?.id]
  );
  const effectiveClusterId = clusterContext.clusterId;
  const isClusterContextMissing = clusterContext.source === "none";

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (isClusterContextMissing) {
      setIsLoading(false);
      setResources(null);
      setDeployments([]);
      setServices([]);
      setPvcs([]);
      setCrds([]);
      setJobs([]);
      return;
    }
    fetchNamespaceData();
  }, [isAuthenticated, isClusterContextMissing, effectiveClusterId, resolvedParams.namespace, activeTab]);

  const fetchNamespaceData = async () => {
    if (!effectiveClusterId) return;
    setIsLoading(true);
    try {
      if (activeTab === "overview") {
        // 获取资源使用情况
        const result = await namespaceApi.getNamespaceResources(
          effectiveClusterId,
          resolvedParams.namespace
        );

        if (result.data) {
          setResources(result.data as unknown as NamespaceResources);
        }
      } else if (activeTab === "deployments") {
        // 获取部署
        const result = await namespaceApi.getNamespaceDeployments(
          effectiveClusterId,
          resolvedParams.namespace
        );

        if (result.data) {
          setDeployments(result.data as unknown as Deployment[]);
        }
      } else if (activeTab === "services") {
        // 获取服务
        const result = await namespaceApi.getNamespaceServices(
          effectiveClusterId,
          resolvedParams.namespace
        );

        if (result.data) {
          setServices(result.data as unknown as Service[]);
        }
      } else if (activeTab === "pvcs") {
        // 获取PVC
        const result = await storageApi.getPersistentVolumeClaims(
          effectiveClusterId,
          resolvedParams.namespace
        );

        if (result.data) {
          setPvcs(result.data as unknown as PVC[]);
        }
      } else if (activeTab === "crds") {
        // 获取CRD
        const result = await namespaceApi.getNamespaceCrds(
          effectiveClusterId,
          resolvedParams.namespace
        );

        if (result.data) {
          setCrds(result.data as unknown as CRD[]);
        }
      } else if (activeTab === "jobs") {
        // 获取Jobs
        const jobsResponse = await jobApi.getJobs(effectiveClusterId, resolvedParams.namespace);
        if (jobsResponse.data) {
          setJobs(jobsResponse.data);
        } else if (jobsResponse.error) {
          toast.error(t("loadJobsErrorWithMessage", { message: jobsResponse.error }));
        }
      }
    } catch (error) {
      console.error("获取命名空间数据出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatAge = (timestamp: string) => {
    if (!timestamp) return t("unknownValue");
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 0) return t("daysAgo", { count: diffDays });
    if (diffHours > 0) return t("hoursAgo", { count: diffHours });
    if (diffMinutes > 0) return t("minutesAgo", { count: diffMinutes });
    return t("justNow");
  };

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
    <div>
      {/* Page header with actions */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            {t("title", { namespace: resolvedParams.namespace })}
          </h2>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            {t("description")}
          </p>
        </div>
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={fetchNamespaceData} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {t("refresh")}
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div>

        {isClusterContextMissing ? (
          <ClusterContextRequired />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="overview">{t("tabOverview")}</TabsTrigger>
              <TabsTrigger value="deployments">{t("tabDeployments")}</TabsTrigger>
              <TabsTrigger value="services">{t("tabServices")}</TabsTrigger>
              <TabsTrigger value="jobs">Jobs</TabsTrigger>
              <TabsTrigger value="pvcs">PVC</TabsTrigger>
              <TabsTrigger value="crds">{t("tabCrds")}</TabsTrigger>
            </TabsList>

            {/* 概览标签页 */}
            <TabsContent value="overview" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">{tCommon("loading")}</span>
              </div>
            ) : resources ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <section className="py-4 border-b last:border-b-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-medium">Pods</h3>
                    <Activity className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{resources.pods}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("podsCountDescription")}
                  </p>
                </section>

                <section className="py-4 border-b last:border-b-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-medium">Services</h3>
                    <Settings className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{resources.services}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("servicesCountDescription")}
                  </p>
                </section>

                <section className="py-4 border-b last:border-b-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-medium">ConfigMaps</h3>
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{resources.config_maps}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("configMapsCountDescription")}
                  </p>
                </section>

                <section className="py-4 border-b last:border-b-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-medium">Secrets</h3>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{resources.secrets}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("secretsCountDescription")}
                  </p>
                </section>

                <section className="py-4 border-b last:border-b-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-medium">PVCs</h3>
                    <Database className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{resources.persistent_volume_claims}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("pvcsCountDescription")}
                  </p>
                </section>

                <section className="py-4 border-b last:border-b-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-medium">{t("cpuResourcesTitle")}</h3>
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{resources.cpu_requests}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("resourceSummary", { requests: resources.cpu_requests, limits: resources.cpu_limits })}
                  </p>
                </section>

                <section className="py-4 border-b last:border-b-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-sm font-medium">{t("memoryResourcesTitle")}</h3>
                    <MemoryStick className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="text-2xl font-bold">{resources.memory_requests}</div>
                  <p className="text-xs text-muted-foreground">
                    {t("resourceSummary", { requests: resources.memory_requests, limits: resources.memory_limits })}
                  </p>
                </section>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12">
                <Activity className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {t("resourcesUnavailableTitle")}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {t("resourcesUnavailableDescription")}
                </p>
              </div>
            )}
          </TabsContent>

            {/* 部署标签页 */}
            <TabsContent value="deployments" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">{tCommon("loading")}</span>
              </div>
            ) : deployments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {t("noDeploymentsTitle")}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {t("noDeploymentsDescription")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {deployments.map((deployment) => (
                  <Link
                    key={deployment.name}
                    href={withClusterId(
                      `/deployments/${resolvedParams.namespace}/${deployment.name}`,
                      effectiveClusterId
                    )}
                  >
                    <div className="border rounded-lg p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-lg font-medium">{deployment.name}</h4>
                        <Badge variant={deployment.status === "Running" ? "default" : "secondary"}>
                          {deployment.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {t("deploymentMeta", {
                          ready: deployment.ready_replicas,
                          replicas: deployment.replicas,
                          available: deployment.available_replicas,
                          updated: deployment.updated_replicas,
                          age: formatAge(deployment.age),
                        })}
                      </p>
                      <div className="space-y-2">
                        <div>
                          <h4 className="text-sm font-medium mb-1">{t("imagesLabel")}</h4>
                          <div className="flex flex-wrap gap-1">
                            {deployment.images.map((image, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {image}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {Object.keys(deployment.labels).length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">{t("labelsLabel")}</h4>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(deployment.labels).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {value}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

            {/* 服务标签页 */}
            <TabsContent value="services" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">{tCommon("loading")}</span>
              </div>
            ) : services.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Settings className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {t("noServicesTitle")}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {t("noServicesDescription")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {services.map((service) => (
                  <div key={service.name} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-lg font-medium">{service.name}</h4>
                      <Badge variant="outline">{service.type}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {t("serviceMeta", {
                        clusterIp: service.cluster_ip,
                        externalIp: service.external_ip || "",
                        age: formatAge(service.age),
                      })}
                    </p>
                    <div className="space-y-2">
                        <div>
                          <h4 className="text-sm font-medium mb-1">{t("portsLabel")}</h4>
                          <div className="flex flex-wrap gap-1">
                            {service.ports.map((port, index) => (
                              <Badge key={index} variant="outline" className="text-xs">
                                {port.port}:{port.target_port} ({port.protocol})
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {service.type === 'NodePort' && service.ports.some(port => port.node_port) && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">{t("accessAddressesLabel")}</h4>
                            <div className="flex flex-wrap gap-2">
                              {service.ports.filter(port => port.node_port).map((port, index) => (
                                <Button
                                  key={index}
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    const protocol = port.protocol === 'TCP' ? 'http' : 'https';
                                    const url = `${protocol}://<node-ip>:${port.node_port}`;
                                    navigator.clipboard.writeText(url).then(() => {
                                      toast.success(t("accessUrlCopied"));
                                    }).catch(() => {
                                      toast.error(t("accessUrlCopyFailed", { url }));
                                    });
                                  }}
                                  className="text-xs h-7"
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  NodePort {port.node_port}
                                </Button>
                              ))}
                            </div>
                            <p className="text-xs text-gray-500 mt-1">{t("replaceNodeIpHint")}</p>
                          </div>
                        )}
                        {Object.keys(service.selector).length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">{t("selectorsLabel")}</h4>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(service.selector).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {value}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {Object.keys(service.labels).length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">{t("labelsLabel")}</h4>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(service.labels).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {value}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                ))}
              </div>
            )}
          </TabsContent>

            {/* PVC标签页 */}
            <TabsContent value="pvcs" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">{tCommon("loading")}</span>
              </div>
            ) : pvcs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <HardDrive className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {t("noPvcsTitle")}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {t("noPvcsDescription")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {pvcs.map((pvc, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-lg font-medium">{pvc.name}</h4>
                      <Badge variant={pvc.status === 'Bound' ? 'default' : 'secondary'}>
                        {pvc.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {t("pvcMeta", {
                        capacity: pvc.capacity,
                        storageClass: pvc.storage_class || t("defaultStorageClass"),
                        volumeMode: pvc.volume_mode,
                      })}
                    </p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-medium mb-1">{t("accessModesLabel")}</h4>
                        <div className="flex flex-wrap gap-1">
                          {pvc.access_modes.map((mode) => (
                            <Badge key={mode} variant="outline" className="text-xs">
                              {mode}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {pvc.volume && (
                        <div>
                          <h4 className="text-sm font-medium mb-1">{t("boundVolumeLabel")}</h4>
                          <p className="text-sm text-gray-600 dark:text-gray-400">{pvc.volume}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

            {/* CRD标签页 */}
            <TabsContent value="crds" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">{tCommon("loading")}</span>
              </div>
            ) : crds.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {t("noCrdsTitle")}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {t("noCrdsDescription")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {crds.map((crd, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="text-lg font-medium">{crd.name}</h4>
                      <Badge variant="outline">{crd.kind}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      {t("crdMeta", { apiVersion: crd.api_version, age: formatAge(crd.age) })}
                    </p>
                    {Object.keys(crd.labels).length > 0 && (
                      <div>
                        <h4 className="text-sm font-medium mb-1">{t("labelsLabel")}</h4>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(crd.labels).map(([key, value]) => (
                            <Badge key={key} variant="secondary" className="text-xs">
                              {key}: {value}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

            {/* Jobs标签页 */}
            <TabsContent value="jobs" className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mr-2" />
                <span className="text-lg">{tCommon("loading")}</span>
              </div>
            ) : jobs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {t("noJobsTitle")}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {t("noJobsDescription")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {jobs.map((job) => (
                  <Link
                    key={job.name}
                    href={withClusterId(`/jobs/${resolvedParams.namespace}/${job.name}`, effectiveClusterId)}
                  >
                    <div className="border rounded-lg p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-lg font-medium">{job.name}</h4>
                        <Badge variant={
                          job.status.toLowerCase() === 'succeeded' ? 'default' :
                          job.status.toLowerCase() === 'failed' ? 'destructive' :
                          job.status.toLowerCase() === 'running' || job.status.toLowerCase() === 'active' ? 'secondary' :
                          'outline'
                        }>
                          {job.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        {t("jobMeta", {
                          succeeded: job.succeeded,
                          completions: job.completions,
                          active: job.active,
                          age: formatAge(job.age),
                        })}
                      </p>
                      <div className="space-y-2">
                        {job.failed > 0 && (
                          <div className="flex items-center space-x-2">
                            <Badge variant="destructive" className="text-xs">
                              {t("jobFailedCount", { count: job.failed })}
                            </Badge>
                          </div>
                        )}
                        {Object.keys(job.labels).length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-1">{t("labelsLabel")}</h4>
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(job.labels).map(([key, value]) => (
                                <Badge key={key} variant="secondary" className="text-xs">
                                  {key}: {value}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}
