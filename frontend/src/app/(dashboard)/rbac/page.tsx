"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { fetchRbacSummary, queryKeys, type RbacSummaryResponse } from "@/lib/api";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Badge } from "@/shared/ui/badge";

export default function RbacPage() {
  return (
    <AuthGate allow={["viewer", "operator", "admin"]}>
      <RbacInner />
    </AuthGate>
  );
}

function RbacInner() {
  const [ns, setNs] = useState<string>("all");
  const { data } = useQuery({ queryKey: queryKeys.rbacSummary(ns), queryFn: () => fetchRbacSummary(ns === "all" ? undefined : ns) });
  const summary: RbacSummaryResponse | undefined = data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="RBAC"
        description="Kubernetes Roles/Bindings overview"
        actions={<input className="rounded-md border border-[var(--canvas-border)] bg-transparent px-3 py-1 text-sm" placeholder="namespace (optional)" value={ns === "all" ? "" : ns} onChange={(e) => setNs(e.target.value || "all")} />}
        meta={<>
          <div><p className="text-xs text-text-muted">Roles</p><p className="mt-1 text-lg font-semibold text-text-primary">{summary?.roles.length ?? 0}</p></div>
          <div><p className="text-xs text-text-muted">RoleBindings</p><p className="mt-1 text-lg font-semibold text-text-primary">{summary?.role_bindings.length ?? 0}</p></div>
          <div><p className="text-xs text-text-muted">ClusterRoles</p><p className="mt-1 text-lg font-semibold text-text-primary">{summary?.cluster_roles.length ?? 0}</p></div>
          <div><p className="text-xs text-text-muted">ClusterRoleBindings</p><p className="mt-1 text-lg font-semibold text-text-primary">{summary?.cluster_role_bindings.length ?? 0}</p></div>
        </>}
      />

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">Roles</h2>
        <div className="overflow-hidden rounded-xl border border-[var(--canvas-border)]">
          <table className="w-full text-sm">
            <thead className="bg-black/40 text-text-muted"><tr><th className="px-3 py-2 text-left">Namespace</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Rules</th></tr></thead>
            <tbody>
              {(summary?.roles ?? []).map((r, i) => (
                <tr key={`${r.namespace}-${r.name}-${i}`} className="border-t border-[var(--canvas-border)]"><td className="px-3 py-2">{r.namespace || "-"}</td><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.rules ?? "-"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">RoleBindings</h2>
        <div className="overflow-hidden rounded-xl border border-[var(--canvas-border)]">
          <table className="w-full text-sm">
            <thead className="bg-black/40 text-text-muted"><tr><th className="px-3 py-2 text-left">Namespace</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Role</th><th className="px-3 py-2 text-left">Subjects</th></tr></thead>
            <tbody>
              {(summary?.role_bindings ?? []).map((rb, i) => (
                <tr key={`${rb.namespace}-${rb.name}-${i}`} className="border-t border-[var(--canvas-border)]">
                  <td className="px-3 py-2">{rb.namespace || "-"}</td>
                  <td className="px-3 py-2">{rb.name}</td>
                  <td className="px-3 py-2">{rb.role_kind}:{rb.role_name}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {rb.subjects.map((s, idx) => (<Badge key={idx} variant="neutral-light" size="sm">{s.kind}:{s.name}{s.namespace ? `/${s.namespace}` : ""}</Badge>))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">ClusterRoles</h2>
        <div className="overflow-hidden rounded-xl border border-[var(--canvas-border)]">
          <table className="w-full text-sm">
            <thead className="bg-black/40 text-text-muted"><tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Rules</th></tr></thead>
            <tbody>
              {(summary?.cluster_roles ?? []).map((r, i) => (
                <tr key={`${r.name}-${i}`} className="border-t border-[var(--canvas-border)]"><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2">{r.rules ?? "-"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-text-primary">ClusterRoleBindings</h2>
        <div className="overflow-hidden rounded-xl border border-[var(--canvas-border)]">
          <table className="w-full text-sm">
            <thead className="bg-black/40 text-text-muted"><tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Role</th><th className="px-3 py-2 text-left">Subjects</th></tr></thead>
            <tbody>
              {(summary?.cluster_role_bindings ?? []).map((crb, i) => (
                <tr key={`${crb.name}-${i}`} className="border-t border-[var(--canvas-border)]">
                  <td className="px-3 py-2">{crb.name}</td>
                  <td className="px-3 py-2">{crb.role_name}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {crb.subjects.map((s, idx) => (<Badge key={idx} variant="neutral-light" size="sm">{s.kind}:{s.name}{s.namespace ? `/${s.namespace}` : ""}</Badge>))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

