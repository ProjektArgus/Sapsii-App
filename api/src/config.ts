export interface ApiConfig {
  host: string;
  port: number;
  logLevel: string;
  databaseUrl: string;
  databaseMaximumConnections: number;
  oidc: {
    issuer: string;
    audience: string;
    jwksUrl: string;
  } | null;
  objectStore: {
    bucket: string;
    region: string;
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    forcePathStyle: boolean;
  } | null;
}

const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? "3001");

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }

  return port;
};

const required = (environment: NodeJS.ProcessEnv, name: string): string => {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const parseOidc = (environment: NodeJS.ProcessEnv): ApiConfig["oidc"] => {
  const values = [environment.OIDC_ISSUER, environment.OIDC_AUDIENCE, environment.OIDC_JWKS_URL];
  if (values.every((value) => !value)) return null;
  if (values.some((value) => !value)) {
    throw new Error("OIDC_ISSUER, OIDC_AUDIENCE, and OIDC_JWKS_URL must be configured together");
  }
  return { issuer: values[0]!, audience: values[1]!, jwksUrl: values[2]! };
};

const parseObjectStore = (environment: NodeJS.ProcessEnv): ApiConfig["objectStore"] => {
  if (!environment.S3_BUCKET && !environment.S3_REGION) return null;
  if (!environment.S3_BUCKET || !environment.S3_REGION) {
    throw new Error("S3_BUCKET and S3_REGION must be configured together");
  }
  if (Boolean(environment.S3_ACCESS_KEY_ID) !== Boolean(environment.S3_SECRET_ACCESS_KEY)) {
    throw new Error("S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together");
  }
  return {
    bucket: environment.S3_BUCKET,
    region: environment.S3_REGION,
    ...(environment.S3_ENDPOINT ? { endpoint: environment.S3_ENDPOINT } : {}),
    ...(environment.S3_ACCESS_KEY_ID ? { accessKeyId: environment.S3_ACCESS_KEY_ID } : {}),
    ...(environment.S3_SECRET_ACCESS_KEY ? { secretAccessKey: environment.S3_SECRET_ACCESS_KEY } : {}),
    forcePathStyle: environment.S3_FORCE_PATH_STYLE === "true",
  };
};

const parseMaximumConnections = (value: string | undefined): number => {
  const maximum = Number(value ?? "10");
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 50) {
    throw new Error("DATABASE_MAX_CONNECTIONS must be an integer between 1 and 50");
  }
  return maximum;
};

export const loadConfig = (environment: NodeJS.ProcessEnv = process.env): ApiConfig => ({
  host: environment.HOST ?? "0.0.0.0",
  port: parsePort(environment.PORT),
  logLevel: environment.LOG_LEVEL ?? "info",
  databaseUrl: required(environment, "DATABASE_URL"),
  databaseMaximumConnections: parseMaximumConnections(environment.DATABASE_MAX_CONNECTIONS),
  oidc: parseOidc(environment),
  objectStore: parseObjectStore(environment),
});
