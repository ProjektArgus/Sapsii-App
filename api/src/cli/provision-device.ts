import {
  buses,
  createDatabaseClient,
  deviceCredentials,
  devices,
  organizations,
} from "@sapsii/db";
import { and, eq } from "drizzle-orm";
import { createDeviceSecret, hashDeviceSecret } from "../core/device-credentials.js";

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const organizationSlug = argument("organization");
const deviceExternalId = argument("device");
const busExternalId = argument("bus");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl || !organizationSlug || !deviceExternalId) {
  console.error(
    "Usage: DATABASE_URL=... npm run device:provision --workspace @sapsii/api -- --organization <slug> --device <external-id> [--bus <external-id>]",
  );
  process.exit(1);
}

const client = createDatabaseClient({ connectionString: databaseUrl, maximumConnections: 1 });

try {
  const credential = await client.db.transaction(async (transaction) => {
    const [insertedOrganization] = await transaction
      .insert(organizations)
      .values({ slug: organizationSlug, name: organizationSlug })
      .onConflictDoNothing({ target: organizations.slug })
      .returning({ id: organizations.id });
    const [existingOrganization] = insertedOrganization
      ? [insertedOrganization]
      : await transaction
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.slug, organizationSlug))
          .limit(1);
    if (!existingOrganization) throw new Error("Unable to provision organization");

    let assignedBusId: string | null = null;
    if (busExternalId) {
      const [insertedBus] = await transaction
        .insert(buses)
        .values({ organizationId: existingOrganization.id, externalId: busExternalId })
        .onConflictDoNothing({ target: [buses.organizationId, buses.externalId] })
        .returning({ id: buses.id });
      const [existingBus] = insertedBus
        ? [insertedBus]
        : await transaction
            .select({ id: buses.id })
            .from(buses)
            .where(and(eq(buses.organizationId, existingOrganization.id), eq(buses.externalId, busExternalId)))
            .limit(1);
      assignedBusId = existingBus?.id ?? null;
    }

    const [insertedDevice] = await transaction
      .insert(devices)
      .values({
        organizationId: existingOrganization.id,
        externalId: deviceExternalId,
        assignedBusId,
      })
      .onConflictDoNothing({ target: [devices.organizationId, devices.externalId] })
      .returning({ id: devices.id });
    const [device] = insertedDevice
      ? [insertedDevice]
      : await transaction
          .select({ id: devices.id })
          .from(devices)
          .where(
            and(eq(devices.organizationId, existingOrganization.id), eq(devices.externalId, deviceExternalId)),
          )
          .limit(1);
    if (!device) throw new Error("Unable to provision device");

    if (!insertedDevice && assignedBusId) {
      await transaction
        .update(devices)
        .set({ assignedBusId, updatedAt: new Date() })
        .where(eq(devices.id, device.id));
    }

    const secret = createDeviceSecret();
    const secretHash = await hashDeviceSecret(secret);
    const [createdCredential] = await transaction
      .insert(deviceCredentials)
      .values({ deviceId: device.id, label: "provisioned", secretHash })
      .returning({ id: deviceCredentials.id });
    if (!createdCredential) throw new Error("Unable to create device credential");

    return {
      organizationId: existingOrganization.id,
      deviceId: device.id,
      credentialId: createdCredential.id,
      authorization: `Device ${createdCredential.id}.${secret}`,
    };
  });

  console.log(JSON.stringify(credential, null, 2));
} finally {
  await client.close();
}
