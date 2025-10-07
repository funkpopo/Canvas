"use client";

import { useState } from "react";
import { Modal } from "@/shared/ui/modal";
import { Button } from "@/shared/ui/button";

interface CreateUserModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    username: string;
    password: string;
    display_name?: string;
    email?: string;
    tenant_slug?: string;
    roles: string[];
  }) => Promise<void>;
  availableRoles: Array<{ id: number; name: string }>;
}

const inputCls = "w-full rounded-md border border-[var(--canvas-border)] bg-[var(--canvas-surface)] px-3 py-2 text-sm text-[var(--canvas-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--canvas-primary)]";
const labelCls = "block text-sm font-medium text-[var(--canvas-text-primary)] mb-1";

export function CreateUserModal({ open, onClose, onSubmit, availableRoles }: CreateUserModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [tenantSlug, setTenantSlug] = useState("default");
  const [selectedRoles, setSelectedRoles] = useState<string[]>(["viewer"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleRole = (roleName: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleName) ? prev.filter((r) => r !== roleName) : [...prev, roleName]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required");
      return;
    }
    if (selectedRoles.length === 0) {
      setError("At least one role must be selected");
      return;
    }
    
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        username: username.trim(),
        password: password.trim(),
        display_name: displayName.trim() || undefined,
        email: email.trim() || undefined,
        tenant_slug: tenantSlug.trim() || "default",
        roles: selectedRoles,
      });
      // Reset form
      setUsername("");
      setPassword("");
      setDisplayName("");
      setEmail("");
      setTenantSlug("default");
      setSelectedRoles(["viewer"]);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setError(null);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Create New User"
      description="Add a new user to the system"
      footer={
        <div className="flex items-center justify-between">
          <div className="text-sm text-[var(--canvas-text-muted)]">
            {error && <span className="text-red-400">{error}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Creating..." : "Create User"}
            </Button>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className={labelCls}>
            Username <span className="text-red-400">*</span>
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={inputCls}
            placeholder="johndoe"
            required
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="password" className={labelCls}>
            Password <span className="text-red-400">*</span>
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            placeholder="••••••••"
            required
            autoComplete="new-password"
          />
        </div>

        <div>
          <label htmlFor="displayName" className={labelCls}>
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={inputCls}
            placeholder="John Doe"
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="email" className={labelCls}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="john@example.com"
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="tenant" className={labelCls}>
            Tenant
          </label>
          <input
            id="tenant"
            type="text"
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            className={inputCls}
            placeholder="default"
            autoComplete="off"
          />
          <p className="mt-1 text-xs text-[var(--canvas-text-muted)]">
            Leave as "default" for single-tenant setup
          </p>
        </div>

        <div>
          <label className={labelCls}>
            Roles <span className="text-red-400">*</span>
          </label>
          <div className="flex flex-wrap gap-2 mt-2">
            {availableRoles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => toggleRole(role.name)}
                className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  selectedRoles.includes(role.name)
                    ? "bg-[var(--canvas-primary)]/20 border-[var(--canvas-primary)] text-[var(--canvas-primary)]"
                    : "border-[var(--canvas-border)] text-[var(--canvas-text-muted)] hover:border-[var(--canvas-primary)]/50"
                }`}
              >
                {role.name}
              </button>
            ))}
          </div>
          {selectedRoles.length > 0 && (
            <p className="mt-2 text-xs text-[var(--canvas-text-muted)]">
              Selected: {selectedRoles.join(", ")}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
}
