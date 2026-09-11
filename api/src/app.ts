import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import type { DeviceAuthenticator } from "./core/ports/device-authenticator.js";
import type { EvidenceStore } from "./core/ports/evidence-store.js";
import type { HumanAuthenticator } from "./core/ports/human-authenticator.js";
import type { DashboardRepository } from "./modules/dashboard/repository.js";
import { dashboardRoutes } from "./modules/dashboard/routes.js";
import type { EvidenceRepository } from "./modules/evidence/repository.js";
import { evidenceRoutes } from "./modules/evidence/routes.js";
import { ingestionRoutes } from "./modules/ingestion/routes.js";
import { IngestionService, type IngestionRepository } from "./modules/ingestion/service.js";
import { systemRoutes } from "./modules/system/routes.js";
import type { PositionRepository } from "./modules/telemetry/repository.js";
import { telemetryRoutes } from "./modules/telemetry/routes.js";

export interface BuildAppOptions {
  logger?: boolean | { level: string };
  readinessCheck?: () => Promise<boolean>;
  deviceAuthenticator?: DeviceAuthenticator;
  ingestionRepository?: IngestionRepository;
  positionRepository?: PositionRepository;
  humanAuthenticator?: HumanAuthenticator;
  dashboardRepository?: DashboardRepository;
  evidenceRepository?: EvidenceRepository;
  evidenceStore?: EvidenceStore | null;
}

export const buildApp = (options: BuildAppOptions = {}) => {
  const app = Fastify({ logger: options.logger ?? false });

  void app.register(swagger, {
    openapi: {
      info: {
        title: "Sapsii API",
        description: "Provider-neutral API for the Sapsii urban sensing platform",
        version: "0.1.0",
      },
    },
  });
  void app.register(swaggerUi, { routePrefix: "/docs" });
  void app.register(systemRoutes, options.readinessCheck ? { readinessCheck: options.readinessCheck } : {});

  if (options.deviceAuthenticator && options.ingestionRepository) {
    void app.register(ingestionRoutes, {
      deviceAuthenticator: options.deviceAuthenticator,
      service: new IngestionService(options.ingestionRepository),
    });
  }

  if (options.deviceAuthenticator && options.positionRepository) {
    void app.register(telemetryRoutes, {
      deviceAuthenticator: options.deviceAuthenticator,
      repository: options.positionRepository,
    });
  }

  if (options.humanAuthenticator && options.dashboardRepository) {
    void app.register(dashboardRoutes, {
      humanAuthenticator: options.humanAuthenticator,
      repository: options.dashboardRepository,
    });
  }

  if (options.deviceAuthenticator && options.humanAuthenticator && options.evidenceRepository) {
    void app.register(evidenceRoutes, {
      deviceAuthenticator: options.deviceAuthenticator,
      humanAuthenticator: options.humanAuthenticator,
      repository: options.evidenceRepository,
      evidenceStore: options.evidenceStore ?? null,
    });
  }

  return app;
};
