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

const retryOptions = [
  { label: "Exponential backoff", value: "exponential" },
  { label: "Linear backoff", value: "linear" },
  { label: "Fixed delay", value: "fixed" },
] satisfies Array<{ label: string; value: QueueRow["retryPolicy"]["strategy"] }>;

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
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[512px] gap-0 rounded-[12px] border border-[#dad8d0] bg-[#faf8f1] px-6 py-6 text-[#181713] shadow-2xl sm:max-w-[512px]">
          <DialogHeader className="mb-5">
            <DialogTitle className="text-left text-lg font-semibold leading-none tracking-normal text-[#171612]">Queue settings</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-5">
              <Field label="Priority">
                <SettingsInput type="number" value={editing.priority} onChange={(e) => setEditing({ ...editing, priority: Number(e.target.value) })} autoFocus />
              </Field>
              <Field label="Concurrency limit">
                <SettingsInput type="number" min={1} max={100} value={editing.concurrencyLimit} onChange={(e) => setEditing({ ...editing, concurrencyLimit: Number(e.target.value) })} />
              </Field>
              <div className="space-y-5">
                <Field label="Retry strategy">
                  <SettingsSelect
                    value={editing.retryPolicy.strategy}
                    onChange={(strategy) => setEditing({ ...editing, retryPolicy: { ...editing.retryPolicy, strategy: strategy as QueueRow["retryPolicy"]["strategy"] } })}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Max attempts">
                    <SettingsInput type="number" min={1} max={20} value={editing.retryPolicy.maxAttempts} onChange={(e) => setEditing({ ...editing, retryPolicy: { ...editing.retryPolicy, maxAttempts: Number(e.target.value) } })} />
                  </Field>
                  <Field label="Delay ms">
                    <SettingsInput type="number" min={0} value={editing.retryPolicy.delayMs} onChange={(e) => setEditing({ ...editing, retryPolicy: { ...editing.retryPolicy, delayMs: Number(e.target.value) } })} />
                  </Field>
                  <Field label="Cap ms">
                    <SettingsInput type="number" min={0} value={editing.retryPolicy.maxDelayMs} onChange={(e) => setEditing({ ...editing, retryPolicy: { ...editing.retryPolicy, maxDelayMs: Number(e.target.value) } })} />
                  </Field>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="mt-4 flex-row justify-end gap-2 space-x-0">
            <Button className="h-9 rounded-[10px] border border-[#e3e0d8] bg-[#fbfaf5] px-4 text-sm font-semibold text-[#111] shadow-sm hover:bg-white" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button className="h-9 rounded-[10px] bg-[#07080b] px-4 text-sm font-semibold text-white shadow-sm hover:bg-[#17181d]" onClick={() => editing && update.mutate(editing)} disabled={!editing || update.isPending}>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-semibold text-[#1d1b16]">{label}</Label>
      <div className="relative">
        {children}
      </div>
    </div>
  );
}

function SettingsSelect({ value, onChange }: { value: QueueRow["retryPolicy"]["strategy"]; onChange: (value: string) => void }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full appearance-auto rounded-[12px] border border-[#e4e1d9] bg-[#fbfaf5] px-3 text-sm text-[#171612] shadow-sm outline-none transition focus:border-[#b8c1d1] focus:ring-2 focus:ring-[#d9e2f2]"
    >
      {retryOptions.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function SettingsInput(props: React.ComponentProps<typeof Input>) {
  return (
    <Input
      {...props}
      className="h-9 rounded-[12px] border-[#e4e1d9] bg-[#fbfaf5] px-3 text-sm text-[#171612] shadow-sm outline-none ring-offset-0 placeholder:text-[#8b887f] focus-visible:border-[#b8c1d1] focus-visible:ring-2 focus-visible:ring-[#d9e2f2] focus-visible:ring-offset-0"
    />
  );
}
