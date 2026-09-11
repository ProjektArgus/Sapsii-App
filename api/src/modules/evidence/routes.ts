import { Type } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import type { DeviceAuthenticator } from "../../core/ports/device-authenticator.js";
import type { EvidenceStore } from "../../core/ports/evidence-store.js";
import type { HumanAuthenticator } from "../../core/ports/human-authenticator.js";
import type { EvidenceRepository } from "./repository.js";

const ErrorSchema = Type.Object({ code: Type.String(), message: Type.String(), requestId: Type.String() });

export interface EvidenceRoutesOptions {
  deviceAuthenticator: DeviceAuthenticator;
  humanAuthenticator: HumanAuthenticator;
  repository: EvidenceRepository;
  evidenceStore: EvidenceStore | null;
}

export const evidenceRoutes: FastifyPluginAsync<EvidenceRoutesOptions> = async (app, options) => {
  app.post<{
    Body: { items: Array<{ clientEvidenceId: string; contentType: "image/jpeg"; byteSize: number; checksumSha256: string }> };
  }>(
    "/v1/evidence/reservations",
    {
      schema: {
        tags: ["evidence"],
        body: Type.Object({
          items: Type.Array(
            Type.Object({
              clientEvidenceId: Type.String({ format: "uuid" }),
              contentType: Type.Literal("image/jpeg"),
              byteSize: Type.Integer({ minimum: 1, maximum: 10 * 1024 * 1024 }),
              checksumSha256: Type.String({ pattern: "^[a-f0-9]{64}$" }),
            }),
            { minItems: 1, maxItems: 20 },
          ),
        }),
        response: {
          200: Type.Object({
            items: Type.Array(Type.Object({
              clientEvidenceId: Type.String(),
              upload: Type.Object({
                url: Type.String(),
                method: Type.Literal("PUT"),
                headers: Type.Record(Type.String(), Type.String()),
                expiresAt: Type.String(),
              }),
            })),
          }),
          401: ErrorSchema,
          409: ErrorSchema,
          413: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const authorization = request.headers.authorization;
      const principal = authorization ? await options.deviceAuthenticator.authenticate(authorization) : null;
      if (!principal) return reply.code(401).send({ code: "INVALID_DEVICE_CREDENTIAL", message: "A valid device credential is required", requestId: request.id });
      if (!options.evidenceStore) return reply.code(503).send({ code: "EVIDENCE_STORAGE_UNAVAILABLE", message: "Evidence storage is not configured", requestId: request.id });
      if (request.body.items.reduce((sum, item) => sum + item.byteSize, 0) > 20 * 1024 * 1024) {
        return reply.code(413).send({ code: "EVIDENCE_BATCH_TOO_LARGE", message: "Combined evidence exceeds 20 MiB", requestId: request.id });
      }

      const expiresAt = new Date(Date.now() + 15 * 60 * 1_000);
      const result = [];
      for (const item of request.body.items) {
        const reservation = await options.repository.reserve({
          id: item.clientEvidenceId,
          organizationId: principal.organizationId,
          deviceId: principal.deviceId,
          contentType: item.contentType,
          byteSize: item.byteSize,
          checksumSha256: item.checksumSha256,
          expiresAt,
        });
        if (!reservation) {
          return reply.code(409).send({ code: "EVIDENCE_ID_REUSED", message: "Evidence ID was reused with different content", requestId: request.id });
        }
        const upload = await options.evidenceStore.createUploadRequest({
          objectKey: reservation.objectKey,
          contentType: reservation.contentType,
          maximumBytes: reservation.byteSize,
          checksumSha256: reservation.checksumSha256,
          expiresInSeconds: 15 * 60,
        });
        result.push({
          clientEvidenceId: reservation.id,
          upload: { ...upload, expiresAt: upload.expiresAt.toISOString() },
        });
      }
      return { items: result };
    },
  );

  app.post<{ Params: { evidenceId: string } }>(
    "/v1/evidence/:evidenceId/complete",
    {
      schema: {
        tags: ["evidence"],
        params: Type.Object({ evidenceId: Type.String({ format: "uuid" }) }),
        response: { 204: Type.Null(), 401: ErrorSchema, 404: ErrorSchema, 409: ErrorSchema, 503: ErrorSchema },
      },
    },
    async (request, reply) => {
      const authorization = request.headers.authorization;
      const principal = authorization ? await options.deviceAuthenticator.authenticate(authorization) : null;
      if (!principal) return reply.code(401).send({ code: "INVALID_DEVICE_CREDENTIAL", message: "A valid device credential is required", requestId: request.id });
      if (!options.evidenceStore) return reply.code(503).send({ code: "EVIDENCE_STORAGE_UNAVAILABLE", message: "Evidence storage is not configured", requestId: request.id });
      const evidence = await options.repository.getForDevice(principal.deviceId, request.params.evidenceId);
      if (!evidence) return reply.code(404).send({ code: "NOT_FOUND", message: "Evidence reservation not found", requestId: request.id });
      if (evidence.status === "uploaded" || evidence.status === "linked") return reply.code(204).send();
      if (evidence.status !== "reserved" || !(await options.evidenceStore.exists(evidence.objectKey))) {
        return reply.code(409).send({ code: "UPLOAD_INCOMPLETE", message: "Evidence object has not been uploaded", requestId: request.id });
      }
      await options.repository.markUploaded(principal.deviceId, request.params.evidenceId, new Date());
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { evidenceId: string } }>(
    "/v1/evidence/:evidenceId/download",
    {
      schema: {
        tags: ["evidence"],
        params: Type.Object({ evidenceId: Type.String({ format: "uuid" }) }),
        response: {
          200: Type.Object({ url: Type.String(), method: Type.Literal("GET"), headers: Type.Record(Type.String(), Type.String()), expiresAt: Type.String() }),
          401: ErrorSchema,
          404: ErrorSchema,
          503: ErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const authorization = request.headers.authorization;
      const requestedOrganization = request.headers["x-organization-id"];
      const principal = authorization
        ? await options.humanAuthenticator.authenticate(
            authorization,
            typeof requestedOrganization === "string" ? requestedOrganization : undefined,
          )
        : null;
      if (!principal) return reply.code(401).send({ code: "UNAUTHORIZED", message: "Human authentication required", requestId: request.id });
      if (!options.evidenceStore) return reply.code(503).send({ code: "EVIDENCE_STORAGE_UNAVAILABLE", message: "Evidence storage is not configured", requestId: request.id });
      const evidence = await options.repository.getDownload(principal.organizationId, request.params.evidenceId);
      if (!evidence) return reply.code(404).send({ code: "NOT_FOUND", message: "Evidence not found", requestId: request.id });
      const signed = await options.evidenceStore.createDownloadRequest(evidence.objectKey, 5 * 60);
      return { ...signed, expiresAt: signed.expiresAt.toISOString() };
    },
  );
};
