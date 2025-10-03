"use client";

import { PropsWithChildren, useMemo, useEffect } from "react";
import { useAuth } from "@/features/auth/hooks/use-auth";

export type Role = "viewer" | "operator" | "admin";

export function AuthGate({ allow = ["viewer"], children }: PropsWithChildren<{ allow?: Role[] }>) {
  const { me, loading } = useAuth();
  const authorized = useMemo(() => {
    if (!me) return false;
    if (!me.roles || me.roles.length === 0) return false;
    return allow.some((role) => me.roles.includes(role));
  }, [me, allow]);

  useEffect(() => {
    if (!loading && !me && typeof window !== "undefined") {
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
  }, [loading, me]);

  if (loading) {
    return null;
  }

  if (!authorized) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-black/40">
        <div className="rounded-xl border border-[var(--canvas-border)] bg-black/60 px-8 py-6 text-center">
          <p className="text-sm text-[color:var(--canvas-muted)]">
            Your account does not have access to this area yet. Update role assignments in the administrative console.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
