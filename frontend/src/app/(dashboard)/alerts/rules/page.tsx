"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { AlertRuleModal } from "@/features/dashboard/components/alert-rule-modal";
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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingRule, setEditingRule] = useState<AlertRuleTemplateOut | null>(null);

  const createMut = useMutation({
    mutationFn: async (body: AlertRuleTemplateIn) => createAlertRule(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.alertRules });
      setModalOpen(false);
    },
  });
  const updateMut = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: AlertRuleTemplateIn }) => updateAlertRule(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.alertRules });
      setModalOpen(false);
      setEditingRule(null);
    },
  });
  const deleteMut = useMutation({
    mutationFn: async (id: number) => deleteAlertRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.alertRules }),
  });

  function onCreate() {
    setModalMode("create");
    setEditingRule(null);
    setModalOpen(true);
  }

  function onEdit(r: AlertRuleTemplateOut) {
    setModalMode("edit");
    setEditingRule(r);
    setModalOpen(true);
  }

  function onDelete(id: number) {
    if (!confirm("Delete this rule?")) return;
    deleteMut.mutate(id);
  }

  async function handleModalSubmit(data: AlertRuleTemplateIn) {
    if (modalMode === "create") {
      await createMut.mutateAsync(data);
    } else if (editingRule) {
      await updateMut.mutateAsync({ id: editingRule.id, body: data });
    }
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

      <AlertRuleModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingRule(null);
        }}
        onSubmit={handleModalSubmit}
        initialData={editingRule}
        mode={modalMode}
      />
    </div>
  );
}

