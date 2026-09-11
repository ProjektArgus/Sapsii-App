import type { DeviceAuthenticator } from "../../core/ports/device-authenticator.js";
import type { FastifyPluginAsync } from "fastify";
import {
  ApiErrorSchema,
  IngestionBatchEnvelopeSchema,
  IngestionResultSchema,
  type IngestionBatchEnvelope,
} from "./contracts.js";
import { BatchIdReusedError, IngestionService, InvalidTripError } from "./service.js";

export interface IngestionRoutesOptions {
  deviceAuthenticator: DeviceAuthenticator;
  service: IngestionService;
}

export const ingestionRoutes: FastifyPluginAsync<IngestionRoutesOptions> = async (app, options) => {
  app.post<{ Body: IngestionBatchEnvelope }>(
    "/v1/ingestion/batches",
    {
      bodyLimit: 1024 * 1024,
      attachValidation: true,
      schema: {
        tags: ["ingestion"],
        body: IngestionBatchEnvelopeSchema,
        response: {
          200: IngestionResultSchema,
          400: ApiErrorSchema,
          401: ApiErrorSchema,
          409: ApiErrorSchema,
          503: ApiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      if (request.validationError) {
        const onlyObservationErrors = request.validationError.validation?.every((error: { instancePath?: string }) =>
          /^\/observations\/\d+(?:\/|$)/.test(error.instancePath ?? ""),
        );
        if (!onlyObservationErrors) {
          return reply.code(400).send({
            code: "INVALID_ENVELOPE",
            message: request.validationError.message,
            requestId: request.id,
          });
        }
      }

      const authorization = request.headers.authorization;
      const principal = authorization ? await options.deviceAuthenticator.authenticate(authorization) : null;
      if (!principal) {
        return reply.code(401).send({
          code: "INVALID_DEVICE_CREDENTIAL",
          message: "A valid device credential is required",
          requestId: request.id,
        });
      }

      const idempotencyKey = request.headers["idempotency-key"];
      if (idempotencyKey !== request.body.batchId) {
        return reply.code(400).send({
          code: "INVALID_IDEMPOTENCY_KEY",
          message: "Idempotency-Key must equal batchId",
          requestId: request.id,
        });
      }

      try {
        return await options.service.ingest(principal, request.body);
      } catch (error) {
        if (error instanceof BatchIdReusedError) {
          return reply.code(409).send({ code: "BATCH_ID_REUSED", message: error.message, requestId: request.id });
        }
        if (error instanceof InvalidTripError) {
          return reply.code(400).send({ code: "INVALID_TRIP", message: error.message, requestId: request.id });
        }
        request.log.error({ err: error }, "ingestion failed");
        return reply.code(503).send({
          code: "INGESTION_UNAVAILABLE",
          message: "No observations were committed; retry the complete batch",
          requestId: request.id,
        });
      }
    },
  );
};
