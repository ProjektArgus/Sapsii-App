import { devices, type Database } from "@sapsii/db";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { DevicePrincipal } from "../../core/ports/device-authenticator.js";
import type { DevicePosition, PositionRepository } from "../../modules/telemetry/repository.js";

export class PostgresPositionRepository implements PositionRepository {
  public constructor(private readonly database: Database) {}

  public async recordHeartbeat(principal: DevicePrincipal, receivedAt: Date): Promise<void> {
    await this.database
      .update(devices)
      .set({ lastSeenAt: receivedAt, updatedAt: receivedAt })
      .where(and(eq(devices.id, principal.deviceId), eq(devices.organizationId, principal.organizationId)));
  }

  public async recordPosition(
    principal: DevicePrincipal,
    position: DevicePosition,
    receivedAt: Date,
  ): Promise<"updated" | "stale"> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .update(devices)
        .set({ lastSeenAt: receivedAt, updatedAt: receivedAt })
        .where(and(eq(devices.id, principal.deviceId), eq(devices.organizationId, principal.organizationId)));

      const updated = await transaction
        .update(devices)
        .set({
          lastPosition: `SRID=4326;POINT(${position.longitude} ${position.latitude})`,
          positionCapturedAt: position.capturedAt,
          positionAccuracyMeters: position.accuracyMeters,
          speedMetersPerSecond: position.speedMetersPerSecond ?? null,
          headingDegrees: position.headingDegrees ?? null,
          updatedAt: receivedAt,
        })
        .where(
          and(
            eq(devices.id, principal.deviceId),
            eq(devices.organizationId, principal.organizationId),
            or(isNull(devices.positionCapturedAt), lte(devices.positionCapturedAt, position.capturedAt)),
          ),
        )
        .returning({ id: devices.id });
      return updated.length > 0 ? "updated" : "stale";
    });
  }
}
