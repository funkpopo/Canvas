import { Settings, ShieldCheck, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";

import { StatusBadge } from "@/shared/ui/status-badge";
import { queryKeys, fetchClusterConfig } from "@/lib/api";

type StatusType = "ready" | "pending";

export function QuickActions() {
  const router = useRouter();
  const { data: config, isLoading } = useQuery({
    queryKey: queryKeys.clusterConfig,
    queryFn: fetchClusterConfig,
  });

  const items = [
    {
      icon: Settings,
      title: "Cluster connectivity",
      description: config ? config.api_server ?? "API server configured" : "No cluster connection saved yet",
      status: (config ? "ready" : "pending") as StatusType,
      action: "Open settings",
      href: "/settings#connectivity",
    },
    {
      icon: ShieldCheck,
      title: "Credentials", 
      description: config?.token_present ? "Service account token available" : "Token missing",
      status: (config?.token_present ? "ready" : "pending") as StatusType,
      action: "Review secrets",
      href: "/settings#credentials",
    },
    {
      icon: FileText,
      title: "Kubeconfig",
      description: config?.kubeconfig_present ? "Inline kubeconfig stored" : "Kubeconfig not provided", 
      status: (config?.kubeconfig_present ? "ready" : "pending") as StatusType,
      action: "Edit kubeconfig",
      href: "/settings#kubeconfig",
    },
  ];

  return (
    <Card className="relative overflow-hidden border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-lg text-text-primary">Quick actions</CardTitle>
        <CardDescription>Common configuration and management tasks</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item, index) => {
          const Icon = item.icon;
          return (
            <div
              key={index}
              className="flex items-center justify-between rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="font-medium text-text-primary">{item.title}</p>
                  <p className="text-xs text-text-muted">{item.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge 
                  status={item.status === "ready" ? "ready" : "pending"} 
                  label={item.status === "ready" ? "Ready" : "Pending"}
                  size="sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    if ((item as any).href) {
                      router.push((item as any).href);
                    }
                  }}
                >
                  {item.action}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

