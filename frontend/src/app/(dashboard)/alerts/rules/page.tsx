"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Button } from "@/shared/ui/button";
import { fetchAlertRules, createAlertRule, updateAlertRule, deleteAlertRule, type AlertRuleTemplateOut, type AlertRuleTemplateIn, queryKeys } from "@/lib/api";

export default function AlertRulesPage() {
  return (
    <AuthGate allow={["operator", "admin"]}>
      <RulesInner />
    </AuthGate>
  );
}

function RulesInner() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: queryKeys.alertRules, queryFn: fetchAlertRules });
  const rules = data ?? [];
  const [editing, setEditing] = useState<AlertRuleTemplateOut | null>(null);

  const createMut = useMutation({
    mutationFn: async (body: AlertRuleTemplateIn) => createAlertRule(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.alertRules }),
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: AlertRuleTemplateIn }) => updateAlertRule(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.alertRules }),
  });
  const deleteMut = useMutation({
    mutationFn: async (id: number) => deleteAlertRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.alertRules }),
  });

  function onCreate() {
    const name = prompt("Rule name")?.trim();
    if (!name) return;
    const severity = prompt("Severity (info|warning|critical)")?.trim() || "warning";
    const expr = prompt("PromQL expression")?.trim();
    if (!expr) return;
    createMut.mutate({ name, severity, expr, summary: name, description: "", labels: {}, annotations: {}, enabled: true });
  }

  function onEdit(r: AlertRuleTemplateOut) {
    setEditing(r);
    const name = prompt("Rule name", r.name)?.trim();
    if (!name) return setEditing(null);
    const severity = prompt("Severity (info|warning|critical)", r.severity)?.trim() || r.severity;
    const expr = prompt("PromQL expression", r.expr)?.trim();
    if (!expr) return setEditing(null);
    updateMut.mutate({ id: r.id, body: { name, severity, expr, summary: r.summary, description: r.description, labels: r.labels || {}, annotations: r.annotations || {}, enabled: r.enabled } });
    setEditing(null);
  }

  function onDelete(id: number) {
    if (!confirm("Delete this rule?")) return;
    deleteMut.mutate(id);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Alert Rules" description="Custom alert rule templates (stored in DB)" actions={<Button onClick={onCreate}>New Rule</Button>} />
      <div className="overflow-hidden rounded-xl border border-[var(--canvas-border)]">
        <table className="w-full text-sm">
          <thead className="bg-black/40 text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Severity</th>
              <th className="px-3 py-2 text-left">Expr</th>
              <th className="px-3 py-2 text-left">Enabled</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} className="border-t border-[var(--canvas-border)]">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">{r.severity}</td>
                <td className="px-3 py-2">
                  <div className="max-w-xl overflow-hidden text-ellipsis whitespace-nowrap" title={r.expr}>{r.expr}</div>
                </td>
                <td className="px-3 py-2">{r.enabled ? "yes" : "no"}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => onEdit(r)} disabled={updateMut.isPending}>Edit</Button>
                    <Button size="sm" variant="outline" onClick={() => onDelete(r.id)} disabled={deleteMut.isPending}>Delete</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

