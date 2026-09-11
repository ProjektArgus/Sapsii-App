import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import type { DeviceAuthenticator } from "../src/core/ports/device-authenticator.js";
import type { IngestionRepository } from "../src/modules/ingestion/service.js";

const authenticator: DeviceAuthenticator = {
  authenticate: async () => ({
    organizationId: "organization-1",
    deviceId: "device-1",
    credentialId: "credential-1",
    assignedBusId: null,
  }),
};
const repository: IngestionRepository = {
  findUsableEvidenceIds: async () => new Set(),
  ingest: async () => { throw new Error("ingest should not be reached"); },
};
const apps: ReturnType<typeof buildApp>[] = [];

afterEach(async () => Promise.all(apps.splice(0).map(async (app) => app.close())));

describe("ingestion route", () => {
  it("requires the batch id as idempotency key", async () => {
    const app = buildApp({ deviceAuthenticator: authenticator, ingestionRepository: repository });
    apps.push(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/ingestion/batches",
      headers: { authorization: "Device ignored", "idempotency-key": "different" },
      payload: {
        schemaVersion: 1,
        batchId: "batch-1",
        software: { name: "edge", version: "1" },
        observations: [{}],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("INVALID_IDEMPOTENCY_KEY");
  });
});
