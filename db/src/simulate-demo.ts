import { and, eq, inArray } from "drizzle-orm";
import { createDatabaseClient } from "./client.js";
import { patialaDemoFleet } from "./demo-patiala.js";
import { patialaRoadRoutes } from "./demo-road-routes.js";
import { devices, organizations } from "./schema/index.js";

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const databaseUrl = process.env.DATABASE_URL;
const organizationSlug = argument("organization") ?? "sapsii-dev";
const intervalMs = Number(argument("interval-ms") ?? 750);
if (!databaseUrl || !Number.isFinite(intervalMs) || intervalMs < 250) {
  console.error("Usage: DATABASE_URL=... npm run simulate:demo --workspace @sapsii/db -- [--organization <slug>] [--interval-ms 750]");
  process.exit(1);
}

const point = (latitude: number, longitude: number) => `SRID=4326;POINT(${longitude} ${latitude})`;
type Coordinate = readonly [latitude: number, longitude: number];

const decodePolyline6 = (encoded: string): Coordinate[] => {
  const coordinates: Coordinate[] = [];
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const decodeValue = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    latitude += decodeValue();
    longitude += decodeValue();
    coordinates.push([latitude / 1_000_000, longitude / 1_000_000]);
  }
  return coordinates;
};

const radians = (degrees: number) => degrees * Math.PI / 180;
const distanceMeters = (from: Coordinate, to: Coordinate) => {
  const latitudeDelta = radians(to[0] - from[0]);
  const longitudeDelta = radians(to[1] - from[1]);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from[0])) * Math.cos(radians(to[0])) * Math.sin(longitudeDelta / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(a));
};

const routes = Object.fromEntries(Object.entries(patialaRoadRoutes).map(([route, encoded]) => {
  const coordinates = decodePolyline6(encoded);
  const cumulativeDistances = [0];
  for (let index = 1; index < coordinates.length; index += 1) {
    cumulativeDistances.push(cumulativeDistances[index - 1]! + distanceMeters(coordinates[index - 1]!, coordinates[index]!));
  }
  return [route, { coordinates, cumulativeDistances, totalDistance: cumulativeDistances.at(-1)! }];
}));

const interpolate = (route: (typeof routes)[string], progress: number) => {
  const targetDistance = progress * route.totalDistance;
  let upperIndex = route.cumulativeDistances.findIndex((distance) => distance >= targetDistance);
  if (upperIndex < 1) upperIndex = 1;
  const lowerIndex = upperIndex - 1;
  const current = route.coordinates[lowerIndex]!;
  const next = route.coordinates[upperIndex]!;
  const segmentDistance = route.cumulativeDistances[upperIndex]! - route.cumulativeDistances[lowerIndex]!;
  const fraction = segmentDistance === 0 ? 0 : (targetDistance - route.cumulativeDistances[lowerIndex]!) / segmentDistance;
  const latitude = current[0] + (next[0] - current[0]) * fraction;
  const longitude = current[1] + (next[1] - current[1]) * fraction;
  const latitude1 = radians(current[0]);
  const latitude2 = radians(next[0]);
  const longitudeDelta = radians(next[1] - current[1]);
  const headingDegrees = (Math.atan2(
    Math.sin(longitudeDelta) * Math.cos(latitude2),
    Math.cos(latitude1) * Math.sin(latitude2) - Math.sin(latitude1) * Math.cos(latitude2) * Math.cos(longitudeDelta),
  ) * 180 / Math.PI + 360) % 360;
  return { latitude, longitude, headingDegrees };
};

const client = createDatabaseClient({ connectionString: databaseUrl, maximumConnections: 2 });
let running = true;
process.once("SIGINT", () => { running = false; });
process.once("SIGTERM", () => { running = false; });

const retryDatabase = async <T>(description: string, operation: () => Promise<T>): Promise<T> => {
  while (running) {
    try {
      return await operation();
    } catch (error) {
      console.error(`${description} failed; retrying`, error);
      await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw new Error("Demo simulator stopped while waiting for PostgreSQL");
};

try {
  const [organization] = await retryDatabase("Demo organization lookup", () =>
    client.db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, organizationSlug)).limit(1),
  );
  if (!organization) throw new Error(`Organization '${organizationSlug}' does not exist; run db:seed-demo first`);
  const externalIds = patialaDemoFleet.map((_, index) => `SAPSII-PTA-${(index + 1).toString().padStart(3, "0")}`);
  const rows = await retryDatabase("Demo device lookup", () =>
    client.db
      .select({ id: devices.id, externalId: devices.externalId })
      .from(devices)
      .where(and(eq(devices.organizationId, organization.id), inArray(devices.externalId, externalIds))),
  );
  const ids = new Map(rows.map((row) => [row.externalId, row.id]));
  if (ids.size !== patialaDemoFleet.length) throw new Error("Patiala demo devices are incomplete; run db:seed-demo first");

  console.log(`Simulating ${ids.size} live Patiala devices every ${intervalMs}ms. Press Ctrl+C to stop.`);
  const startedAt = Date.now();
  while (running) {
    const now = new Date();
    try {
      await Promise.all(patialaDemoFleet.map(async (item, index) => {
        const route = routes[item.route]!;
        const speedMetersPerSecond = 8.5 + index * 0.7;
        const elapsedDistance = (Date.now() - startedAt) / 1_000 * speedMetersPerSecond;
        const staggeredDistance = index / patialaDemoFleet.length * route.totalDistance;
        const routeProgress = ((elapsedDistance + staggeredDistance) % route.totalDistance) / route.totalDistance;
        const position = interpolate(route, routeProgress);
        await client.db
          .update(devices)
          .set({
            lastPosition: point(position.latitude, position.longitude),
            positionCapturedAt: now,
            positionAccuracyMeters: 3.5 + index * 0.4,
            speedMetersPerSecond,
            headingDegrees: position.headingDegrees,
            lastSeenAt: now,
            health: { demo: true, effectiveFps: 24 + index, meanLatencyMs: 38 + index * 4, thermalStatus: index === 3 ? "elevated" : "normal", queueDepth: index },
            updatedAt: now,
          })
          .where(eq(devices.id, ids.get(externalIds[index]!)!));
      }));
    } catch (error) {
      console.error("Demo position update failed; retrying", error);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
} finally {
  await client.close();
}
