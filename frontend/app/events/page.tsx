"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, AlertTriangle, Info, CheckCircle, XCircle, Loader2, RefreshCw } from "lucide-react";
import AuthGuard from "@/components/AuthGuard";

interface EventInfo {
  name: string;
  namespace: string;
  type: string;
  reason: string;
  message: string;
  source: string | null;
  count: number;
  first_timestamp: string | null;
  last_timestamp: string | null;
  age: string;
  involved_object: {
    kind: string;
    name: string;
    namespace: string;
  } | null;
  cluster_id: number;
  cluster_name: string;
}

function EventsPageContent() {
  const [events, setEvents] = useState<EventInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const token = localStorage.getItem("token");
      const response = await fetch("http://localhost:8000/api/events", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setEvents(data);
      } else {
        console.error("获取事件列表失败");
      }
    } catch (error) {
      console.error("获取事件列表出错:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case "Warning":
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case "Normal":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "Error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getEventTypeBadgeVariant = (type: string) => {
    switch (type) {
      case "Warning":
        return "destructive";
      case "Normal":
        return "default";
      case "Error":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return "Unknown";

    try {
      const date = new Date(timestamp);
      return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="flex items-center">
                <ArrowLeft className="h-5 w-5 mr-2" />
                <span className="text-gray-600 dark:text-gray-400">返回仪表板</span>
              </Link>
            </div>
            <Button variant="outline" onClick={fetchEvents} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              刷新
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            事件查看
          </h2>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            查看集群内部的历史事件信息
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin mr-2" />
            <span className="text-lg">加载中...</span>
          </div>
        ) : events.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Info className="h-12 w-12 text-gray-400 mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                暂无事件
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                没有找到任何事件信息
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>事件列表</CardTitle>
              <CardDescription>
                显示最近 {events.length} 个事件，按时间倒序排列
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">类型</TableHead>
                      <TableHead>原因</TableHead>
                      <TableHead>对象</TableHead>
                      <TableHead>消息</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead>计数</TableHead>
                      <TableHead>时间戳</TableHead>
                      <TableHead>年龄</TableHead>
                      <TableHead>集群</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((event, index) => (
                      <TableRow key={`${event.cluster_id}-${event.name}-${index}`}>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {getEventTypeIcon(event.type)}
                            <Badge variant={getEventTypeBadgeVariant(event.type)}>
                              {event.type}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{event.reason}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div className="font-medium">
                              {event.involved_object?.kind}/{event.involved_object?.name}
                            </div>
                            <div className="text-gray-500">
                              {event.involved_object?.namespace}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <div className="truncate" title={event.message}>
                            {event.message}
                          </div>
                        </TableCell>
                        <TableCell>{event.source || "Unknown"}</TableCell>
                        <TableCell>{event.count}</TableCell>
                        <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                          {formatTimestamp(event.last_timestamp)}
                        </TableCell>
                        <TableCell>{event.age}</TableCell>
                        <TableCell>{event.cluster_name}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

export default function EventsPage() {
  return (
    <AuthGuard>
      <EventsPageContent />
    </AuthGuard>
  );
}
