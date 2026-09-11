export type HumanRole = "organization_admin" | "operator" | "viewer";

export interface HumanPrincipal {
  userId: string;
  organizationId: string;
  roles: readonly HumanRole[];
}

export interface HumanAuthenticator {
  authenticate(authorizationHeader: string, requestedOrganizationId?: string): Promise<HumanPrincipal | null>;
}
