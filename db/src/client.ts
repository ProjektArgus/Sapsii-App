import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseClient {
  db: Database;
  pool: Pool;
  close(): Promise<void>;
}

export interface DatabaseClientOptions {
  connectionString: string;
  maximumConnections?: number;
  connectionTimeoutMilliseconds?: number;
  idleTimeoutMilliseconds?: number;
}

export const createDatabaseClient = (options: DatabaseClientOptions): DatabaseClient => {
  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.maximumConnections ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMilliseconds ?? 5_000,
    idleTimeoutMillis: options.idleTimeoutMilliseconds ?? 30_000,
  });
  // node-postgres emits dropped idle connections on the pool. Without a listener,
  // a transient database/network disconnect terminates the entire API process.
  pool.on("error", (error) => {
    console.error("Unexpected idle PostgreSQL connection error", error);
  });

  return {
    db: drizzle(pool, { schema }),
    pool,
    close: async () => pool.end(),
  };
};
