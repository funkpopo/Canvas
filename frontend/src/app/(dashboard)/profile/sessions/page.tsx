"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { fetchSessions, queryKeys, revokeSession, type SessionInfoResponse } from "@/lib/api";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Button } from "@/shared/ui/button";

export default function SessionsPage() {
  return (
    <AuthGate allow={["viewer", "operator", "admin"]}>
      <SessionsInner />
    </AuthGate>
  );
}

function SessionsInner() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: queryKeys.sessions, queryFn: fetchSessions });
  const mut = useMutation({
    mutationFn: async (id: number) => revokeSession(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.sessions }),
  });
  const sessions: SessionInfoResponse[] = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Sessions" description="Active sign-in sessions (refresh tokens)" />
      <div className="overflow-hidden rounded-xl border border-[var(--canvas-border)]">
        <table className="w-full text-sm">
          <thead className="bg-black/40 text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Created</th>
              <th className="px-3 py-2 text-left">Expires</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-t border-[var(--canvas-border)]">
                <td className="px-3 py-2">{s.id}</td>
                <td className="px-3 py-2">{formatTs(s.created_at)}</td>
                <td className="px-3 py-2">{formatTs(s.expires_at)}</td>
                <td className="px-3 py-2">{s.revoked ? "revoked" : "active"}</td>
                <td className="px-3 py-2">
                  <Button size="sm" variant="outline" disabled={s.revoked || mut.isPending} onClick={() => mut.mutate(s.id)}>Revoke</Button>
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

