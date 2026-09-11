import { createDatabaseClient } from "@sapsii/db";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { PostgresDashboardRepository } from "./infrastructure/postgres/dashboard-repository.js";
import { PostgresDeviceAuthenticator } from "./infrastructure/postgres/device-authenticator.js";
import { PostgresEvidenceRepository } from "./infrastructure/postgres/evidence-repository.js";
import { PostgresIngestionRepository } from "./infrastructure/postgres/ingestion-repository.js";
import { PostgresJobQueue } from "./infrastructure/postgres/job-queue.js";
import { PostgresPositionRepository } from "./infrastructure/postgres/position-repository.js";
import { OidcHumanAuthenticator, RejectingHumanAuthenticator } from "./infrastructure/postgres/oidc-human-authenticator.js";
import { S3EvidenceStore } from "./infrastructure/object-storage/s3-evidence-store.js";
import { createInfrastructureIssueHandler } from "./modules/aggregation/infrastructure-issue-handler.js";
import { createTrafficMeasurementHandler } from "./modules/aggregation/traffic-measurement-handler.js";
import { EvidenceCleanupWorker } from "./modules/evidence/cleanup-worker.js";
import { JobWorker } from "./modules/jobs/worker.js";

const config = loadConfig();
const database = createDatabaseClient({
  connectionString: config.databaseUrl,
  maximumConnections: config.databaseMaximumConnections,
});
const humanAuthenticator = config.oidc
  ? new OidcHumanAuthenticator(database.db, config.oidc)
  : new RejectingHumanAuthenticator();
const evidenceRepository = new PostgresEvidenceRepository(database.db);
const evidenceStore = config.objectStore ? new S3EvidenceStore(config.objectStore) : null;
const app = buildApp({
  logger: { level: config.logLevel },
  readinessCheck: async () => {
    await database.pool.query("select 1");
    return true;
  },
  deviceAuthenticator: new PostgresDeviceAuthenticator(database.db),
  ingestionRepository: new PostgresIngestionRepository(database.db),
  positionRepository: new PostgresPositionRepository(database.db),
  humanAuthenticator,
  dashboardRepository: new PostgresDashboardRepository(database.db),
  evidenceRepository,
  evidenceStore,
});

const evidenceCleanupWorker = evidenceStore
  ? new EvidenceCleanupWorker(evidenceRepository, evidenceStore, app.log)
  : null;
const worker = new JobWorker(
  new PostgresJobQueue(database.db),
  new Map([
    ["aggregate_infrastructure_issue", createInfrastructureIssueHandler(database.db)],
    ["aggregate_traffic_measurement", createTrafficMeasurementHandler(database.db)],
  ]),
  app.log,
);

app.addHook("onClose", async () => {
  worker.stop();
  evidenceCleanupWorker?.stop();
  await database.close();
});

const shutdown = async (signal: string): Promise<void> => {
  app.log.info({ signal }, "shutting down");
  await app.close();
};

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

const start = async (): Promise<void> => {
  try {
    await app.listen({ host: config.host, port: config.port });
    worker.start();
    evidenceCleanupWorker?.start();
  } catch (error) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
  }
};

void start();
