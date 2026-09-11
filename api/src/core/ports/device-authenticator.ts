export interface DevicePrincipal {
  deviceId: string;
  organizationId: string;
  credentialId: string;
  assignedBusId: string | null;
}

export interface DeviceAuthenticator {
  authenticate(authorizationHeader: string): Promise<DevicePrincipal | null>;
}
