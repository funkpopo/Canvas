import { PageHeader } from "@/features/dashboard/layouts/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/ui/card";
import { Badge, badgePresets } from "@/shared/ui/badge";

export default function NodesPage() {
  // TODO: Replace with actual API call when nodes endpoint is available
  const totalNodes = 0;
  const readyNodes = 0;
  const spotInstances = 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Node management"
        title="Scale infrastructure dynamically"
        description="Monitor node pools, track resource utilization, and automate capacity planning across availability zones."
        meta={
          <>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Ready nodes</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{readyNodes}</p>
              <p className="text-xs text-text-muted">Active worker nodes across all pools.</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Spot instances</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{spotInstances}</p>
              <p className="text-xs text-text-muted">Cost-optimized capacity for batch workloads.</p>
            </div>
            <div>
              <p className={`${badgePresets.label} text-text-muted`}>Total nodes</p>
              <p className="mt-1 text-lg font-semibold text-text-primary">{totalNodes}</p>
              <p className="text-xs text-text-muted">All nodes in the cluster.</p>
            </div>
          </>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <p className="text-text-muted">No node data available</p>
              <p className="text-xs text-text-muted">Connect to a cluster to view nodes</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

