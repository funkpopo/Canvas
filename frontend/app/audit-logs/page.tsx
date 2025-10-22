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
  ArrowLeft,
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

export default function AuditLogsPage() {
  const router = useRouter();
  const { user: currentUser, isLoading: authLoading } = useAuth();
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
    if (!authLoading) {
      if (!currentUser || currentUser.role !== "admin") {
        if (!permissionErrorShown) {
          toast.error("需要管理员权限");
          setPermissionErrorShown(true);
        }
        router.push("/");
        return;
      }
      setPermissionErrorShown(false); // 重置错误状态
      fetchLogs();
      fetchStats();
    }
  }, [authLoading, currentUser, page, searchAction, resourceTypeFilter, successFilter, startDate, endDate, router, permissionErrorShown]);

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
        toast.error(response.error || "获取审计日志失败");
      }
    } catch (error) {
      toast.error("获取审计日志失败");
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

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={() => router.push("/")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">审计日志</h1>
              <p className="text-muted-foreground">查看系统操作记录和统计</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowStats(!showStats)}>
            {showStats ? "隐藏统计" : "显示统计"}
          </Button>
        </div>

        {/* Statistics */}
        {showStats && stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">总操作数</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.total_operations}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  成功 {stats.success_count} | 失败 {stats.failed_count}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">成功率</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.success_rate}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  操作成功比率
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">活跃用户</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.user_stats.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  有操作记录的用户
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">资源类型</CardTitle>
                <Filter className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.resource_stats.length}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  涉及的资源类型数
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Statistics Details */}
        {showStats && stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Action Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">操作类型统计</CardTitle>
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
                <CardTitle className="text-sm">资源类型统计</CardTitle>
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
                <CardTitle className="text-sm">用户活动统计</CardTitle>
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
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>筛选条件</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索操作类型..."
                  value={searchAction}
                  onChange={(e) => setSearchAction(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Input
                placeholder="资源类型"
                value={resourceTypeFilter}
                onChange={(e) => setResourceTypeFilter(e.target.value)}
              />
              <Select value={successFilter} onValueChange={setSuccessFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="所有状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有状态</SelectItem>
                  <SelectItem value="true">成功</SelectItem>
                  <SelectItem value="false">失败</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Input
                type="datetime-local"
                placeholder="开始时间"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                type="datetime-local"
                placeholder="结束时间"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <Button variant="outline" onClick={resetFilters}>
                重置筛选
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Logs Table */}
        <Card>
          <CardHeader>
            <CardTitle>操作日志</CardTitle>
            <CardDescription>共 {total} 条记录</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                暂无审计日志
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>时间</TableHead>
                        <TableHead>用户</TableHead>
                        <TableHead>操作</TableHead>
                        <TableHead>资源类型</TableHead>
                        <TableHead>资源名称</TableHead>
                        <TableHead>集群</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>IP地址</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs">
                            {new Date(log.created_at).toLocaleString("zh-CN")}
                          </TableCell>
                          <TableCell className="font-medium">
                            {log.username || `用户${log.user_id}`}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{log.action}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{log.resource_type}</Badge>
                          </TableCell>
                          <TableCell className="max-w-xs truncate">
                            {log.resource_name}
                          </TableCell>
                          <TableCell>
                            {log.cluster_name || `集群${log.cluster_id}`}
                          </TableCell>
                          <TableCell>
                            {log.success ? (
                              <Badge variant="outline" className="text-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                成功
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-red-600">
                                <XCircle className="h-3 w-3 mr-1" />
                                失败
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {log.ip_address || "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      第 {page} 页，共 {totalPages} 页
                    </p>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page - 1)}
                        disabled={page === 1}
                      >
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(page + 1)}
                        disabled={page === totalPages}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 