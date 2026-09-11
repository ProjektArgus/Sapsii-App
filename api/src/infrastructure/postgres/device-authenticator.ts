import { deviceCredentials, devices, type Database } from "@sapsii/db";
import { and, eq, isNull, or, gt } from "drizzle-orm";
import { parseDeviceAuthorization, verifyDeviceSecret } from "../../core/device-credentials.js";
import type { DeviceAuthenticator, DevicePrincipal } from "../../core/ports/device-authenticator.js";

export class PostgresDeviceAuthenticator implements DeviceAuthenticator {
  public constructor(private readonly database: Database) {}

  public async authenticate(authorizationHeader: string): Promise<DevicePrincipal | null> {
    const parsed = parseDeviceAuthorization(authorizationHeader);
    if (!parsed) return null;

    const now = new Date();
    const [record] = await this.database
      .select({
        credentialId: deviceCredentials.id,
        secretHash: deviceCredentials.secretHash,
        deviceId: devices.id,
        organizationId: devices.organizationId,
        assignedBusId: devices.assignedBusId,
      })
      .from(deviceCredentials)
      .innerJoin(devices, eq(deviceCredentials.deviceId, devices.id))
      .where(
        and(
          eq(deviceCredentials.id, parsed.credentialId),
          isNull(deviceCredentials.revokedAt),
          or(isNull(deviceCredentials.expiresAt), gt(deviceCredentials.expiresAt, now)),
          eq(devices.status, "active"),
        ),
      )
      .limit(1);

    if (!record || !(await verifyDeviceSecret(parsed.secret, record.secretHash))) return null;

    await this.database
      .update(deviceCredentials)
      .set({ lastUsedAt: now })
      .where(eq(deviceCredentials.id, record.credentialId));

    return {
      credentialId: record.credentialId,
      deviceId: record.deviceId,
      organizationId: record.organizationId,
      assignedBusId: record.assignedBusId,
    };
  }
}
