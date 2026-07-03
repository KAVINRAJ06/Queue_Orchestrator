import { createFileRoute } from "@tanstack/react-router";
import { JobsView } from "@/components/jobs/jobs-view";

export const Route = createFileRoute("/_authenticated/jobs")({
  component: JobsView,
});
