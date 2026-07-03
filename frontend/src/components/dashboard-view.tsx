import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock, Play } from "lucide-react";
import { useCurrentProject } from "@/hooks/use-current-project";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";

export function DashboardView() {
  const { current } = useCurrentProject();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["metrics", current?.id],
    enabled: !!current,
    refetchInterval: 5000,
    queryFn: () => api<any>(`/metrics?projectId=${current!.id}`),
  });
  const enqueueDemo = useMutation({
    mutationFn: () => api(`/projects/${current!.id}/demo-jobs`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Demo jobs enqueued and queues resumed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cards = [
    { label: "Queued", value: data?.health?.queued ?? 0, icon: Clock },
    { label: "Running", value: data?.health?.running ?? 0, icon: Activity },
    { label: "Completed / hour", value: data?.throughputLastHour ?? 0, icon: CheckCircle2 },
    { label: "Dead letters", value: data?.health?.dead ?? 0, icon: AlertTriangle },
  ];

  return (
    <div className="max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight mb-2">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Live system health for {current?.name ?? "your project"}.</p>
        </div>
        <Button className="rounded-full" disabled={!current || enqueueDemo.isPending} onClick={() => enqueueDemo.mutate()}>
          <Play className="h-4 w-4 mr-1" />
          {enqueueDemo.isPending ? "Starting..." : "Run demo jobs"}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border bg-card p-5">
            <Icon className="h-5 w-5 text-muted-foreground mb-4" />
            <div className="text-3xl font-semibold tabular-nums">{value}</div>
            <div className="text-sm text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-medium mb-3">System health</h2>
        <div className="grid gap-3 md:grid-cols-3 text-sm">
          <Metric label="Queues" value={data?.queues ?? 0} />
          <Metric label="Workers online" value={`${data?.onlineWorkers ?? 0} / ${data?.workers ?? 0}`} />
          <Metric label="Average duration" value={`${data?.avgDurationMs ?? 0}ms`} />
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-muted p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
