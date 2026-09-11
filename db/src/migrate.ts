import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const pool = new Pool({ connectionString, max: 1 });
const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

try {
  await migrate(drizzle(pool), { migrationsFolder });
} finally {
  await pool.end();
}
