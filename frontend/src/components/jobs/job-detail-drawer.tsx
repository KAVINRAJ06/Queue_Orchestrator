import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { STATE_STYLES } from "@/lib/job-constants";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RotateCw, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { api } from "@/lib/api";

export function JobDetailDrawer({
  jobId, onClose, queueMap,
}: { jobId: string | null; onClose: () => void; queueMap: Map<string, string> }) {
  const qc = useQueryClient();

  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    enabled: !!jobId,
    refetchInterval: 3000,
    queryFn: () => api<any>(`/jobs/${jobId}`),
  });

  const attemptsQuery = useQuery({
    queryKey: ["job-attempts", jobId],
    enabled: !!jobId,
    queryFn: () => api<any[]>(`/jobs/${jobId}/executions`),
  });

  const timelineQuery = useQuery({
    queryKey: ["job-timeline", jobId],
    enabled: !!jobId,
    queryFn: () => api<any[]>(`/jobs/${jobId}/timeline`),
  });

  const retryMutation = useMutation({
    mutationFn: () => api(`/jobs/${jobId}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Job re-queued");
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job", jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api(`/jobs/${jobId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Job cancelled");
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["job", jobId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const job = jobQuery.data;
  const canRetry = job && ["failed", "dead", "cancelled"].includes(job.state);
  const canCancel = job && ["queued", "scheduled", "claimed", "running"].includes(job.state);

  return (
    <Sheet open={!!jobId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0">
        {!job ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : (
          <>
            <SheetHeader className="p-6 pb-4 border-b">
              <div className="flex items-center gap-3">
                <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium", STATE_STYLES[job.state])}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  {job.state}
                </span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{job.type}</span>
              </div>
              <SheetTitle className="text-2xl font-semibold text-left">{job.name}</SheetTitle>
              <div className="text-xs text-muted-foreground font-mono">{job.id}</div>

              <div className="flex gap-2 pt-2">
                {canRetry && (
                  <Button size="sm" className="rounded-full" onClick={() => retryMutation.mutate()} disabled={retryMutation.isPending}>
                    <RotateCw className="h-3.5 w-3.5 mr-1.5" /> Re-queue
                  </Button>
                )}
                {canCancel && (
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                    <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
                  </Button>
                )}
              </div>
            </SheetHeader>

            <div className="p-6 space-y-6">
              <Section title="Metadata">
                <MetaGrid data={{
                  Queue: queueMap.get(job.queue_id) ?? "—",
                  Priority: job.priority,
                  Worker: job.worker_id ? job.worker_id.slice(0, 8) : "unassigned",
                  Attempts: `${job.attempts} / ${job.max_attempts}`,
                  Created: fmt(job.created_at),
                  Started: fmt(job.started_at),
                  Finished: fmt(job.finished_at),
                  Scheduled: fmt(job.scheduled_for),
                }} />
              </Section>

              {job.error && (
                <Section title="Error">
                  <pre className="text-xs bg-status-red/40 text-status-red-fg rounded-xl p-3 whitespace-pre-wrap font-mono">
                    {job.error}
                  </pre>
                </Section>
              )}

              <Section title="Payload">
                <pre className="text-xs bg-muted rounded-xl p-3 overflow-x-auto font-mono">
                  {JSON.stringify(job.payload, null, 2)}
                </pre>
              </Section>

              <Section title="Retry history">
                {(attemptsQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No retry history yet.</p>
                ) : (
                  <ol className="space-y-2">
                    {attemptsQuery.data!.map((a) => (
                      <li key={a.id} className="flex items-start gap-3 text-sm border-l-2 border-border pl-3">
                        <span className="text-xs text-muted-foreground tabular-nums w-8">#{a.attempt_number}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs", STATE_STYLES[a.state])}>{a.state}</span>
                            <span className="text-xs text-muted-foreground">{fmt(a.started_at)}</span>
                          </div>
                          {a.error && <div className="text-xs text-status-red-fg mt-1 font-mono">{a.error}</div>}
                          {a.next_retry_at && <div className="text-xs text-muted-foreground mt-1">Next: {fmt(a.next_retry_at)}</div>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>

              <Section title="Lifecycle timeline">
                {(timelineQuery.data ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lifecycle events yet.</p>
                ) : (
                  <ol className="space-y-2">
                    {timelineQuery.data!.map((event) => (
                      <li key={event.id} className="flex items-start gap-3 text-sm border-l-2 border-border pl-3">
                        <span className="text-xs text-muted-foreground tabular-nums w-24">{fmt(event.created_at)}</span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {event.from_state && <span className="text-xs text-muted-foreground">{event.from_state}</span>}
                            <span className={cn("inline-flex px-2 py-0.5 rounded-full text-xs", STATE_STYLES[event.to_state])}>{event.to_state}</span>
                          </div>
                          {event.reason && <div className="text-xs text-muted-foreground mt-1">{event.reason}</div>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Section>

              <Section title="Logs">
                <pre className="text-xs bg-sidebar text-sidebar-foreground rounded-xl p-3 overflow-x-auto font-mono max-h-72 overflow-y-auto whitespace-pre-wrap">
                  {job.logs || "No logs yet."}
                </pre>
              </Section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">{title}</h3>
      {children}
    </div>
  );
}

function MetaGrid({ data }: { data: Record<string, string> }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-2 py-1 border-b border-border/60">
          <span className="text-muted-foreground">{k}</span>
          <span className="truncate font-mono text-xs">{v}</span>
        </div>
      ))}
    </div>
  );
}

function fmt(ts: string | null) {
  if (!ts) return "—";
  return format(new Date(ts), "MMM d, HH:mm:ss");
}
