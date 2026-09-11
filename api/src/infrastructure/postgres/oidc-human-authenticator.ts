import { organizationMembers, type Database } from "@sapsii/db";
import { and, eq } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { HumanAuthenticator, HumanPrincipal } from "../../core/ports/human-authenticator.js";

export interface OidcHumanAuthenticatorOptions {
  issuer: string;
  audience: string;
  jwksUrl: string;
}

export class OidcHumanAuthenticator implements HumanAuthenticator {
  private readonly jwks;

  public constructor(
    private readonly database: Database,
    private readonly options: OidcHumanAuthenticatorOptions,
  ) {
    this.jwks = createRemoteJWKSet(new URL(options.jwksUrl));
  }

  public async authenticate(
    authorizationHeader: string,
    requestedOrganizationId?: string,
  ): Promise<HumanPrincipal | null> {
    const match = /^Bearer (\S+)$/.exec(authorizationHeader);
    if (!match?.[1]) return null;

    let subject: string;
    try {
      const verified = await jwtVerify(match[1], this.jwks, {
        issuer: this.options.issuer,
        audience: this.options.audience,
      });
      if (!verified.payload.sub) return null;
      subject = verified.payload.sub;
    } catch {
      return null;
    }

    const membershipFilter = requestedOrganizationId
      ? and(
          eq(organizationMembers.authIssuer, this.options.issuer),
          eq(organizationMembers.authSubject, subject),
          eq(organizationMembers.organizationId, requestedOrganizationId),
        )
      : and(
          eq(organizationMembers.authIssuer, this.options.issuer),
          eq(organizationMembers.authSubject, subject),
        );
    const memberships = await this.database
      .select({ organizationId: organizationMembers.organizationId, role: organizationMembers.role })
      .from(organizationMembers)
      .where(membershipFilter)
      .limit(2);
    if (memberships.length !== 1) return null;

    return {
      userId: subject,
      organizationId: memberships[0]!.organizationId,
      roles: [memberships[0]!.role],
    };
  }
}

export class RejectingHumanAuthenticator implements HumanAuthenticator {
  public async authenticate(): Promise<null> {
    return null;
  }
}
