import { buildApp } from "../src/app.js";
import type { DeviceAuthenticator } from "../src/core/ports/device-authenticator.js";
import type { DevicePosition, PositionRepository } from "../src/modules/telemetry/repository.js";
import type { DevicePrincipal } from "../src/core/ports/device-authenticator.js";
import { describe, expect, it, vi } from "vitest";

const heartbeat = () => vi.fn(async (_principal: DevicePrincipal, _instanceExternalId: string | null, _receivedAt: Date) => undefined);

const authenticator: DeviceAuthenticator = {
  async authenticate(header) {
    return header === "Device valid"
      ? { deviceId: "device-1", organizationId: "organization-1", credentialId: "credential-1", assignedBusId: "bus-1" }
      : null;
  },
};

describe("device position telemetry", () => {
  it("requires a device credential", async () => {
    const repository = { recordPosition: vi.fn(), recordHeartbeat: heartbeat() } as unknown as PositionRepository;
    const app = buildApp({ deviceAuthenticator: authenticator, positionRepository: repository });
    const response = await app.inject({ method: "POST", url: "/v1/telemetry/position", payload: {
      schemaVersion: 1, capturedAt: new Date().toISOString(), position: { latitude: 30.34, longitude: 76.39, accuracyMeters: 4 },
    } });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("records a validated GPS position", async () => {
    const recordPosition = vi.fn(async (_principal: DevicePrincipal, _instanceExternalId: string | null, _position: DevicePosition, _receivedAt: Date) => "updated" as const);
    const app = buildApp({ deviceAuthenticator: authenticator, positionRepository: { recordPosition, recordHeartbeat: heartbeat() } });
    const capturedAt = new Date().toISOString();
    const response = await app.inject({
      method: "POST", url: "/v1/telemetry/position", headers: { authorization: "Device valid" },
      payload: { schemaVersion: 1, instanceId: "Galaxy-S24-ABC123", capturedAt, position: { latitude: 30.34, longitude: 76.39, accuracyMeters: 4, speedMetersPerSecond: 8.5, headingDegrees: 92 } },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("updated");
    expect(recordPosition).toHaveBeenCalledOnce();
    expect(recordPosition.mock.calls[0]?.[1]).toBe("Galaxy-S24-ABC123");
    expect(recordPosition.mock.calls[0]?.[2]).toMatchObject({ latitude: 30.34, longitude: 76.39, speedMetersPerSecond: 8.5 });
    await app.close();
  });

  it("accepts a fix whose accuracy is unknown", async () => {
    const recordPosition = vi.fn(async (_principal: DevicePrincipal, _instanceExternalId: string | null, _position: DevicePosition, _receivedAt: Date) => "updated" as const);
    const app = buildApp({ deviceAuthenticator: authenticator, positionRepository: { recordPosition, recordHeartbeat: heartbeat() } });
    const response = await app.inject({
      method: "POST", url: "/v1/telemetry/position", headers: { authorization: "Device valid" },
      payload: { schemaVersion: 1, capturedAt: new Date().toISOString(), position: { latitude: 30.34, longitude: 76.39 } },
    });
    expect(response.statusCode).toBe(200);
    expect(recordPosition.mock.calls[0]?.[2]).not.toHaveProperty("accuracyMeters");
    await app.close();
  });

  it("keeps a running but idle unit visible through a heartbeat", async () => {
    const recordHeartbeat = heartbeat();
    const app = buildApp({
      deviceAuthenticator: authenticator,
      positionRepository: { recordPosition: vi.fn(), recordHeartbeat },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/devices/heartbeat",
      headers: { authorization: "Device valid" },
      payload: { schemaVersion: 1, instanceId: "Galaxy-S24-ABC123" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("ok");
    expect(recordHeartbeat).toHaveBeenCalledOnce();
    expect(recordHeartbeat.mock.calls[0]?.[0]).toMatchObject({ deviceId: "device-1", organizationId: "organization-1" });
    expect(recordHeartbeat.mock.calls[0]?.[1]).toBe("Galaxy-S24-ABC123");
    await app.close();
  });

  it("rejects a heartbeat from a deactivated unit", async () => {
    const recordHeartbeat = heartbeat();
    const app = buildApp({
      deviceAuthenticator: authenticator,
      positionRepository: { recordPosition: vi.fn(), recordHeartbeat },
    });
    const response = await app.inject({ method: "POST", url: "/v1/devices/heartbeat", payload: {} });
    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("INVALID_DEVICE_CREDENTIAL");
    expect(recordHeartbeat).not.toHaveBeenCalled();
    await app.close();
  });
});
