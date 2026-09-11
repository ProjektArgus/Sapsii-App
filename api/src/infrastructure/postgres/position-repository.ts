import { deviceInstances, devices, type Database } from "@sapsii/db";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { DevicePrincipal } from "../../core/ports/device-authenticator.js";
import type { DevicePosition, PositionRepository } from "../../modules/telemetry/repository.js";

export class PostgresPositionRepository implements PositionRepository {
  public constructor(private readonly database: Database) {}

  public async recordHeartbeat(
    principal: DevicePrincipal,
    instanceExternalId: string | null,
    receivedAt: Date,
  ): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(devices)
        .set({ lastSeenAt: receivedAt, updatedAt: receivedAt })
        .where(and(eq(devices.id, principal.deviceId), eq(devices.organizationId, principal.organizationId)));

      if (instanceExternalId) {
        await transaction
          .insert(deviceInstances)
          .values({ deviceId: principal.deviceId, externalId: instanceExternalId, lastSeenAt: receivedAt })
          .onConflictDoUpdate({
            target: [deviceInstances.deviceId, deviceInstances.externalId],
            set: { lastSeenAt: receivedAt, updatedAt: receivedAt },
          });
      }
    });
  }

  public async recordPosition(
    principal: DevicePrincipal,
    instanceExternalId: string | null,
    position: DevicePosition,
    receivedAt: Date,
  ): Promise<"updated" | "stale"> {
    return this.database.transaction(async (transaction) => {
      await transaction
        .update(devices)
        .set({ lastSeenAt: receivedAt, updatedAt: receivedAt })
        .where(and(eq(devices.id, principal.deviceId), eq(devices.organizationId, principal.organizationId)));

      if (instanceExternalId) {
        await transaction
          .insert(deviceInstances)
          .values({ deviceId: principal.deviceId, externalId: instanceExternalId, lastSeenAt: receivedAt })
          .onConflictDoUpdate({
            target: [deviceInstances.deviceId, deviceInstances.externalId],
            set: { lastSeenAt: receivedAt, updatedAt: receivedAt },
          });
        const updated = await transaction
          .update(deviceInstances)
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
              eq(deviceInstances.deviceId, principal.deviceId),
              eq(deviceInstances.externalId, instanceExternalId),
              or(isNull(deviceInstances.positionCapturedAt), lte(deviceInstances.positionCapturedAt, position.capturedAt)),
            ),
          )
          .returning({ id: deviceInstances.id });
        return updated.length > 0 ? "updated" : "stale";
      }

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
