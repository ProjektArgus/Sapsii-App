import { createDatabaseClient, organizationMembers, organizations } from "@sapsii/db";
import { eq } from "drizzle-orm";

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const organizationSlug = argument("organization");
const issuer = argument("issuer");
const subject = argument("subject");
const role = argument("role") ?? "viewer";
const databaseUrl = process.env.DATABASE_URL;
const allowedRoles = new Set(["organization_admin", "operator", "viewer"]);

if (!databaseUrl || !organizationSlug || !issuer || !subject || !allowedRoles.has(role)) {
  console.error(
    "Usage: DATABASE_URL=... npm run member:provision --workspace @sapsii/api -- --organization <slug> --issuer <oidc-issuer> --subject <oidc-subject> [--role organization_admin|operator|viewer]",
  );
  process.exit(1);
}

const client = createDatabaseClient({ connectionString: databaseUrl, maximumConnections: 1 });
try {
  const membership = await client.db.transaction(async (transaction) => {
    const [createdOrganization] = await transaction
      .insert(organizations)
      .values({ slug: organizationSlug, name: organizationSlug })
      .onConflictDoNothing({ target: organizations.slug })
      .returning({ id: organizations.id });
    const [organization] = createdOrganization
      ? [createdOrganization]
      : await transaction
          .select({ id: organizations.id })
          .from(organizations)
          .where(eq(organizations.slug, organizationSlug))
          .limit(1);
    if (!organization) throw new Error("Unable to provision organization");

    const [member] = await transaction
      .insert(organizationMembers)
      .values({
        organizationId: organization.id,
        authIssuer: issuer,
        authSubject: subject,
        role: role as "organization_admin" | "operator" | "viewer",
      })
      .onConflictDoUpdate({
        target: [organizationMembers.organizationId, organizationMembers.authIssuer, organizationMembers.authSubject],
        set: { role: role as "organization_admin" | "operator" | "viewer" },
      })
      .returning({
        organizationId: organizationMembers.organizationId,
        authSubject: organizationMembers.authSubject,
        role: organizationMembers.role,
      });
    if (!member) throw new Error("Unable to provision membership");
    return member;
  });
  console.log(JSON.stringify(membership, null, 2));
} finally {
  await client.close();
}
