import type { DeviceAuthenticator } from "../src/core/ports/device-authenticator.js";
import type { EvidenceStore } from "../src/core/ports/evidence-store.js";
import type { HumanAuthenticator } from "../src/core/ports/human-authenticator.js";
import type { EvidenceRepository, EvidenceReservationRecord } from "../src/modules/evidence/repository.js";
import { buildApp } from "../src/app.js";
import { describe, expect, it } from "vitest";

const deviceAuthenticator: DeviceAuthenticator = {
  authenticate: async () => ({ organizationId: "org-1", deviceId: "device-1", credentialId: "credential-1", assignedBusId: null }),
};
const humanAuthenticator: HumanAuthenticator = { authenticate: async () => null };
const dashboardHumanAuthenticator: HumanAuthenticator = {
  authenticate: async () => ({ userId: "demo-user", organizationId: "org-1", roles: ["viewer"] }),
};

const createRepository = (): EvidenceRepository => {
  const records = new Map<string, EvidenceReservationRecord & { status: string }>();
  return {
    async reserve(input) {
      const existing = records.get(input.id);
      if (existing) return existing;
      const record = { ...input, objectKey: `${input.organizationId}/${input.deviceId}/${input.id}.jpg`, status: "reserved" };
      records.set(input.id, record);
      return record;
    },
    async getForDevice(deviceId, id) {
      const record = records.get(id);
      return record?.deviceId === deviceId ? { objectKey: record.objectKey, status: record.status } : null;
    },
    async markUploaded(deviceId, id) {
      const record = records.get(id);
      if (!record || record.deviceId !== deviceId) return false;
      record.status = "uploaded";
      return true;
    },
    async getDownload(organizationId, id) {
      const record = records.get(id);
      return record?.organizationId === organizationId && (record.status === "uploaded" || record.status === "verified")
        ? { objectKey: record.objectKey, contentType: record.contentType }
        : null;
    },
    async findExpired() { return []; },
    async markDeleted() {},
  };
};
const evidenceStore: EvidenceStore = {
  async createUploadRequest() { return { url: "https://objects.example/upload", method: "PUT", headers: { "content-type": "image/jpeg" }, expiresAt: new Date("2026-01-01T00:15:00Z") }; },
  async createDownloadRequest() { return { url: "https://objects.example/download", method: "GET", headers: {}, expiresAt: new Date("2026-01-01T00:05:00Z") }; },
  async exists() { return true; },
  async delete() {},
};

const payload = {
  items: [{ clientEvidenceId: "018f247c-7cc1-7ea9-aec2-47e1295f90df", contentType: "image/jpeg", byteSize: 100, checksumSha256: "a".repeat(64) }],
};

describe("evidence routes", () => {
  it("returns a signed private upload and completes it", async () => {
    const repository = createRepository();
    const app = buildApp({ deviceAuthenticator, humanAuthenticator, evidenceRepository: repository, evidenceStore });
    const reserved = await app.inject({ method: "POST", url: "/v1/evidence/reservations", headers: { authorization: "Device valid" }, payload });
    expect(reserved.statusCode).toBe(200);
    expect(reserved.json().items[0].upload.method).toBe("PUT");
    const completed = await app.inject({ method: "POST", url: `/v1/evidence/${payload.items[0]!.clientEvidenceId}/complete`, headers: { authorization: "Device valid" } });
    expect(completed.statusCode).toBe(204);
    await app.close();
  });

  it("returns a private download only to an authenticated organization member", async () => {
    const repository = createRepository();
    const app = buildApp({ deviceAuthenticator, humanAuthenticator: dashboardHumanAuthenticator, evidenceRepository: repository, evidenceStore });
    await app.inject({ method: "POST", url: "/v1/evidence/reservations", headers: { authorization: "Device valid" }, payload });
    await app.inject({ method: "POST", url: `/v1/evidence/${payload.items[0]!.clientEvidenceId}/complete`, headers: { authorization: "Device valid" } });
    const response = await app.inject({
      method: "GET",
      url: `/v1/evidence/${payload.items[0]!.clientEvidenceId}/download`,
      headers: { authorization: "Bearer valid" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ url: "https://objects.example/download", method: "GET" });
    await app.close();
  });

  it("fails closed when object storage is not configured", async () => {
    const app = buildApp({ deviceAuthenticator, humanAuthenticator, evidenceRepository: createRepository(), evidenceStore: null });
    const response = await app.inject({ method: "POST", url: "/v1/evidence/reservations", headers: { authorization: "Device valid" }, payload });
    expect(response.statusCode).toBe(503);
    await app.close();
  });
});
