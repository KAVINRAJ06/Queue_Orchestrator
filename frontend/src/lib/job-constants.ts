export type JobState = "queued" | "scheduled" | "claimed" | "running" | "completed" | "failed" | "cancelled" | "dead";
export type JobType = "immediate" | "delayed" | "scheduled" | "cron" | "batch";
export type Priority = "low" | "normal" | "high" | "critical";

export const JOB_STATES: JobState[] = [
  "queued", "scheduled", "claimed", "running", "completed", "failed", "cancelled", "dead",
];
export const JOB_TYPES: JobType[] = ["immediate", "delayed", "scheduled", "cron", "batch"];

export const STATE_STYLES: Record<JobState, string> = {
  queued: "bg-status-gray text-status-gray-fg",
  scheduled: "bg-status-blue text-status-blue-fg",
  claimed: "bg-status-blue text-status-blue-fg",
  running: "bg-status-yellow text-status-yellow-fg",
  completed: "bg-status-green text-status-green-fg",
  failed: "bg-status-red text-status-red-fg",
  cancelled: "bg-status-gray text-status-gray-fg",
  dead: "bg-status-red text-status-red-fg",
};
