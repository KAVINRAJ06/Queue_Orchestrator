import { createFileRoute } from "@tanstack/react-router";
import { QueuesView } from "@/components/queues-view";

export const Route = createFileRoute("/_authenticated/queues")({
  component: QueuesView,
});
