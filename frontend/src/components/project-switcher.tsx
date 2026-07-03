import { useCurrentProject } from "@/hooks/use-current-project";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, Sparkles } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

export function ProjectSwitcher() {
  const { projects, current, setCurrent, isLoading } = useCurrentProject();
  const [open, setOpen] = useState(false);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [name, setName] = useState("");
  const qc = useQueryClient();

  const createProject = useMutation({
    mutationFn: (n: string) => api<{ id: string; name: string }>("/projects", { method: "POST", body: JSON.stringify({ name: n }) }),
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setCurrent(p.id);
      setDlgOpen(false);
      setName("");
      toast.success("Project created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const seedDemo = useMutation({
    mutationFn: () => api<{ id: string }>("/projects/seed-demo", { method: "POST", body: JSON.stringify({ name: "Demo Project" }) }),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
      setCurrent(id);
      toast.success("Demo project ready with sample jobs");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-sidebar-accent text-sidebar-accent-foreground text-sm hover:bg-sidebar-accent/80 transition">
            <div className="min-w-0 text-left">
              <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50">Project</div>
              <div className="truncate font-medium">
                {isLoading ? "Loading…" : current?.name ?? "No project"}
              </div>
            </div>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-1">
          {projects.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">No projects yet.</div>
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => { setCurrent(p.id); setOpen(false); }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-accent text-left",
                current?.id === p.id && "bg-accent",
              )}
            >
              <Check className={cn("h-4 w-4", current?.id === p.id ? "opacity-100" : "opacity-0")} />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          <div className="my-1 h-px bg-border" />
          <button
            onClick={() => { setOpen(false); setDlgOpen(true); }}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-accent text-left"
          >
            <Plus className="h-4 w-4" /> New project
          </button>
          <button
            onClick={() => { setOpen(false); seedDemo.mutate(); }}
            disabled={seedDemo.isPending}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-accent text-left"
          >
            <Sparkles className="h-4 w-4" />
            {seedDemo.isPending ? "Seeding…" : "Create demo project"}
          </button>
        </PopoverContent>
      </Popover>

      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create project</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="pname">Name</Label>
            <Input id="pname" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" placeholder="Payments pipeline" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgOpen(false)}>Cancel</Button>
            <Button onClick={() => name.trim() && createProject.mutate(name.trim())} disabled={createProject.isPending}>
              {createProject.isPending ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
