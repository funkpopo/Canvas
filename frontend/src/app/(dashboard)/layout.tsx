import type { ReactNode } from "react";
import { AuthGate } from "@/features/auth/components/auth-gate";
import { DashboardShell } from "@/features/dashboard/layouts/dashboard-shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate allow={["viewer", "operator"]}>
      <DashboardShell>{children}</DashboardShell>
    </AuthGate>
  );
}



