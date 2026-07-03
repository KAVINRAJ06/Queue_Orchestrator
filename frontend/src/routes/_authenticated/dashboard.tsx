import { createFileRoute } from "@tanstack/react-router";
import { DashboardView } from "@/components/dashboard-view";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardView,
});
