import type { DevicePrincipal } from "../../core/ports/device-authenticator.js";

export interface DevicePosition {
  capturedAt: Date;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  speedMetersPerSecond?: number;
  headingDegrees?: number;
}

export interface PositionRepository {
  recordPosition(
    principal: DevicePrincipal,
    position: DevicePosition,
    receivedAt: Date,
  ): Promise<"updated" | "stale">;
}
