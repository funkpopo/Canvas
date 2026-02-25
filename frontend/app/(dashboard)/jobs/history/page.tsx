"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Loader2, RefreshCw, Search, Filter, Calendar } from "lucide-react";
import { jobApi, clusterApi, namespaceApi, JobHistory } from "@/lib/api";
import { useTranslations } from "@/hooks/use-translations";
import { useAsyncActionFeedback } from "@/hooks/use-async-action-feedback";
import { toast } from "sonner";

interface Cluster {
  id: number;
  name: string;
}

interface Namespace {
  name: string;
  status: string;
}

function JobHistoryContent() {
  const t = useTranslations("jobs");
  const tCommon = useTranslations("common");
  const { runWithFeedback } = useAsyncActionFeedback();
  const [history, setHistory] = useState<JobHistory[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [namespaces, setNamespaces] = useState<Namespace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOperationLoading, setIsOperationLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const searchParams = useSearchParams();
  const clusterIdFromUrl = searchParams.get("cluster_id");
  const [clusterFilter, setClusterFilter] = useState<string>(clusterIdFromUrl ?? "all");
  const [namespaceFilter, setNamespaceFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [limit] = useState<number>(50);

  useEffect(() => {
    fetchClusters();
    fetchHistory();
  }, []);

  useEffect(() => {
    if (!clusterFilter || clusterFilter === "all") {
      setNamespaces([]);
      setNamespaceFilter("all");
      return;
    }

    fetchNamespaces();
  }, [clusterFilter]);

  const fetchClusters = async () => {
    try {
      const response = await clusterApi.getClusters();
      if (response.data) {
        setClusters(response.data);
      } else if (response.error) {
        toast.error(t("clustersLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load clusters failed:", error);
      toast.error(t("clustersLoadError"));
    }
  };

  const fetchNamespaces = async () => {
    if (!clusterFilter || clusterFilter === "all") return;

    try {
      const response = await namespaceApi.getNamespaces(parseInt(clusterFilter, 10));
      if (response.data) {
        setNamespaces(response.data);
      } else if (response.error) {
        toast.error(t("namespacesLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load namespaces failed:", error);
      toast.error(t("namespacesLoadError"));
    }
  };

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const response = await jobApi.getJobHistory(
        clusterFilter && clusterFilter !== "all" ? parseInt(clusterFilter, 10) : undefined,
        namespaceFilter && namespaceFilter !== "all" ? namespaceFilter : undefined,
        statusFilter && statusFilter !== "all" ? statusFilter : undefined,
        startDate || undefined,
        endDate || undefined,
        limit
      );

      if (response.data) {
        setHistory(response.data);
      } else if (response.error) {
        toast.error(t("historyLoadErrorWithMessage", { message: response.error }));
      }
    } catch (error) {
      console.error("load history failed:", error);
      toast.error(t("historyLoadError"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleMonitorStatus = async (record: JobHistory) => {
    setIsOperationLoading(true);
    try {
      await runWithFeedback(
        async () => {
          const response = await jobApi.monitorJobStatus(record.id);
          if (!response.data) {
            throw new Error(response.error || t("monitorStatusErrorUnknown"));
          }
          await fetchHistory();
        },
        {
          loading: t("monitorStatusLoading", { name: record.job_name }),
          success: t("monitorStatusSuccess", { name: record.job_name }),
          error: t("monitorStatusError"),
        }
      );
    } catch (error) {
      console.error("monitor status failed:", error);
    } finally {
      setIsOperationLoading(false);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case "succeeded":
        return "default";
      case "failed":
        return "destructive";
      case "running":
      case "active":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return t("statusPending");
      case "running":
      case "active":
        return t("statusRunning");
      case "succeeded":
        return t("statusSucceeded");
      case "failed":
        return t("statusFailed");
      default:
        return status;
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return t("emptyValue");
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return t("durationHoursMinutesSeconds", { hours, minutes, seconds: secs });
    }

    if (minutes > 0) {
      return t("durationMinutesSeconds", { minutes, seconds: secs });
    }

    return t("durationSeconds", { seconds: secs });
  };

  const filteredHistory = history.filter((record) => {
    const matchesSearch =
      record.job_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (record.error_message &&
        record.error_message.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/jobs">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("backToJobs")}
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{t("historyTitle")}</h1>
            <p className="text-muted-foreground">{t("historyDescription")}</p>
          </div>
        </div>
        <Button onClick={fetchHistory} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          {t("refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("historyFiltersTitle")}</CardTitle>
          <CardDescription>{t("historyFiltersDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder={t("searchHistoryPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={clusterFilter} onValueChange={setClusterFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectClusterPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allClusters")}</SelectItem>
                {clusters.map((cluster) => (
                  <SelectItem key={cluster.id} value={cluster.id.toString()}>
                    {cluster.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={namespaceFilter}
              onValueChange={setNamespaceFilter}
              disabled={clusterFilter === "all"}
            >
              <SelectTrigger>
                <SelectValue placeholder={t("selectNamespacePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allNamespaces")}</SelectItem>
                {namespaces.map((ns) => (
                  <SelectItem key={ns.name} value={ns.name}>
                    {ns.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectStatusPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStatuses")}</SelectItem>
                <SelectItem value="Pending">{t("statusPending")}</SelectItem>
                <SelectItem value="Running">{t("statusRunning")}</SelectItem>
                <SelectItem value="Succeeded">{t("statusSucceeded")}</SelectItem>
                <SelectItem value="Failed">{t("statusFailed")}</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="date"
                aria-label={t("startTime")}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="date"
                aria-label={t("completionTime")}
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button onClick={fetchHistory} disabled={isLoading}>
              <Filter className="h-4 w-4 mr-2" />
              {t("applyFilters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("historyListTitle")}</CardTitle>
          <CardDescription>
            {t("historyRecordsCount", { count: filteredHistory.length })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("noMatchingHistory")}</div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("jobNameLabel")}</TableHead>
                    <TableHead>{t("namespaceLabel")}</TableHead>
                    <TableHead>{t("clusterLabel")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead>{t("startTime")}</TableHead>
                    <TableHead>{t("completionTime")}</TableHead>
                    <TableHead>{t("duration")}</TableHead>
                    <TableHead>{t("podsStatsLabel")}</TableHead>
                    <TableHead>{tCommon("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistory.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-medium">{record.job_name}</TableCell>
                      <TableCell>{record.namespace}</TableCell>
                      <TableCell>{record.cluster_id}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(record.status)}>
                          {getStatusLabel(record.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {record.start_time
                          ? new Date(record.start_time).toLocaleString()
                          : t("emptyValue")}
                      </TableCell>
                      <TableCell>
                        {record.end_time
                          ? new Date(record.end_time).toLocaleString()
                          : t("emptyValue")}
                      </TableCell>
                      <TableCell>{formatDuration(record.duration || undefined)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div>{t("podsSucceededCount", { count: record.succeeded_pods })}</div>
                          <div>{t("podsFailedCount", { count: record.failed_pods })}</div>
                          <div>{t("podsTotalCount", { count: record.total_pods })}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleMonitorStatus(record)}
                          disabled={isOperationLoading}
                        >
                          {isOperationLoading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                          {t("monitorStatus")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function JobHistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      }
    >
      <JobHistoryContent />
    </Suspense>
  );
}
