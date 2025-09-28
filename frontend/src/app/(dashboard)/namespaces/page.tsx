import { PageHeader } from "@/features/dashboard/layouts/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";

export default function NamespacesPage() {
  // TODO: Replace with actual API call when namespace endpoint is available
  const isLoading = false;
  const isError = false;
  const totalNamespaces = 0;
  const systemNamespaces = 0;

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
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <p className="text-text-muted">No namespace data available</p>
              <p className="text-xs text-text-muted">Connect to a cluster to view namespaces</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

