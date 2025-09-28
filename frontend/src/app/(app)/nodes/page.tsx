import { Cpu, HardDrive, MapPin } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const pools = [
  {
    name: "blue-nodes",
    flavor: "c3-standard-8",
    capacity: "12 nodes",
    status: "98% healthy",
  },
  {
    name: "gpu-inference",
    flavor: "a3-highgpu-8g",
    capacity: "4 nodes",
    status: "4 GPUs schedulable",
  },
  {
    name: "batch-preemptible",
    flavor: "c2-standard-60",
    capacity: "8 nodes",
    status: "Spare capacity available",
  },
] as const;

export default function NodesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Node fleet"
        title="Capacity & placement"
        description="Understand node readiness, zoning, and placement hints before rolling out workloads."
        actions={
          <Button type="button" className="bg-gradient-to-r from-sky-400 to-blue-500 text-slate-900 hover:from-sky-300 hover:to-blue-400">
            Open cluster map
          </Button>
        }
        meta={
          <>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Ready</p>
              <p className="mt-1 text-lg font-semibold text-white">22</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Nodes reporting Ready condition.</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Cordoned</p>
              <p className="mt-1 text-lg font-semibold text-white">2</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Maintenance window in progress.</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Average pressure</p>
              <p className="mt-1 text-lg font-semibold text-white">61%</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Rolling 15m CPU+memory utilization.</p>
            </div>
          </>
        }
      >
        <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-emerald-100">
          Auto-repair enabled
        </Badge>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-3">
        {pools.map((pool) => (
          <Card key={pool.name} className="border-[var(--canvas-border)] bg-[var(--canvas-panel)]/85">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-white">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-teal-100">
                  <Cpu className="h-4 w-4" aria-hidden />
                </span>
                {pool.name}
              </CardTitle>
              <CardDescription>{pool.flavor}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <div className="flex items-center gap-2 text-[color:var(--canvas-muted)]">
                <MapPin className="h-4 w-4" aria-hidden />
                Multi-AZ: eu-central-1a/b/c
              </div>
              <div className="flex items-center gap-2 text-[color:var(--canvas-muted)]">
                <HardDrive className="h-4 w-4" aria-hidden />
                Ephemeral SSD cache warmed
              </div>
              <div className="rounded-lg border border-white/5 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--canvas-muted)]">
                  Status
                </p>
                <p className="text-sm font-medium text-white">{pool.status}</p>
                <p className="text-xs text-[color:var(--canvas-muted)]">Capacity: {pool.capacity}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}