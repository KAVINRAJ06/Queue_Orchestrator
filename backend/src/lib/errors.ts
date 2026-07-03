import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function notFound(message = "Resource not found") {
  return new ApiError(404, "not_found", message);
}

export function forbidden(message = "Forbidden") {
  return new ApiError(403, "forbidden", message);
}

export function unauthorized(message = "Authentication required") {
  return new ApiError(401, "unauthorized", message);
}

export async function errorHandler(error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: {
        code: "validation_failed",
        message: "Request validation failed",
        details: error.flatten(),
        requestId: request.id,
      },
    });
  }

  if (error instanceof ApiError) {
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message, details: error.details, requestId: request.id },
    });
  }

  request.log.error({ err: error }, "Unhandled request failure");
  return reply.status(500).send({
    error: { code: "internal_error", message: "Unexpected server error", requestId: request.id },
  });
}
