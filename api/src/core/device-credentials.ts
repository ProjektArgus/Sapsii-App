import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 32;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

const derive = (secret: string, salt: Buffer, cost = COST, blockSize = BLOCK_SIZE, parallelization = PARALLELIZATION) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(
      secret,
      salt,
      KEY_LENGTH,
      { N: cost, r: blockSize, p: parallelization, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });

export const createDeviceSecret = (): string => randomBytes(32).toString("base64url");

export const hashDeviceSecret = async (secret: string): Promise<string> => {
  const salt = randomBytes(16);
  const key = await derive(secret, salt);
  return ["scrypt", COST, BLOCK_SIZE, PARALLELIZATION, salt.toString("base64url"), key.toString("base64url")].join("$");
};

export const verifyDeviceSecret = async (secret: string, encodedHash: string): Promise<boolean> => {
  const [algorithm, costText, blockSizeText, parallelizationText, saltText, keyText] = encodedHash.split("$");
  if (!algorithm || algorithm !== "scrypt" || !costText || !blockSizeText || !parallelizationText || !saltText || !keyText) {
    return false;
  }

  const expected = Buffer.from(keyText, "base64url");
  if (expected.length !== KEY_LENGTH) return false;

  try {
    const actual = await derive(
      secret,
      Buffer.from(saltText, "base64url"),
      Number(costText),
      Number(blockSizeText),
      Number(parallelizationText),
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};

export interface ParsedDeviceAuthorization {
  credentialId: string;
  secret: string;
}

export const parseDeviceAuthorization = (header: string): ParsedDeviceAuthorization | null => {
  const match = /^Device ([0-9a-f-]{36})\.([A-Za-z0-9_-]{40,})$/i.exec(header);
  return match?.[1] && match[2] ? { credentialId: match[1], secret: match[2] } : null;
};
