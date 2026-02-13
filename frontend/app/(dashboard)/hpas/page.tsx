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
import { ArrowLeft, Loader2, RefreshCw, Search, Trash2, TrendingUp, Server, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { LanguageToggle } from "@/components/ui/language-toggle";
import ClusterSelector from "@/components/ClusterSelector";
import { useAuth } from "@/lib/auth-context";
import { useCluster } from "@/lib/cluster-context";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { hpaApi, namespaceApi } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";

interface HPA {
  name: string;
  namespace: string;
  target_ref: string;
  min_replicas: number;
  max_replicas: number;
  current_replicas: number;
  desired_replicas: number;
  age: string;
  labels: Record<string, string>;
  cluster_id: number;
  cluster_name: string;
}

interface Namespace {
  name: string;
  status: string;
}

function HPAsContent() {
  const t = useTranslations("hpas");
  const tCommon = useTranslations("common");
  const tAuth = useTranslations("auth");
  const { runWithFeedback } = useAsyncActionFeedback();
  const { isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const { activeCluster } = useCluster();
  const [hpas, setHPAs] = useState<HPA[]>([]);
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
      fetchHPAs();
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

  const fetchHPAs = async () => {
    if (!selectedNamespace || !clusterIdNum) return;

    setIsLoading(true);
    try {
      const response = await hpaApi.getHPAs(clusterIdNum, selectedNamespace);
      if (response.data) {
        setHPAs(response.data);
      } else if (response.error) {
        toast.error(t("listLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load hpas failed:", error);
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
          const response = await hpaApi.deleteHPA(clusterIdNum, selectedNamespace, name);
          if (response.error) {
            throw new Error(response.error || t("deleteErrorUnknown"));
          }
          await fetchHPAs();
        },
        {
          loading: t("deleteLoading"),
          success: t("deleteSuccess"),
          error: t("deleteError"),
        }
      );
    } catch (error) {
      console.error("delete hpa failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const filteredHPAs = hpas.filter((hpa) =>
    hpa.name.toLowerCase().includes(searchTerm.toLowerCase())
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

  if (!clusterIdNum) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <div className="flex items-center">
                <Server className="h-8 w-8 text-zinc-600" />
                <h1 className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">Canvas</h1>
              </div>
              <div className="flex items-center space-x-4">
                <ClusterSelector />
                <LanguageToggle />
                <ThemeToggle />
                <Button variant="outline" onClick={logout}>
                  <LogOut className="h-4 w-4 mr-2" />
                  {tAuth("logout")}
                </Button>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t("clusterRequiredTitle")}</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">{t("clusterRequiredDescription")}</p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Server className="h-8 w-8 text-zinc-600" />
              <h1 className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">Canvas</h1>
            </div>
            <div className="flex items-center space-x-4">
              <ClusterSelector />
              <LanguageToggle />
              <ThemeToggle />
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4 mr-2" />
                {tAuth("logout")}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/">
              <Button variant="outline" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("back")}
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">{t("title")}</h1>
              <p className="text-muted-foreground">{t("description")}</p>
            </div>
          </div>
          <Button onClick={fetchHPAs} disabled={isLoading}>
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
                        <TableHead>{t("targetLabel")}</TableHead>
                        <TableHead>{t("replicasRangeLabel")}</TableHead>
                        <TableHead>{t("currentDesiredLabel")}</TableHead>
                        <TableHead>{t("ageLabel")}</TableHead>
                        <TableHead>{tCommon("actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredHPAs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            {selectedNamespace ? t("noHpasInNamespace") : t("selectNamespaceFirst")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredHPAs.map((hpa) => (
                          <TableRow key={hpa.name}>
                            <TableCell className="font-medium">
                              <div className="flex items-center">
                                <TrendingUp className="h-4 w-4 mr-2 text-blue-500" />
                                {hpa.name}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">{hpa.target_ref}</Badge>
                            </TableCell>
                            <TableCell>
                              {hpa.min_replicas} - {hpa.max_replicas}
                            </TableCell>
                            <TableCell>
                              <Badge variant={hpa.current_replicas === hpa.desired_replicas ? "default" : "secondary"}>
                                {hpa.current_replicas} / {hpa.desired_replicas}
                              </Badge>
                            </TableCell>
                            <TableCell>{hpa.age}</TableCell>
                            <TableCell>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setConfirmDialog({
                                    open: true,
                                    title: t("deleteTitle"),
                                    description: t("deleteDescription", { name: hpa.name }),
                                    onConfirm: () => handleDelete(hpa.name),
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
      </main>
    </div>
  );
}

export default function HPAsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <HPAsContent />
    </Suspense>
  );
}
