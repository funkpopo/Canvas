"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Cpu, MemoryStick } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface PodMetricsPoint {
  timestamp: string;
  cpu: number;
  memory: number;
}

export function PodMetricsCharts({
  metricsData,
  isLoading,
}: {
  metricsData: PodMetricsPoint[];
  isLoading: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* CPU使用率图表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Cpu className="h-5 w-5 mr-2" />
            CPU使用率
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metricsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" />
                <YAxis domain={[0, 120]} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(1)}%`, "CPU使用率"]} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="cpu"
                  stroke="#71717a"
                  strokeWidth={2}
                  dot={false}
                  name="CPU使用率 (%)"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* 内存使用图表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MemoryStick className="h-5 w-5 mr-2" />
            内存使用
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={metricsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="timestamp" />
                <YAxis domain={[0, "dataMax + 50"]} />
                <Tooltip formatter={(value) => [`${Number(value).toFixed(0)} MB`, "内存使用"]} />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="memory"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                  name="内存使用 (MB)"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


