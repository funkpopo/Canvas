import { Settings, ShieldCheck, FileText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryKeys, fetchClusterConfig } from "@/lib/api";

const toneMap = {
  ready: "border-emerald-400/40 bg-emerald-500/15 text-emerald-100",
  pending: "border-amber-400/40 bg-amber-500/15 text-amber-100",
};

export function QuickActions() {
  const { data: config, isLoading } = useQuery({
    queryKey: queryKeys.clusterConfig,
    queryFn: fetchClusterConfig,
  });

  const items = [
    {
      icon: Settings,
      title: "Cluster connectivity",
      description: config ? config.api_server ?? "API server configured" : "No cluster connection saved yet",
      status: config ? "ready" : "pending",
      action: "Open settings",
    },
    {
      icon: ShieldCheck,
      title: "Credentials",
      description: config?.token_present ? "Service account token available" : "Token missing",
      status: config?.token_present ? "ready" : "pending",
      action: "Review secrets",
    },
    {
      icon: FileText,
      title: "Kubeconfig",
      description: config?.kubeconfig_present ? "Inline kubeconfig stored" : "Kubeconfig not provided",
      status: config?.kubeconfig_present ? "ready" : "pending",
      action: "Edit kubeconfig",
    },
  ];

  return (
    <Card className="relative overflow-hidden border-[var(--canvas-border)] bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-slate-950/70">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(6,182,212,0.25),transparent_60%)]"
        aria-hidden
      />
      <CardHeader className="relative z-10">
        <CardTitle className="text-lg text-white">Configuration health</CardTitle>
        <CardDescription>Current integration status for the connected cluster.</CardDescription>
      </CardHeader>
      <CardContent className="relative z-10 grid gap-3">
        {items.map((item, index) => {
          const Icon = item.icon;
          const tone = toneMap[item.status];
          return (
            <div
              key={index}
              className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-teal-100">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-[color:var(--canvas-muted)]">
                    {isLoading ? "Checking…" : item.description}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={tone}>
                  {item.status === "ready" ? "Ready" : "Action"}
                </Badge>
                <Button asChild variant="outline" size="sm" className="border-white/20 bg-white/5 text-xs uppercase tracking-[0.3em] text-slate-200">
                  <a href="/settings">{item.action}</a>
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
