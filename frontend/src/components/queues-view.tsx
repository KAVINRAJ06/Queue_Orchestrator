import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, Plus, Settings } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCurrentProject } from "@/hooks/use-current-project";
import { api } from "@/lib/api";

type QueueRow = {
  id: string;
  name: string;
  priority: number;
  concurrencyLimit: number;
  paused: boolean;
  retryPolicy: {
    strategy: "fixed" | "linear" | "exponential";
    maxAttempts: number;
    delayMs: number;
    multiplier: number;
    maxDelayMs: number;
  };
  stats: {
    waiting: number;
    active: number;
    failed: number;
    dead: number;
    completed: number;
    avgDurationMs: number;
  };
};

const priorityOptions = [
  { label: "Low", value: -10 },
  { label: "Normal", value: 0 },
  { label: "High", value: 50 },
  { label: "Critical", value: 100 },
];

const retryOptions = [
  { label: "Exponential backoff", value: "exponential" },
  { label: "Linear backoff", value: "linear" },
  { label: "Fixed delay", value: "fixed" },
] satisfies Array<{ label: string; value: QueueRow["retryPolicy"]["strategy"] }>;

function priorityLabel(value: number) {
  if (value >= 100) return "Critical";
  if (value >= 50) return "High";
  if (value < 0) return "Low";
  return "Normal";
}

export function QueuesView() {
  const { current } = useCurrentProject();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<QueueRow | null>(null);

  const { data = [] } = useQuery({
    queryKey: ["queues", current?.id],
    enabled: !!current,
    refetchInterval: 5000,
    queryFn: () => api<QueueRow[]>(`/queues?projectId=${current!.id}`),
  });

  const create = useMutation({
    mutationFn: () => api("/queues", {
      method: "POST",
      body: JSON.stringify({ projectId: current!.id, name, concurrencyLimit: 4, priority: 0 }),
    }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["queues"] });
      toast.success("Queue created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = useMutation({
    mutationFn: ({ id, paused }: { id: string; paused: boolean }) => api(`/queues/${id}/${paused ? "resume" : "pause"}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["queues"] });
      toast.success("Queue state updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (q: QueueRow) => api(`/queues/${q.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        priority: q.priority,
        concurrencyLimit: q.concurrencyLimit,
        retryPolicy: {
          strategy: q.retryPolicy.strategy,
          maxAttempts: q.retryPolicy.maxAttempts,
          delayMs: q.retryPolicy.delayMs,
          multiplier: q.retryPolicy.multiplier,
          maxDelayMs: q.retryPolicy.maxDelayMs,
        },
      }),
    }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["queues"] });
      toast.success("Queue settings saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-6xl">
      <h1 className="text-4xl font-semibold tracking-tight mb-2">Queues</h1>
      <p className="text-sm text-muted-foreground mb-6">Configure priority, concurrency, retry policy, and pause/resume state.</p>
      <div className="mb-4 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="new queue name" className="max-w-sm rounded-full" />
        <Button className="rounded-full" onClick={() => name.trim() && create.mutate()} disabled={!current || create.isPending}>
          <Plus className="h-4 w-4 mr-1" /> Add queue
        </Button>
      </div>
      <div className="grid gap-3">
        {data.map((q) => (
          <div key={q.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4">
            <div className="flex-1">
              <div className="font-medium">{q.name}</div>
              <div className="text-xs text-muted-foreground">priority {q.priority} / concurrency {q.concurrencyLimit} / retry {q.retryPolicy.strategy}</div>
            </div>
            <QueueStat label="Waiting" value={q.stats.waiting} />
            <QueueStat label="Active" value={q.stats.active} />
            <QueueStat label="Failed" value={q.stats.failed + q.stats.dead} />
            <QueueStat label="Done" value={q.stats.completed} />
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setEditing(q)}>
              <Settings className="h-4 w-4 mr-1" /> Settings
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => toggle.mutate({ id: q.id, paused: q.paused })}>
              {q.paused ? <Play className="h-4 w-4 mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
              {q.paused ? "Resume" : "Pause"}
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-[380px] gap-0 rounded-[14px] border-[#434340] bg-[#2d2d2a] px-6 py-7 text-[#f8f7f2] shadow-2xl sm:max-w-[380px]">
          <DialogHeader className="mb-5">
            <DialogTitle className="text-left text-[26px] font-extrabold leading-none tracking-normal text-white">Queue settings</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-4">
              <Field label="Priority" hint="Higher priority queues are polled first.">
                <NativeSelect
                  value={priorityLabel(editing.priority)}
                  onChange={(value) => {
                    const option = priorityOptions.find((item) => item.label === value);
                    setEditing({ ...editing, priority: option?.value ?? 0 });
                  }}
                >
                  {priorityOptions.map((option) => (
                    <option key={option.label} value={option.label}>{option.label}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Concurrency limit" hint="Max jobs running at once, 1 to 100.">
                <SettingsInput type="number" min={1} max={100} value={editing.concurrencyLimit} onChange={(e) => setEditing({ ...editing, concurrencyLimit: Number(e.target.value) })} />
              </Field>
              <div className="rounded-[12px] bg-[#191917] p-4">
                <Field label="Retry strategy" compact>
                  <NativeSelect
                    value={editing.retryPolicy.strategy}
                    onChange={(strategy) => setEditing({ ...editing, retryPolicy: { ...editing.retryPolicy, strategy: strategy as QueueRow["retryPolicy"]["strategy"] } })}
                  >
                    {retryOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </NativeSelect>
                </Field>
                <div className="mt-4 grid grid-cols-3 gap-2.5">
                  <Field label="Max attempts" compact>
                    <SettingsInput type="number" min={1} max={20} value={editing.retryPolicy.maxAttempts} onChange={(e) => setEditing({ ...editing, retryPolicy: { ...editing.retryPolicy, maxAttempts: Number(e.target.value) } })} />
                  </Field>
                  <Field label="Delay" compact suffix="ms">
                    <SettingsInput type="number" min={0} value={editing.retryPolicy.delayMs} onChange={(e) => setEditing({ ...editing, retryPolicy: { ...editing.retryPolicy, delayMs: Number(e.target.value) } })} />
                  </Field>
                  <Field label="Cap" compact suffix="ms">
                    <SettingsInput type="number" min={0} value={editing.retryPolicy.maxDelayMs} onChange={(e) => setEditing({ ...editing, retryPolicy: { ...editing.retryPolicy, maxDelayMs: Number(e.target.value) } })} />
                  </Field>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="mt-5 flex-row justify-end gap-2 space-x-0">
            <Button className="h-10 rounded-[9px] border border-[#575753] bg-transparent px-5 text-sm font-semibold text-white hover:bg-[#383834]" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button className="h-10 rounded-[9px] bg-[#f8f8f6] px-5 text-sm font-semibold text-[#111] hover:bg-white" onClick={() => editing && update.mutate(editing)} disabled={!editing || update.isPending}>
              {update.isPending ? "Saving..." : "Save settings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QueueStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="w-20 text-center">
      <div className="font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Field({ label, hint, suffix, compact = false, children }: { label: string; hint?: string; suffix?: string; compact?: boolean; children: React.ReactNode }) {
  return (
    <div className={compact ? "space-y-1.5" : "space-y-2"}>
      <Label className={compact ? "text-xs font-semibold text-[#c8c5bd]" : "text-sm font-semibold text-[#c8c5bd]"}>{label}</Label>
      <div className="relative">
        {children}
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-[#a19e98]">{suffix}</span>}
      </div>
      {hint && <p className="text-xs font-medium leading-none text-[#8f8c86]">{hint}</p>}
    </div>
  );
}

function NativeSelect({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full appearance-auto rounded-[7px] border border-[#484844] bg-[#2d2d2a] px-3 text-sm font-bold text-white outline-none transition focus:border-[#1f6feb] focus:ring-1 focus:ring-[#1f6feb]"
    >
      {children}
    </select>
  );
}

function SettingsInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className="h-9 rounded-[7px] border-[#484844] bg-[#2d2d2a] px-3 text-base font-semibold text-white outline-none ring-offset-0 placeholder:text-[#8f8c86] focus-visible:ring-1 focus-visible:ring-[#1f6feb] focus-visible:ring-offset-0"
    />
  );
}
