import { buildApp } from "../src/app.js";
import type { DeviceAuthenticator } from "../src/core/ports/device-authenticator.js";
import type { DevicePosition, PositionRepository } from "../src/modules/telemetry/repository.js";
import type { DevicePrincipal } from "../src/core/ports/device-authenticator.js";
import { describe, expect, it, vi } from "vitest";

const authenticator: DeviceAuthenticator = {
  async authenticate(header) {
    return header === "Device valid"
      ? { deviceId: "device-1", organizationId: "organization-1", credentialId: "credential-1", assignedBusId: "bus-1" }
      : null;
  },
};

describe("device position telemetry", () => {
  it("requires a device credential", async () => {
    const repository = { recordPosition: vi.fn() } as unknown as PositionRepository;
    const app = buildApp({ deviceAuthenticator: authenticator, positionRepository: repository });
    const response = await app.inject({ method: "POST", url: "/v1/telemetry/position", payload: {
      schemaVersion: 1, capturedAt: new Date().toISOString(), position: { latitude: 30.34, longitude: 76.39, accuracyMeters: 4 },
    } });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("records a validated GPS position", async () => {
    const recordPosition = vi.fn(async (_principal: DevicePrincipal, _position: DevicePosition, _receivedAt: Date) => "updated" as const);
    const app = buildApp({ deviceAuthenticator: authenticator, positionRepository: { recordPosition } });
    const capturedAt = new Date().toISOString();
    const response = await app.inject({
      method: "POST", url: "/v1/telemetry/position", headers: { authorization: "Device valid" },
      payload: { schemaVersion: 1, capturedAt, position: { latitude: 30.34, longitude: 76.39, accuracyMeters: 4, speedMetersPerSecond: 8.5, headingDegrees: 92 } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("updated");
    expect(recordPosition).toHaveBeenCalledOnce();
    expect(recordPosition.mock.calls[0]?.[1]).toMatchObject({ latitude: 30.34, longitude: 76.39, speedMetersPerSecond: 8.5 });
    await app.close();
  });
});
