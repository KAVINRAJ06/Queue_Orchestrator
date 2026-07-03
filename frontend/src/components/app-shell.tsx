import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, ListChecks, Layers, Cpu, LineChart, LogOut, Settings } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { ProjectSwitcher } from "./project-switcher";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { setToken } from "@/lib/api";

const nav = [
  { to: "/jobs", label: "Jobs", icon: ListChecks },
  { to: "/queues", label: "Queues", icon: Layers },
  { to: "/workers", label: "Workers", icon: Cpu },
  { to: "/metrics", label: "Metrics", icon: LineChart },
];

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const signOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    setToken(null);
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="min-h-screen w-full flex bg-background">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col p-5 m-3 rounded-3xl sticky top-3 h-[calc(100vh-1.5rem)]">
        <div className="mb-8 px-2 text-2xl font-bold text-sidebar-primary tracking-tight">
          scheduler<span className="text-status-yellow">.</span>
        </div>

        <div className="px-1 mb-6">
          <ProjectSwitcher />
        </div>

        <div className="px-2 text-[11px] font-medium uppercase tracking-wider text-sidebar-foreground/50 mb-2">
          General
        </div>
        <nav className="space-y-1 flex-1">
          <SidebarLink to="/dashboard" icon={LayoutDashboard} label="Dashboard" active={path.startsWith("/dashboard")} />
          {nav.map((n) => (
            <SidebarLink key={n.to} to={n.to} icon={n.icon} label={n.label} active={path.startsWith(n.to)} disabled={n.disabled} />
          ))}
        </nav>

        <div className="mt-4 space-y-1">
          <SidebarLink to="/settings" icon={Settings} label="Settings" active={false} disabled />
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 p-6 pl-3">{children}</main>
    </div>
  );
}

function SidebarLink({
  to, icon: Icon, label, active, disabled,
}: { to: string; icon: React.ComponentType<{ className?: string }>; label: string; active: boolean; disabled?: boolean }) {
  const cls = cn(
    "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition",
    active
      ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    disabled && "opacity-40 pointer-events-none",
  );
  if (disabled) {
    return (
      <div className={cls} aria-disabled>
        <Icon className="h-4 w-4" />
        {label}
        <span className="ml-auto text-[10px] text-sidebar-foreground/50">soon</span>
      </div>
    );
  }
  return (
    <Link to={to} className={cls}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
