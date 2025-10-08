"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { CreateUserModal } from "@/features/auth/components/create-user-modal";
import { fetchRoles, fetchUsers, queryKeys, updateUser, createUser, adminSetUserPassword, type RoleInfoResponse, type UserInfoResponse } from "@/lib/api";
import { PageHeader } from "@/features/dashboard/layouts/page-header";
import { Button } from "@/shared/ui/button";
import { Badge } from "@/shared/ui/badge";
import { Modal } from "@/shared/ui/modal";

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
  const [createModalOpen, setCreateModalOpen] = useState(false);
  
  // Reset password state
  const [resetPasswordUser, setResetPasswordUser] = useState<UserInfoResponse | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

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

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.users });
      setCreateModalOpen(false);
    },
  });

  const passwordMut = useMutation({
    mutationFn: async ({ userId, password }: { userId: number; password: string }) =>
      adminSetUserPassword(userId, { new_password: password }),
    onSuccess: () => {
      setPasswordSuccess(true);
      setTimeout(() => {
        setResetPasswordUser(null);
        setNewPassword("");
        setConfirmPassword("");
        setPasswordError(null);
        setPasswordSuccess(false);
      }, 2000);
    },
    onError: (error: any) => {
      setPasswordError(error.message || "Failed to reset password");
    },
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

  function handleResetPassword() {
    if (!resetPasswordUser) return;

    setPasswordError(null);
    setPasswordSuccess(false);

    if (!newPassword || !confirmPassword) {
      setPasswordError("Both password fields are required");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    passwordMut.mutate({ userId: resetPasswordUser.id, password: newPassword });
  }

  function openResetPasswordModal(user: UserInfoResponse) {
    setResetPasswordUser(user);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setPasswordSuccess(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader 
        title="Users" 
        description="Manage user roles and access"
        actions={
          <Button onClick={() => setCreateModalOpen(true)}>Create User</Button>
        }
      />
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
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => mut.mutate({ id: u.id, is_active: state.is_active, roles: state.roles })} disabled={mut.isPending}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => openResetPasswordModal(u)}>Reset Password</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CreateUserModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSubmit={async (data) => createMut.mutateAsync(data)}
        availableRoles={roles ?? []}
      />

      {/* Reset Password Modal */}
      <Modal
        open={!!resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
        title={`Reset Password for ${resetPasswordUser?.username}`}
      >
        <div className="space-y-4 p-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted">New Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 8 characters)"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-text-muted">Confirm Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
            />
          </div>

          {passwordError && (
            <div className="rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-500">
              {passwordError}
            </div>
          )}

          {passwordSuccess && (
            <div className="rounded-md bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-500">
              Password reset successfully!
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setResetPasswordUser(null)}>Cancel</Button>
            <Button onClick={handleResetPassword} disabled={passwordMut.isPending}>
              {passwordMut.isPending ? "Resetting..." : "Reset Password"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}


