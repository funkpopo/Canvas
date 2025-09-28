import { ShieldCheck, Users } from "lucide-react";
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

const namespaceGroups = [
  {
    name: "platform",
    owner: "Platform Engineering",
    policies: ["NetworkPolicy", "Kyverno", "OPA"],
    badges: ["production", "privileged"],
  },
  {
    name: "observability",
    owner: "SRE",
    policies: ["seccomp", "resource-quota"],
    badges: ["restricted"],
  },
  {
    name: "sandbox",
    owner: "Internal Developers",
    policies: ["limit-range"],
    badges: ["ephemeral"],
  },
] as const;

export default function NamespacesPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Namespaces"
        title="Policy posture & tenancy"
        description="Group namespaces by sensitivity, align guardrails, and offer fast paths for compliant self-service."
        actions={
          <Button type="button" className="bg-gradient-to-r from-emerald-400 to-teal-500 text-slate-900 hover:from-emerald-300 hover:to-teal-400">
            Provision namespace
          </Button>
        }
        meta={
          <>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Total</p>
              <p className="mt-1 text-lg font-semibold text-white">18</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Active namespaces managed.</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Restricted</p>
              <p className="mt-1 text-lg font-semibold text-white">4</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Require change approvals for updates.</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--canvas-muted)]">Drift flagged</p>
              <p className="mt-1 text-lg font-semibold text-white">1</p>
              <p className="text-xs text-[color:var(--canvas-muted)]">Pending policy remediation.</p>
            </div>
          </>
        }
      >
        <Badge variant="outline" className="border-amber-400/40 bg-amber-500/10 text-amber-100">
          Namespace quota refresh scheduled
        </Badge>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-3">
        {namespaceGroups.map((namespace) => (
          <Card key={namespace.name} className="border-[var(--canvas-border)] bg-[var(--canvas-panel)]/85">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-white">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-sky-100">
                  <Users className="h-4 w-4" aria-hidden />
                </span>
                {namespace.name}
              </CardTitle>
              <CardDescription>{namespace.owner}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm text-slate-200">
              <div className="flex flex-wrap gap-2">
                {namespace.badges.map((badge) => (
                  <Badge key={badge} variant="outline" className="border-white/20 bg-white/10 text-xs uppercase tracking-[0.3em] text-white">
                    {badge}
                  </Badge>
                ))}
              </div>
              <div className="rounded-lg border border-white/5 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.25em] text-[color:var(--canvas-muted)]">
                  Policies
                </p>
                <ul className="mt-2 grid gap-1 text-xs text-[color:var(--canvas-muted)]">
                  {namespace.policies.map((policy) => (
                    <li key={`${namespace.name}-${policy}`}>- {policy}</li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.25em] text-[color:var(--canvas-muted)]">
                <span>Access audit</span>
                <ShieldCheck className="h-4 w-4 text-emerald-200" aria-hidden />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}