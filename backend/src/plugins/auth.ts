import fp from "fastify-plugin";
import jwt, { type Secret } from "jsonwebtoken";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { unauthorized } from "../lib/errors.js";
import type { AuthContext } from "../types.js";

export function signAccessToken(payload: AuthContext) {
  return jwt.sign(payload, env.jwtSecret as Secret, {
    expiresIn: env.accessTokenTtl as any,
    issuer: env.jwtIssuer,
    subject: payload.userId,
  });
}

export function signRefreshToken(payload: AuthContext) {
  return jwt.sign({ ...payload, typ: "refresh" }, env.jwtSecret as Secret, {
    expiresIn: env.refreshTokenTtl as any,
    issuer: env.jwtIssuer,
    subject: payload.userId,
  });
}

export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorate("requireAuth", async (request: FastifyRequest, _reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthorized();
    try {
      const decoded = jwt.verify(header.slice("Bearer ".length), env.jwtSecret, { issuer: env.jwtIssuer }) as AuthContext;
      request.auth = { userId: decoded.userId, email: decoded.email };
    } catch {
      throw unauthorized("Invalid or expired token");
    }
  });
});

declare module "fastify" {
  interface FastifyInstance {
    requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
