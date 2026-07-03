import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../config/db.js";
import { ApiError, unauthorized } from "../lib/errors.js";
import { signAccessToken, signRefreshToken } from "../plugins/auth.js";

const credentials = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/signup", async (request, reply) => {
    const body = credentials.parse(request.body);
    const existing = await db("users").where({ email: body.email }).first();
    if (existing) throw new ApiError(409, "email_exists", "Email is already registered");
    const passwordHash = await argon2.hash(body.password);
    const result = await db.transaction(async (trx) => {
      const [user] = await trx("users").insert({ email: body.email, name: body.name ?? body.email, password_hash: passwordHash }).returning(["id", "email", "name"]);
      const [org] = await trx("organizations").insert({ name: `${user.name}'s organization`, owner_user_id: user.id }).returning(["id"]);
      await trx("organization_members").insert({ organization_id: org.id, user_id: user.id, role: "owner" });
      const [project] = await trx("projects").insert({ organization_id: org.id, name: "Default project" }).returning(["id"]);
      return { user, organizationId: org.id, projectId: project.id };
    });
    const auth = { userId: result.user.id, email: result.user.email };
    reply.status(201).send({
      token: signAccessToken(auth),
      refreshToken: signRefreshToken(auth),
      user: { id: result.user.id, email: result.user.email, name: result.user.name, role: "owner" },
      organizationId: result.organizationId,
      projectId: result.projectId,
    });
  });

  app.post("/login", async (request) => {
    const body = credentials.pick({ email: true, password: true }).parse(request.body);
    const user = await db("users").where({ email: body.email }).first();
    if (!user || !(await argon2.verify(user.password_hash, body.password))) throw unauthorized("Invalid email or password");
    const auth = { userId: user.id, email: user.email };
    return {
      token: signAccessToken(auth),
      refreshToken: signRefreshToken(auth),
      user: { id: user.id, email: user.email, name: user.name, role: "member" },
    };
  });

  app.get("/me", { preHandler: app.requireAuth }, async (request) => {
    const user = await db("users").where({ id: request.auth!.userId }).first("id", "email", "name");
    return { user: { ...user, role: "member" } };
  });
}
