import { useCurrentProject } from "@/hooks/use-current-project";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Search, RefreshCw, Inbox, Plus, RotateCw } from "lucide-react";
import { JOB_STATES, JOB_TYPES, STATE_STYLES, type JobState, type JobType } from "@/lib/job-constants";
import { cn } from "@/lib/utils";
import { JobDetailDrawer } from "./job-detail-drawer";
import { formatDistanceToNow } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { toast } from "sonner";

const PAGE_SIZE = 20;

type JobRow = {
  id: string;
  name: string;
  type: JobType;
  state: JobState;
  priority: string;
  queue_id: string;
  worker_id: string | null;
  attempts: number;
  max_attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  scheduled_for: string | null;
};

type QueueOption = { id: string; name: string };
type DeadLetterRow = { id: string; job_id: string; queue_id: string; reason: string; created_at: string };

export function JobsView() {
  const { current, projects, isLoading } = useCurrentProject();
  const qc = useQueryClient();
  const [state, setState] = useState<JobState | "all">("all");
  const [type, setType] = useState<JobType | "all">("all");
  const [queueId, setQueueId] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [jobForm, setJobForm] = useState({
    name: "Manual job",
    type: "immediate" as JobType,
    queueId: "",
    priority: 0,
    delayMs: 0,
    payload: "{\n  \"ms\": 1200\n}",
  });

  const queuesQuery = useQuery({
    queryKey: ["queues", current?.id],
    enabled: !!current,
    queryFn: () => api<QueueOption[]>(`/queues?projectId=${current!.id}`),
  });

  const jobsQuery = useQuery({
    queryKey: ["jobs", current?.id, state, type, queueId, search, page],
    enabled: !!current,
    refetchInterval: 5000,
    queryFn: () => {
      const params = new URLSearchParams({
        projectId: current!.id,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (state !== "all") params.set("state", state);
      if (type !== "all") params.set("type", type);
      if (queueId !== "all") params.set("queueId", queueId);
      if (search.trim()) params.set("search", search.trim());
      return api<{ rows: JobRow[]; total: number }>(`/jobs?${params}`);
    },
  });

  const dlqQuery = useQuery({
    queryKey: ["dead-letter", current?.id],
    enabled: !!current,
    refetchInterval: 5000,
    queryFn: () => api<DeadLetterRow[]>(`/jobs/dead-letter?projectId=${current!.id}`),
  });

  const queueMap = useMemo(
    () => new Map((queuesQuery.data ?? []).map((q) => [q.id, q.name])),
    [queuesQuery.data],
  );

  const createJob = useMutation({
    mutationFn: () => {
      const queue = jobForm.queueId || queuesQuery.data?.[0]?.id;
      if (!queue || !current) throw new Error("Select a project and queue first");
      let payload = {};
      try {
        payload = JSON.parse(jobForm.payload || "{}");
      } catch {
        throw new Error("Payload must be valid JSON");
      }
      return api("/jobs", {
        method: "POST",
        body: JSON.stringify({
          projectId: current.id,
          queueId: queue,
          name: jobForm.name,
          type: jobForm.type,
          priority: Number(jobForm.priority),
          payload,
          delayMs: jobForm.type === "delayed" ? Number(jobForm.delayMs) : undefined,
        }),
      });
    },
    onSuccess: () => {
      setCreateOpen(false);
      qc.invalidateQueries();
      toast.success("Job created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const requeueDlq = useMutation({
    mutationFn: (jobId: string) => api(`/jobs/dead-letter/${jobId}/requeue`, {
      method: "POST",
      body: JSON.stringify({ resetAttempts: true }),
    }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success("Dead-letter job requeued");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isLoading && projects.length === 0) {
    return <EmptyProjects />;
  }

  const total = jobsQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="max-w-[1600px]">
      <header className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Jobs</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {current ? current.name : "-"} / {total} total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button className="rounded-full" disabled={!current || (queuesQuery.data ?? []).length === 0} onClick={() => {
            setJobForm((form) => ({ ...form, queueId: form.queueId || queuesQuery.data?.[0]?.id || "" }));
            setCreateOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-1" /> New job
          </Button>
          <Button variant="outline" size="icon" className="rounded-full" onClick={() => jobsQuery.refetch()}>
            <RefreshCw className={cn("h-4 w-4", jobsQuery.isFetching && "animate-spin")} />
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 mb-4 p-3 rounded-2xl bg-card border">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search job id or name..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="pl-9 rounded-full h-10" />
        </div>
        <FilterSelect value={state} onChange={(v) => { setState(v as JobState | "all"); setPage(0); }} placeholder="All states" options={[{ value: "all", label: "All states" }, ...JOB_STATES.map((s) => ({ value: s, label: s }))]} />
        <FilterSelect value={type} onChange={(v) => { setType(v as JobType | "all"); setPage(0); }} placeholder="All types" options={[{ value: "all", label: "All types" }, ...JOB_TYPES.map((s) => ({ value: s, label: s }))]} />
        <FilterSelect value={queueId} onChange={(v) => { setQueueId(v); setPage(0); }} placeholder="All queues" options={[{ value: "all", label: "All queues" }, ...(queuesQuery.data ?? []).map((q) => ({ value: q.id, label: q.name }))]} />
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="grid grid-cols-[minmax(200px,2fr)_100px_120px_140px_120px_140px_120px] gap-3 px-4 py-3 text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/50 border-b">
          <div>Job</div>
          <div>Type</div>
          <div>Queue</div>
          <div>State</div>
          <div>Attempts</div>
          <div>Created</div>
          <div>Duration</div>
        </div>
        {jobsQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : jobsQuery.data?.rows.length === 0 ? (
          <div className="p-16 text-center">
            <Inbox className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No jobs match your filters.</p>
          </div>
        ) : (
          jobsQuery.data?.rows.map((row) => (
            <button key={row.id} onClick={() => setSelectedJob(row.id)} className="w-full grid grid-cols-[minmax(200px,2fr)_100px_120px_140px_120px_140px_120px] gap-3 px-4 py-3 text-sm border-b last:border-b-0 hover:bg-muted/40 text-left transition">
              <div className="min-w-0">
                <div className="font-medium truncate">{row.name}</div>
                <div className="text-xs text-muted-foreground truncate font-mono">{row.id.slice(0, 8)}</div>
              </div>
              <div className="text-muted-foreground">{row.type}</div>
              <div className="truncate">{queueMap.get(row.queue_id) ?? "-"}</div>
              <div>
                <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium", STATE_STYLES[row.state])}>
                  <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />
                  {row.state}
                </span>
              </div>
              <div className="text-muted-foreground tabular-nums">{row.attempts} / {row.max_attempts}</div>
              <div className="text-muted-foreground">{formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}</div>
              <div className="text-muted-foreground tabular-nums">{formatDuration(row.started_at, row.finished_at)}</div>
            </button>
          ))
        )}
      </div>

      <div className="flex items-center justify-between mt-4 text-sm">
        <div className="text-muted-foreground">Page {page + 1} of {totalPages}</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-full" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
          <Button variant="outline" size="sm" className="rounded-full" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>

      <section className="mt-6 rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h2 className="font-medium">Dead Letter Queue</h2>
          <span className="text-xs text-muted-foreground">{dlqQuery.data?.length ?? 0} permanent failures</span>
        </div>
        {(dlqQuery.data ?? []).length === 0 ? (
          <div className="text-sm text-muted-foreground">No dead-letter jobs for this project.</div>
        ) : (
          <div className="grid gap-2">
            {dlqQuery.data!.map((row) => (
              <div key={row.id} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                <button className="font-mono text-xs underline" onClick={() => setSelectedJob(row.job_id)}>{row.job_id.slice(0, 8)}</button>
                <div className="flex-1 truncate">{row.reason}</div>
                <div className="text-xs text-muted-foreground">{queueMap.get(row.queue_id) ?? "unknown queue"}</div>
                <Button size="sm" variant="outline" className="rounded-full" onClick={() => requeueDlq.mutate(row.job_id)} disabled={requeueDlq.isPending}>
                  <RotateCw className="h-3.5 w-3.5 mr-1" /> Retry
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create job</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <Field label="Name">
              <Input value={jobForm.name} onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })} />
            </Field>
            <Field label="Queue">
              <Select value={jobForm.queueId} onValueChange={(queue) => setJobForm({ ...jobForm, queueId: queue })}>
                <SelectTrigger><SelectValue placeholder="Select queue" /></SelectTrigger>
                <SelectContent>
                  {(queuesQuery.data ?? []).map((q) => <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Type">
                <Select value={jobForm.type} onValueChange={(nextType: JobType) => setJobForm({ ...jobForm, type: nextType })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediate">Immediate</SelectItem>
                    <SelectItem value="delayed">Delayed</SelectItem>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority">
                <Input type="number" value={jobForm.priority} onChange={(e) => setJobForm({ ...jobForm, priority: Number(e.target.value) })} />
              </Field>
              <Field label="Delay ms">
                <Input type="number" min={0} disabled={jobForm.type !== "delayed"} value={jobForm.delayMs} onChange={(e) => setJobForm({ ...jobForm, delayMs: Number(e.target.value) })} />
              </Field>
            </div>
            <Field label="Payload JSON">
              <Textarea className="font-mono min-h-32" value={jobForm.payload} onChange={(e) => setJobForm({ ...jobForm, payload: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createJob.mutate()} disabled={createJob.isPending}>{createJob.isPending ? "Creating..." : "Create job"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <JobDetailDrawer jobId={selectedJob} onClose={() => setSelectedJob(null)} queueMap={queueMap} />
    </div>
  );
}

function FilterSelect({
  value, onChange, placeholder, options,
}: {
  value: string; onChange: (v: string) => void; placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-[160px] h-10 rounded-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function formatDuration(started: string | null, finished: string | null) {
  if (!started) return "-";
  const start = new Date(started).getTime();
  const end = finished ? new Date(finished).getTime() : Date.now();
  const ms = Math.max(0, end - start);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function EmptyProjects() {
  return (
    <div className="max-w-lg mx-auto mt-24 text-center">
      <h2 className="text-2xl font-semibold">No projects yet</h2>
      <p className="text-muted-foreground mt-2">
        Create your first project from the sidebar to start scheduling jobs. Or seed a demo project to explore the dashboard.
      </p>
    </div>
  );
}
