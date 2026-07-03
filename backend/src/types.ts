import type { FastifyRequest } from "fastify";

export type OrgRole = "owner" | "admin" | "member";
export type JobState = "queued" | "scheduled" | "claimed" | "running" | "completed" | "failed" | "retrying" | "dead";
export type RetryStrategy = "fixed" | "linear" | "exponential";

export type AuthContext = {
  userId: string;
  email: string;
};

export type AuthedRequest = FastifyRequest & {
  auth: AuthContext;
};

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
