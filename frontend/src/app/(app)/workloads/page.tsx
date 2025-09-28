import { GitBranch, LayoutDashboard, Timer } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function WorkloadsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Workload catalog"
        title="Deeper workload intelligence"
        description="Drill into Kubernetes objects with version history, rollout progress, and SLO alignment."
        actions={
          <Button type="button" className="bg-gradient-to-r from-violet-400 to-fuchsia-500 text-slate-900 hover:from-violet-300 hover:to-fuchsia-400">
            Create deployment
          </Button>
        }
        meta={
          <>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Deployments</p>
              <p className="mt-1 text-lg font-semibold text-white">164</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">13 updated within the last hour.</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">StatefulSets</p>
              <p className="mt-1 text-lg font-semibold text-white">42</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">10 with persistent volume claims.</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">CronJobs</p>
              <p className="mt-1 text-lg font-semibold text-white">28</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Next job wave kicks off in 6 minutes.</p>
            </div>
          </>
        }
      >
        <Badge variant="outline" className="border-sky-400/40 bg-sky-500/10 text-sky-100">
          GitOps sync & drift detection ready
        </Badge>
      </PageHeader>

      <Tabs defaultValue="deployments" className="gap-6">
        <TabsList className="bg-white/5 p-1">
          <TabsTrigger value="deployments" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">
            Deployments
          </TabsTrigger>
          <TabsTrigger value="stateful" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">
            StatefulSets
          </TabsTrigger>
          <TabsTrigger value="cron" className="data-[state=active]:bg-white/10 data-[state=active]:text-white">
            CronJobs
          </TabsTrigger>
        </TabsList>
        <TabsContent value="deployments" className="mt-4 grid gap-6 xl:grid-cols-3">
          <Card className="border-[var(--canvas-border)] bg-[var(--canvas-panel)]/85">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                Progressive rollouts
              </CardTitle>
              <CardDescription>Visualize blue/green and canary strategies side by side.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <p>Diff manifests, compare replica sets, and monitor health gates.</p>
              <div className="rounded-lg border border-white/5 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--canvas-muted)]">Coming soon</p>
                <p className="text-sm font-medium text-white">Interactive rollout timeline with promotion controls.</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-[var(--canvas-border)] bg-[var(--canvas-panel)]/85">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <GitBranch className="h-4 w-4" aria-hidden />
                GitOps insights
              </CardTitle>
              <CardDescription>Trace configuration drift and highlight unmerged commits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <p>Link deployments to source repos, CI run metadata, and committers.</p>
              <Badge variant="outline" className="border-emerald-400/40 bg-emerald-500/10 text-emerald-100">
                Flux & Argo CD integrations
              </Badge>
            </CardContent>
          </Card>
          <Card className="border-[var(--canvas-border)] bg-[var(--canvas-panel)]/85">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-white">
                <Timer className="h-4 w-4" aria-hidden />
                Release policy guardrails
              </CardTitle>
              <CardDescription>Gate promotions on SLO burn, incident state, and approvals.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-slate-200">
              <p>Define guard conditions and simulate policy impact before rollout.</p>
              <p className="rounded-lg border border-white/5 bg-white/5 p-3 text-xs text-[color:var(--canvas-muted)]">
                Tap into existing SRE governance while keeping deployments fast and auditable.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="stateful" className="mt-4">
          <Card className="border-[var(--canvas-border)] bg-[var(--canvas-panel)]/85">
            <CardHeader>
              <CardTitle className="text-white">Stateful insights</CardTitle>
              <CardDescription>Volume health, quorum warnings, and failover automation coming soon.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-[color:var(--canvas-muted)]">
              Tailor observability for StatefulSets with replica identity and PVC analytics.
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="cron" className="mt-4">
          <Card className="border-[var(--canvas-border)] bg-[var(--canvas-panel)]/85">
            <CardHeader>
              <CardTitle className="text-white">Job orchestration</CardTitle>
              <CardDescription>P95 runtime, missed jobs, and concurrency controls.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-[color:var(--canvas-muted)]">
              Visual calendar view and failure auto-retry will be available shortly.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}