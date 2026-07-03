import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../config/db.js";

const projectSchema = z.object({
  organizationId: z.string().uuid().optional(),
  name: z.string().min(2),
});

export async function projectRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: app.requireAuth }, async (request) => {
    const rows = await db("projects")
      .join("organization_members", "organization_members.organization_id", "projects.organization_id")
      .where("organization_members.user_id", request.auth!.userId)
      .whereNull("projects.deleted_at")
      .select("projects.id", "projects.organization_id", "projects.name", "projects.created_at")
      .orderBy("projects.created_at", "asc");
    return rows.map((p) => ({ id: p.id, organization_id: p.organization_id, name: p.name, created_at: p.created_at }));
  });

  app.post("/", { preHandler: app.requireAuth }, async (request, reply) => {
    const body = projectSchema.parse(request.body);
    const membership = await db("organization_members").where({ user_id: request.auth!.userId }).modify((qb) => {
      if (body.organizationId) qb.where({ organization_id: body.organizationId });
    }).first();
    if (!membership) return reply.status(403).send({ error: { code: "forbidden", message: "No access to organization" } });
    const [project] = await db("projects").insert({ organization_id: membership.organization_id, name: body.name }).returning(["id", "organization_id", "name"]);
    reply.status(201).send({ id: project.id, organization_id: project.organization_id, name: project.name });
  });
}
