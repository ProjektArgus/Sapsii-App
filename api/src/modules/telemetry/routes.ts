import { Type, type Static } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import type { DeviceAuthenticator } from "../../core/ports/device-authenticator.js";
import type { PositionRepository } from "./repository.js";

const PositionSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    capturedAt: Type.String({ format: "date-time" }),
    position: Type.Object(
      {
        latitude: Type.Number({ minimum: -90, maximum: 90 }),
        longitude: Type.Number({ minimum: -180, maximum: 180 }),
        accuracyMeters: Type.Number({ minimum: 0, maximum: 10_000 }),
        speedMetersPerSecond: Type.Optional(Type.Number({ minimum: 0, maximum: 150 })),
        headingDegrees: Type.Optional(Type.Number({ minimum: 0, exclusiveMaximum: 360 })),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
type PositionBody = Static<typeof PositionSchema>;

const ErrorSchema = Type.Object({ code: Type.String(), message: Type.String(), requestId: Type.String() });

export interface TelemetryRoutesOptions {
  deviceAuthenticator: DeviceAuthenticator;
  repository: PositionRepository;
}

export const telemetryRoutes: FastifyPluginAsync<TelemetryRoutesOptions> = async (app, options) => {
  app.post<{ Body: PositionBody }>(
    "/v1/telemetry/position",
    {
      schema: {
        tags: ["telemetry"],
        body: PositionSchema,
        response: {
          200: Type.Object({ status: Type.Union([Type.Literal("updated"), Type.Literal("stale")]), receivedAt: Type.String() }),
          400: ErrorSchema,
          401: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const principal = request.headers.authorization
        ? await options.deviceAuthenticator.authenticate(request.headers.authorization)
        : null;
      if (!principal) {
        return reply.code(401).send({ code: "INVALID_DEVICE_CREDENTIAL", message: "A valid device credential is required", requestId: request.id });
      }
      const capturedAt = new Date(request.body.capturedAt);
      const now = new Date();
      if (capturedAt < new Date("2020-01-01T00:00:00Z") || capturedAt > new Date(now.getTime() + 10 * 60_000)) {
        return reply.code(400).send({ code: "INVALID_CAPTURED_AT", message: "capturedAt is outside the accepted window", requestId: request.id });
      }
      const status = await options.repository.recordPosition(
        principal,
        {
          capturedAt,
          latitude: request.body.position.latitude,
          longitude: request.body.position.longitude,
          accuracyMeters: request.body.position.accuracyMeters,
          ...(request.body.position.speedMetersPerSecond === undefined ? {} : { speedMetersPerSecond: request.body.position.speedMetersPerSecond }),
          ...(request.body.position.headingDegrees === undefined ? {} : { headingDegrees: request.body.position.headingDegrees }),
        },
        now,
      );
      return { status, receivedAt: now.toISOString() };
    },
  );
};
