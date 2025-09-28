import { Sidebar } from "@/features/dashboard/layouts/sidebar";
import { TopBar } from "@/features/dashboard/layouts/top-bar";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-background text-text-primary transition-colors duration-300">
      <Sidebar />
      <main className="relative flex-1 overflow-auto">
        <TopBar />
        <div className="relative min-h-[calc(100vh-4rem)] p-6">
          {children}
        </div>
      </main>
    </div>
  );
}


