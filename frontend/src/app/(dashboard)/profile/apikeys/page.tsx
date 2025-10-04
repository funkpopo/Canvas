"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { createApiKey, fetchApiKeys, queryKeys, revokeApiKey, type ApiKeyInfoResponse } from "@/lib/api";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";

export default function ApiKeysPage() {
  return (
    <AuthGate allow={["viewer", "operator", "admin"]}>
      <ApiKeysInner />
    </AuthGate>
  );
}

function ApiKeysInner() {
  const qc = useQueryClient();
  const { data: keys } = useQuery({ queryKey: queryKeys.apiKeys(), queryFn: () => fetchApiKeys() });
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const createMut = useMutation({
    mutationFn: async (p: { name: string; days?: number }) => createApiKey(p.name, [], p.days),
    onSuccess: (res) => {
      setNewKey(res.key);
      qc.invalidateQueries({ queryKey: queryKeys.apiKeys() });
    },
  });

  const revokeMut = useMutation({
    mutationFn: async (id: number) => revokeApiKey(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.apiKeys() }),
  });

  function onCreate() {
    const name = prompt("API key name")?.trim();
    if (!name) return;
    const daysStr = prompt("Expires in days (optional)")?.trim();
    const days = daysStr ? Number(daysStr) : undefined;
    setCreating(true);
    createMut.mutate({ name, days });
    setCreating(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="API Keys" description="Personal API keys for CLI and automation" actions={<Button onClick={onCreate} disabled={creating}>New API Key</Button>} />
      {newKey ? (
        <div className="rounded-xl border border-[var(--canvas-border)] bg-black/50 p-3 text-sm">
          <p className="text-text-primary">Copy and store your new API key now. You won't see it again:</p>
          <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-2 text-[12px]">{newKey}</pre>
        </div>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-[var(--canvas-border)]">
        <table className="w-full text-sm">
          <thead className="bg-black/40 text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-left">Last used</th>
              <th className="px-3 py-2 text-left">Expires</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(keys ?? []).map((k) => (
              <tr key={k.id} className="border-t border-[var(--canvas-border)]">
                <td className="px-3 py-2">{k.name}</td>
                <td className="px-3 py-2">{formatTs(k.created_at)}</td>
                <td className="px-3 py-2">{formatTs(k.last_used_at)}</td>
                <td className="px-3 py-2">{formatTs(k.expires_at)}</td>
                <td className="px-3 py-2">{k.is_active ? <Badge variant="success-light" size="sm">active</Badge> : <Badge variant="neutral-light" size="sm">revoked</Badge>}</td>
                <td className="px-3 py-2">
                  <Button size="sm" variant="outline" disabled={!k.is_active || revokeMut.isPending} onClick={() => revokeMut.mutate(k.id)}>Revoke</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatTs(ts?: string | null) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleString(); } catch { return ts; }
}

