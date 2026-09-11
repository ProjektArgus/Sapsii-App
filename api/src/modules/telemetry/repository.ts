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

  /**
   * Presence only. Refreshes the device's last-seen time so a unit that is
   * running but detecting nothing does not look offline; the device's status is
   * already enforced by the authenticator, so a disabled unit never gets here.
   */
  recordHeartbeat(principal: DevicePrincipal, receivedAt: Date): Promise<void>;
}
