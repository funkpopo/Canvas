import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth/auth-gate";
import { DashboardShell } from "@/components/layout/dashboard-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate allow={["viewer", "operator"]}>
      <DashboardShell>{children}</DashboardShell>
    </AuthGate>
  );
}
