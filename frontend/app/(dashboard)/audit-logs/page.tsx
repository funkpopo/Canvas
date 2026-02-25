"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  TrendingUp,
  Activity,
  Users,
  Filter,
} from "lucide-react";
import { auditLogApi, AuditLog, AuditStats } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useTranslations } from "@/hooks/use-translations";
import { useLanguage } from "@/lib/language-context";
import { PageHeader } from "@/components/PageHeader";

export default function AuditLogsPage() {
  const t = useTranslations("auditLogs");
  const { locale } = useLanguage();
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [showStats, setShowStats] = useState(true);

  // 筛选条件
  const [searchAction, setSearchAction] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");
  const [successFilter, setSuccessFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [permissionErrorShown, setPermissionErrorShown] = useState(false);

  useEffect(() => {
    if (!currentUser || currentUser.role !== "admin") {
      if (!permissionErrorShown) {
        toast.error(t("adminRequired"));
        setPermissionErrorShown(true);
      }
      router.push("/");
      return;
    }

    setPermissionErrorShown(false); // 重置错误状态
    fetchLogs();
    fetchStats();
  }, [
    currentUser,
    page,
    searchAction,
    resourceTypeFilter,
    successFilter,
    startDate,
    endDate,
    router,
    permissionErrorShown,
  ]);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const params: any = { page, page_size: pageSize };
      if (searchAction) params.action = searchAction;
      if (resourceTypeFilter) params.resource_type = resourceTypeFilter;
      if (successFilter && successFilter !== "all") params.success = successFilter === "true";
      if (startDate) params.start_date = new Date(startDate).toISOString();
      if (endDate) params.end_date = new Date(endDate).toISOString();

      const response = await auditLogApi.getAuditLogs(params);
      if (response.data) {
        setLogs(response.data.logs);
        setTotal(response.data.total);
      } else {
        toast.error(response.error || t("loadLogsError"));
      }
    } catch {
      toast.error(t("loadLogsError"));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const params: any = {};
      if (startDate) params.start_date = new Date(startDate).toISOString();
      if (endDate) params.end_date = new Date(endDate).toISOString();

      const response = await auditLogApi.getAuditStats(params);
      if (response.data) {
        setStats(response.data);
      }
    } catch (error) {
      console.error("获取统计数据失败:", error);
    }
  };

  const resetFilters = () => {
    setSearchAction("");
    setResourceTypeFilter("");
    setSuccessFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("title")}
        description={t("description")}
        actions={
          <Button variant="outline" onClick={() => setShowStats(!showStats)}>
            {showStats ? t("hideStats") : t("showStats")}
          </Button>
        }
      />

      {/* Statistics */}
      {showStats && stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("totalOperations")}</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_operations}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("successFailedSummary", {
                  success: stats.success_count,
                  failed: stats.failed_count,
                })}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("successRate")}</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.success_rate}%</div>
              <p className="text-xs text-muted-foreground mt-1">{t("successRateDescription")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("activeUsers")}</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.user_stats.length}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("activeUsersDescription")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t("resourceTypes")}</CardTitle>
              <Filter className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.resource_stats.length}</div>
              <p className="text-xs text-muted-foreground mt-1">{t("resourceTypesDescription")}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Statistics Details */}
      {showStats && stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Action Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("actionStatsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {stats.action_stats.slice(0, 10).map((stat) => (
                  <div key={stat.action} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{stat.action}</span>
                    <span className="font-medium">{stat.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Resource Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("resourceStatsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {stats.resource_stats.slice(0, 10).map((stat) => (
                  <div key={stat.resource_type} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{stat.resource_type}</span>
                    <span className="font-medium">{stat.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* User Stats */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("userStatsTitle")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {stats.user_stats.slice(0, 10).map((stat) => (
                  <div key={stat.username} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{stat.username}</span>
                    <span className="font-medium">{stat.count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>{t("filtersTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("searchActionPlaceholder")}
                value={searchAction}
                onChange={(e) => setSearchAction(e.target.value)}
                className="pl-9"
              />
            </div>
            <Input
              placeholder={t("resourceTypePlaceholder")}
              value={resourceTypeFilter}
              onChange={(e) => setResourceTypeFilter(e.target.value)}
            />
            <Select value={successFilter} onValueChange={setSuccessFilter}>
              <SelectTrigger>
                <SelectValue placeholder={t("allStatuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStatuses")}</SelectItem>
                <SelectItem value="true">{t("statusSuccess")}</SelectItem>
                <SelectItem value="false">{t("statusFailed")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input
              type="datetime-local"
              placeholder={t("startTimePlaceholder")}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <Input
              type="datetime-local"
              placeholder={t("endTimePlaceholder")}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <Button variant="outline" onClick={resetFilters}>
              {t("resetFilters")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t("logsTitle")}</CardTitle>
          <CardDescription>{t("totalRecords", { total })}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("noLogs")}</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("timeLabel")}</TableHead>
                      <TableHead>{t("userLabel")}</TableHead>
                      <TableHead>{t("actionLabel")}</TableHead>
                      <TableHead>{t("resourceTypeLabel")}</TableHead>
                      <TableHead>{t("resourceNameLabel")}</TableHead>
                      <TableHead>{t("clusterLabel")}</TableHead>
                      <TableHead>{t("statusLabel")}</TableHead>
                      <TableHead>{t("ipAddressLabel")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">
                          {new Date(log.created_at).toLocaleString(
                            locale === "zh" ? "zh-CN" : "en-US"
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {log.username || t("userFallback", { id: log.user_id })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.action}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{log.resource_type}</Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{log.resource_name}</TableCell>
                        <TableCell>
                          {log.cluster_name || t("clusterFallback", { id: log.cluster_id })}
                        </TableCell>
                        <TableCell>
                          {log.success ? (
                            <Badge variant="outline" className="text-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {t("statusSuccess")}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600">
                              <XCircle className="h-3 w-3 mr-1" />
                              {t("statusFailed")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">{log.ip_address || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    {t("pageSummary", { page, totalPages })}
                  </p>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page === 1}
                    >
                      {t("previousPage")}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page === totalPages}
                    >
                      {t("nextPage")}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
