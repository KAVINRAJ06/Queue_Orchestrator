import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const KEY = "scheduler.currentProjectId";

export type Project = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api<Project[]>("/projects"),
  });
}

export function useCurrentProject() {
  const { data: projects, isLoading } = useProjects();
  const [currentId, setCurrentId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(KEY);
  });

  useEffect(() => {
    if (!projects || projects.length === 0) return;
    if (!currentId || !projects.find((p) => p.id === currentId)) {
      const next = projects[0].id;
      setCurrentId(next);
      localStorage.setItem(KEY, next);
    }
  }, [projects, currentId]);

  const setCurrent = (id: string) => {
    setCurrentId(id);
    localStorage.setItem(KEY, id);
  };

  return {
    projects: projects ?? [],
    currentId,
    current: projects?.find((p) => p.id === currentId) ?? null,
    setCurrent,
    isLoading,
  };
}
