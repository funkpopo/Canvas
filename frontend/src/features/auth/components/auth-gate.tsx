"use client";

import { PropsWithChildren, useMemo } from "react";

const mockUser = {
  name: "Operator",
  roles: ["viewer", "operator"],
};

export type Role = "viewer" | "operator" | "admin";

export function AuthGate({
  allow = ["viewer"],
  children,
}: PropsWithChildren<{ allow?: Role[] }>) {
  const authorized = useMemo(
    () => allow.some((role) => mockUser.roles.includes(role)),
    [allow],
  );

  if (!authorized) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-black/40">
        <div className="rounded-xl border border-[var(--canvas-border)] bg-black/60 px-8 py-6 text-center">
          <p className="text-sm text-[color:var(--canvas-muted)]">
            Your account does not have access to this area yet. Update role
            assignments in the administrative console.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
