import { useQuery } from "@tanstack/react-query";
import { Cpu } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";

export function WorkersView() {
  const { data = [] } = useQuery({
    queryKey: ["workers"],
    refetchInterval: 5000,
    queryFn: () => api<any[]>("/workers"),
  });
  return (
    <div className="max-w-5xl">
      <h1 className="text-4xl font-semibold tracking-tight mb-2">Workers</h1>
      <p className="text-sm text-muted-foreground mb-6">Heartbeat, capacity, and execution counters for active worker processes.</p>
      <div className="grid gap-3">
        {data.map((w) => (
          <div key={w.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4">
            <Cpu className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{w.id}</div>
              <div className="text-xs text-muted-foreground">{w.hostname} · heartbeat {formatDistanceToNow(new Date(w.lastHeartbeatAt), { addSuffix: true })}</div>
            </div>
            <span className="rounded-full bg-status-green px-3 py-1 text-xs text-status-green-fg">{w.state}</span>
            <div className="text-sm tabular-nums">{w.runningJobs} / {w.concurrency} running</div>
            <div className="text-sm text-muted-foreground">{w.metrics.completed} done · {w.metrics.failed} failed</div>
          </div>
        ))}
        {data.length === 0 && <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">No worker heartbeats yet.</div>}
      </div>
    </div>
  );
}
