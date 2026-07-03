import { useQuery } from "@tanstack/react-query";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCurrentProject } from "@/hooks/use-current-project";
import { api } from "@/lib/api";

export function MetricsView() {
  const { current } = useCurrentProject();
  const { data } = useQuery({
    queryKey: ["metrics", current?.id],
    enabled: !!current,
    refetchInterval: 5000,
    queryFn: () => api<any>(`/metrics?projectId=${current!.id}`),
  });
  const states = data?.states ?? {};
  const throughput = data?.throughput ?? [];

  return (
    <div className="max-w-6xl">
      <h1 className="text-4xl font-semibold tracking-tight mb-2">Metrics</h1>
      <p className="text-sm text-muted-foreground mb-6">Throughput, duration, worker load, and lifecycle distribution.</p>

      <div className="grid gap-4 md:grid-cols-4 mb-4">
        <Metric label="Throughput / hour" value={data?.throughputLastHour ?? 0} />
        <Metric label="Success rate" value={`${data?.successRate ?? 100}%`} />
        <Metric label="Average duration" value={`${data?.avgDurationMs ?? 0}ms`} />
        <Metric label="Workers online" value={`${data?.onlineWorkers ?? 0} / ${data?.workers ?? 0}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-medium mb-4">Completed jobs over time</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={throughput}>
                <XAxis dataKey="minute" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="completed" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-medium mb-4">Average duration over time</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={throughput}>
                <XAxis dataKey="minute" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="avgDurationMs" stroke="var(--status-blue-fg)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-2xl border bg-card p-5">
        <h2 className="font-medium mb-4">Job lifecycle</h2>
        <div className="space-y-3">
          {["queued", "scheduled", "claimed", "running", "completed", "failed", "dead", "cancelled"].map((state) => {
            const value = states[state] ?? 0;
            const max = Math.max(1, ...Object.values(states).map(Number));
            return (
              <div key={state} className="grid grid-cols-[110px_1fr_50px] items-center gap-3 text-sm">
                <div className="capitalize text-muted-foreground">{state}</div>
                <div className="h-3 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${(value / max) * 100}%` }} />
                </div>
                <div className="text-right tabular-nums">{value}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
