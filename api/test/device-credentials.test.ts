import { describe, expect, it } from "vitest";
import {
  createDeviceSecret,
  hashDeviceSecret,
  parseDeviceAuthorization,
  verifyDeviceSecret,
} from "../src/core/device-credentials.js";

describe("device credentials", () => {
  it("hashes and verifies without storing the secret", async () => {
    const secret = createDeviceSecret();
    const encoded = await hashDeviceSecret(secret);

    expect(encoded).not.toContain(secret);
    await expect(verifyDeviceSecret(secret, encoded)).resolves.toBe(true);
    await expect(verifyDeviceSecret(`${secret}x`, encoded)).resolves.toBe(false);
  });

  it("parses only the device authorization scheme", () => {
    const secret = createDeviceSecret();
    expect(parseDeviceAuthorization(`Device 123e4567-e89b-12d3-a456-426614174000.${secret}`)).toEqual({
      credentialId: "123e4567-e89b-12d3-a456-426614174000",
      secret,
    });
    expect(parseDeviceAuthorization(`Bearer ${secret}`)).toBeNull();
  });
});
