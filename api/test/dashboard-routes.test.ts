import type { HumanAuthenticator } from "../src/core/ports/human-authenticator.js";
import type { DashboardRepository } from "../src/modules/dashboard/repository.js";
import { buildApp } from "../src/app.js";
import { describe, expect, it } from "vitest";

const authenticator: HumanAuthenticator = {
  async authenticate(header) {
    return header === "Bearer valid"
      ? { userId: "user-1", organizationId: "organization-1", roles: ["viewer"] }
      : null;
  },
};

const repository = {
  async listIssues() {
    return [{
      id: "issue-1",
      issueType: "pothole",
      status: "confirmed",
      severity: "high",
      latitude: 12.9716,
      longitude: 77.5946,
      firstSeenAt: new Date("2026-01-01T00:00:00Z"),
      lastSeenAt: new Date("2026-01-02T00:00:00Z"),
      observationCount: 2,
      independentDeviceCount: 2,
      version: 2,
    }];
  },
  async listRecentObservations() {
    return [{
      id: "observation-1",
      className: "pothole",
      confidence: 0.94,
      latitude: 12.9716,
      longitude: 77.5946,
      accuracyMeters: 3.5,
      capturedAt: new Date("2026-01-02T00:00:00Z"),
      receivedAt: new Date("2026-01-02T00:00:01Z"),
      deviceId: "device-1",
      busId: null,
      cameraId: "front",
      boundingBox: { left: 0.1, top: 0.2, right: 0.4, bottom: 0.6 },
      evidenceIds: ["018f247c-7cc1-7ea9-aec2-47e1295f90df"],
    }];
  },
} as unknown as DashboardRepository;

describe("dashboard routes", () => {
  it("requires human authentication", async () => {
    const app = buildApp({ humanAuthenticator: authenticator, dashboardRepository: repository });
    const response = await app.inject({ method: "GET", url: "/v1/issues?bbox=77,12,78,13" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns evidence and bounding boxes with recent observations", async () => {
    const app = buildApp({ humanAuthenticator: authenticator, dashboardRepository: repository });
    const response = await app.inject({
      method: "GET",
      url: "/v1/observations/recent",
      headers: { authorization: "Bearer valid" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items[0]).toMatchObject({
      boundingBox: { left: 0.1, top: 0.2, right: 0.4, bottom: 0.6 },
      evidenceIds: ["018f247c-7cc1-7ea9-aec2-47e1295f90df"],
    });
    await app.close();
  });

  it("returns organization-scoped issue map data", async () => {
    const app = buildApp({ humanAuthenticator: authenticator, dashboardRepository: repository });
    const response = await app.inject({
      method: "GET",
      url: "/v1/issues?bbox=77,12,78,13",
      headers: { authorization: "Bearer valid" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items).toHaveLength(1);
    expect(response.json().items[0].issueType).toBe("pothole");
    await app.close();
  });
});
