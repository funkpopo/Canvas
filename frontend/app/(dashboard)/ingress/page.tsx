"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Search, Trash2, Globe, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { toast } from "sonner";
import dynamic from "next/dynamic";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const YamlEditor = dynamic(() => import("@/components/YamlEditor"), { ssr: false });
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ingressApi, namespaceApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";

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
  const t = useTranslations("ingresses");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
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

  // 创建对话框状态
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createYamlContent, setCreateYamlContent] = useState("");
  const [createYamlError, setCreateYamlError] = useState("");

  const router = useRouter();
  const clusterId = activeCluster?.id.toString();
  const clusterIdNum = clusterId ? parseInt(clusterId, 10) : null;

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/login");
      return;
    }
  }, [isAuthenticated, authLoading, router]);

  useEffect(() => {
    if (isAuthenticated && clusterIdNum) {
      fetchNamespaces();
    }
  }, [isAuthenticated, clusterIdNum]);

  useEffect(() => {
    if (isAuthenticated && clusterIdNum && selectedNamespace) {
      fetchIngresses();
    }
  }, [isAuthenticated, clusterIdNum, selectedNamespace]);

  const fetchNamespaces = async () => {
    if (!clusterIdNum) return;

    try {
      const response = await namespaceApi.getNamespaces(clusterIdNum);
      if (response.data) {
        setNamespaces(response.data);
        if (response.data.length > 0 && !selectedNamespace) {
          setSelectedNamespace(response.data[0].name);
        }
      } else if (response.error) {
        toast.error(t("namespacesLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load namespaces failed:", error);
      toast.error(t("namespacesLoadError"));
    }
  };

  const fetchIngresses = async () => {
    if (!selectedNamespace || !clusterIdNum) return;

    setIsLoading(true);
    try {
      const response = await ingressApi.getIngresses(clusterIdNum, selectedNamespace);
      if (response.data) {
        setIngresses(response.data);
      } else if (response.error) {
        toast.error(t("listLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load ingresses failed:", error);
      toast.error(t("listLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!clusterIdNum) return;

    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await ingressApi.deleteIngress(clusterIdNum, selectedNamespace, name);
          if (response.error) {
            throw new Error(response.error || t("deleteErrorUnknown"));
          }
          await fetchIngresses();
        },
        {
          loading: t("deleteLoading"),
          success: t("deleteSuccess"),
          error: t("deleteError"),
        }
      );
    } catch (error) {
      console.error("delete ingress failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const filteredIngresses = ingresses.filter((ing) =>
    ing.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const ingressYamlTemplate = `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  namespace: ${selectedNamespace || "default"}
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-service
            port:
              number: 80
`;

  const handleCreateIngress = async () => {
    if (!clusterIdNum) {
      toast.error(t("selectClusterFirst"));
      return;
    }
    if (!createYamlContent.trim()) {
      toast.error(t("yamlRequired"));
      return;
    }
    try {
      await runWithFeedback(
        async () => {
          const response = await ingressApi.createIngress(
            clusterIdNum,
            selectedNamespace || "default",
            createYamlContent
          );
          if (!response.data) {
            throw new Error(response.error || t("createErrorUnknown"));
          }
          setIsCreateOpen(false);
          setCreateYamlContent("");
          await fetchIngresses();
        },
        {
          loading: t("createLoading"),
          success: t("createSuccess"),
          error: t("createError"),
        }
      );
    } catch (error) {
      console.error("create ingress failed:", error);
    }
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

  if (!clusterIdNum) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-medium mb-2">{t("clusterRequiredTitle")}</h3>
            <p className="text-muted-foreground mb-4">{t("clusterRequiredDescription")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setCreateYamlContent(ingressYamlTemplate); setCreateYamlError(""); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t("createIngress")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t("createTitle")}</DialogTitle>
              <DialogDescription>{t("createDescription")}</DialogDescription>
            </DialogHeader>
            <YamlEditor
              value={createYamlContent}
              onChange={(value) => { setCreateYamlContent(value); setCreateYamlError(""); }}
              error={createYamlError}
              label={t("yamlEditorLabel")}
              template={ingressYamlTemplate}
              onApplyTemplate={() => setCreateYamlContent(ingressYamlTemplate)}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                {tCommon("cancel")}
              </Button>
              <Button onClick={handleCreateIngress} disabled={!createYamlContent.trim() || !!createYamlError}>
                {t("createIngress")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button onClick={fetchIngresses} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          {t("refresh")}
        </Button>
      </div>

      <Card>
          <CardHeader>
            <CardTitle>{t("listTitle")}</CardTitle>
            <CardDescription>{t("listDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4">
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-[200px]">
                  <Select value={selectedNamespace} onValueChange={setSelectedNamespace}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("namespacePlaceholder")} />
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
                      placeholder={t("searchPlaceholder")}
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
                  <span className="ml-2">{tCommon("loading")}</span>
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("nameLabel")}</TableHead>
                        <TableHead>{t("hostsLabel")}</TableHead>
                        <TableHead>{t("addressesLabel")}</TableHead>
                        <TableHead>{t("ageLabel")}</TableHead>
                        <TableHead>{tCommon("actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredIngresses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            {selectedNamespace ? t("noIngressesInNamespace") : t("selectNamespaceFirst")}
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
                                  <span className="text-muted-foreground text-sm">{t("emptyHost")}</span>
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
                                  <span className="text-muted-foreground text-sm">{t("emptyAddress")}</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{ing.age}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setConfirmDialog({
                                    open: true,
                                    title: t("deleteTitle"),
                                    description: t("deleteDescription", { name: ing.name }),
                                    onConfirm: () => handleDelete(ing.name),
                                  })
                                }
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
          onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
          title={confirmDialog.title}
          description={confirmDialog.description}
          onConfirm={confirmDialog.onConfirm}
        />
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
