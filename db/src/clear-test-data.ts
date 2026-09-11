import {
  auditLog,
  createDatabaseClient,
  derivedEvents,
  devices,
  evidence,
  infrastructureIssues,
  ingestionBatches,
  jobs,
  observations,
  organizations,
  trafficMeasurements,
  trips,
} from "./index.js";
import { eq } from "drizzle-orm";

const valueAfter = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const organizationSlug = valueAfter("--organization");
if (!organizationSlug) {
  throw new Error("Usage: npm run clear:test-data -- --organization <slug>");
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const client = createDatabaseClient({ connectionString, maximumConnections: 1 });
try {
  const [organization] = await client.db
    .select({ id: organizations.id, slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.slug, organizationSlug))
    .limit(1);
  if (!organization) throw new Error(`Organization '${organizationSlug}' does not exist`);

  const removed = await client.db.transaction(async (transaction) => {
    const countDeleted = async (query: PromiseLike<Array<{ id: string }>>) => (await query).length;

    const counts = {
      auditEntries: await countDeleted(transaction.delete(auditLog).where(eq(auditLog.organizationId, organization.id)).returning({ id: auditLog.id })),
      jobs: await countDeleted(transaction.delete(jobs).where(eq(jobs.organizationId, organization.id)).returning({ id: jobs.id })),
      trafficMeasurements: await countDeleted(transaction.delete(trafficMeasurements).where(eq(trafficMeasurements.organizationId, organization.id)).returning({ id: trafficMeasurements.id })),
      derivedEvents: await countDeleted(transaction.delete(derivedEvents).where(eq(derivedEvents.organizationId, organization.id)).returning({ id: derivedEvents.id })),
      infrastructureIssues: await countDeleted(transaction.delete(infrastructureIssues).where(eq(infrastructureIssues.organizationId, organization.id)).returning({ id: infrastructureIssues.id })),
      observations: await countDeleted(transaction.delete(observations).where(eq(observations.organizationId, organization.id)).returning({ id: observations.id })),
      ingestionBatches: await countDeleted(transaction.delete(ingestionBatches).where(eq(ingestionBatches.organizationId, organization.id)).returning({ id: ingestionBatches.id })),
      evidenceMetadata: await countDeleted(transaction.delete(evidence).where(eq(evidence.organizationId, organization.id)).returning({ id: evidence.id })),
      trips: await countDeleted(transaction.delete(trips).where(eq(trips.organizationId, organization.id)).returning({ id: trips.id })),
    };

    await transaction
      .update(devices)
      .set({
        softwareName: null,
        softwareVersion: null,
        modelName: null,
        modelVersion: null,
        lastSeenAt: null,
        lastPosition: null,
        positionCapturedAt: null,
        positionAccuracyMeters: null,
        speedMetersPerSecond: null,
        headingDegrees: null,
        health: {},
        updatedAt: new Date(),
      })
      .where(eq(devices.organizationId, organization.id));

    return counts;
  });

  console.log(JSON.stringify({
    organization: organization.slug,
    preserved: ["organization", "members", "buses", "devices", "device credentials"],
    removed,
    note: "Evidence database metadata was removed; objects already uploaded to external storage are not deleted by this command.",
  }, null, 2));
} finally {
  await client.close();
}
