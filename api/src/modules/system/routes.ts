import type { FastifyPluginAsync } from "fastify";

const statusSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["ok"] },
  },
} as const;

const unavailableSchema = {
  type: "object",
  additionalProperties: false,
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["unavailable"] },
  },
} as const;

export interface SystemRoutesOptions {
  readinessCheck?: () => Promise<boolean>;
}

export const systemRoutes: FastifyPluginAsync<SystemRoutesOptions> = async (app, options) => {
  app.get(
    "/healthz",
    {
      schema: {
        tags: ["system"],
        response: { 200: statusSchema },
      },
    },
    async () => ({ status: "ok" as const }),
  );

  app.get(
    "/readyz",
    {
      schema: {
        tags: ["system"],
        response: { 200: statusSchema, 503: unavailableSchema },
      },
    },
    async (_request, reply) => {
      const ready = options.readinessCheck ? await options.readinessCheck().catch(() => false) : true;
      if (!ready) return reply.code(503).send({ status: "unavailable" });
      return { status: "ok" as const };
    },
  );
};
