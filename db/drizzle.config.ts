import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  extensionsFilters: ["postgis"],
  migrations: {
    schema: "drizzle",
    table: "__drizzle_migrations",
  },
});
