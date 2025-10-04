"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { fetchRoles, fetchUsers, queryKeys, updateUser, type RoleInfoResponse, type UserInfoResponse } from "@/lib/api";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";

export default function UsersPage() {
  return (
    <AuthGate allow={["admin"]}>
      <UsersInner />
    </AuthGate>
  );
}

function UsersInner() {
  const qc = useQueryClient();
  const { data: users } = useQuery({ queryKey: queryKeys.users, queryFn: fetchUsers });
  const { data: roles } = useQuery({ queryKey: queryKeys.roles, queryFn: fetchRoles });
  const [editing, setEditing] = useState<Record<number, { is_active: boolean; roles: string[] }>>({});

  useEffect(() => {
    if (!users) return;
    const init: Record<number, { is_active: boolean; roles: string[] }> = {};
    for (const u of users) init[u.id] = { is_active: (u as any).is_active ?? true, roles: [...(u.roles ?? [])] };
    setEditing(init);
  }, [users]);

  const mut = useMutation({
    mutationFn: async (u: { id: number; is_active: boolean; roles: string[] }) => updateUser(u.id, { is_active: u.is_active, roles: u.roles }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.users }),
  });

  function toggleRole(uid: number, role: string) {
    setEditing((prev) => {
      const curr = prev[uid] || { is_active: true, roles: [] };
      const roles = curr.roles.includes(role) ? curr.roles.filter((r) => r !== role) : [...curr.roles, role];
      return { ...prev, [uid]: { ...curr, roles } };
    });
  }

  function setActive(uid: number, active: boolean) {
    setEditing((prev) => ({ ...prev, [uid]: { ...(prev[uid] || { roles: [] }), is_active: active } }));
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Users" description="Manage user roles and access" />
      <div className="overflow-hidden rounded-xl border border-[var(--canvas-border)]">
        <table className="w-full text-sm">
          <thead className="bg-black/40 text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">User</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Roles</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => {
              const state = editing[u.id] || { is_active: true, roles: u.roles ?? [] };
              return (
                <tr key={u.id} className="border-t border-[var(--canvas-border)]">
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium text-text-primary">{u.username}</span>
                      <span className="text-xs text-text-muted">{u.display_name || ""}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">{u.email || ""}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-2">
                      {(roles ?? []).map((r) => (
                        <button key={r.id} onClick={() => toggleRole(u.id, r.name)} className={`rounded-md border px-2 py-1 text-xs ${state.roles.includes(r.name) ? "bg-[var(--canvas-primary)]/20 border-[var(--canvas-primary)]" : "border-[var(--canvas-border)]"}`}>
                          {r.name}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => setActive(u.id, !state.is_active)} className={`rounded-md border px-2 py-1 text-xs ${state.is_active ? "border-green-500 text-green-400" : "border-[var(--canvas-border)] text-text-muted"}`}>
                      {state.is_active ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="outline" onClick={() => mut.mutate({ id: u.id, is_active: state.is_active, roles: state.roles })} disabled={mut.isPending}>Save</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}


