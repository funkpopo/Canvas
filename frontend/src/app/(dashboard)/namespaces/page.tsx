"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { fetchNamespaces, queryKeys } from "@/lib/api";

export default function NamespacesPage() {
  const { data: namespaces, isLoading, isError } = useQuery({
    queryKey: queryKeys.namespaces,
    queryFn: fetchNamespaces,
  });
  const totalNamespaces = namespaces?.length ?? 0;
  const systemNamespaces = (namespaces ?? []).filter(
    (ns) => ns.name === "kube-system" || ns.name === "kube-public" || ns.name === "kube-node-lease" || ns.name.startsWith("kube-")
  ).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Namespace management"
        title="Organize and isolate resources"
        description="Monitor namespace utilization, enforce policies, and manage access controls across your cluster."
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Total</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{totalNamespaces}</p>
              <p className="text-xs text-text-muted">Active namespaces managed.</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>System</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{systemNamespaces}</p>
              <p className="text-xs text-text-muted">Critical system namespaces.</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Status</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">Ready</p>
              <p className="text-xs text-text-muted">Namespace discovery status.</p>
            </div>
          </>
        }
      />

      <div className="grid gap-6">
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <p className="text-text-muted">Loading namespaces...</p>
            </CardContent>
          </Card>
        ) : isError ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <p className="text-text-muted">Failed to load namespaces.</p>
            </CardContent>
          </Card>
        ) : totalNamespaces === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-8">
              <div className="text-center space-y-2">
                <p className="text-text-muted">No namespace data available</p>
                <p className="text-xs text-text-muted">Connect to a cluster to view namespaces</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {namespaces!.map((ns) => (
              <Card key={ns.name} className="relative overflow-hidden">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base text-text-primary">{ns.name}</CardTitle>
                      <CardDescription className="flex items-center gap-2">
                        <Badge variant={ns.status === "Active" ? "success-light" : ns.status === "Terminating" ? "warning-light" : "neutral-light"} size="sm" className={badgePresets.status}>
                          {ns.status}
                        </Badge>
                        <span className="text-xs text-text-muted">{Object.keys(ns.labels || {}).length} labels</span>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/namespaces/${encodeURIComponent(ns.name)}`}>
                        <Button size="sm">Manage</Button>
                      </Link>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {ns.resource_quota ? (
                    <div className="text-xs text-text-muted">ResourceQuota set</div>
                  ) : (
                    <div className="text-xs text-text-muted">No ResourceQuota</div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

