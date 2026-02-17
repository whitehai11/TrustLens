import crypto from "crypto";
import bcrypt from "bcryptjs";

const API_KEY_PREFIX = "tlp_";

export function generateApiKey(): string {
  const token = crypto.randomBytes(24).toString("base64url");
  return `${API_KEY_PREFIX}${token}`;
}

export async function hashApiKey(key: string): Promise<string> {
  return bcrypt.hash(key, 12);
}

export async function verifyApiKey(key: string, hash: string): Promise<boolean> {
  if (hash.startsWith("legacy:")) {
    const legacyHash = crypto.createHash("md5").update(key).digest("hex");
    return hash === `legacy:${legacyHash}`;
  }
  return bcrypt.compare(key, hash);
}

export function getApiKeyParts(key: string): { prefix: string; last4: string } {
  return {
    prefix: key.slice(0, 6),
    last4: key.slice(-4)
  };
}

export function maskApiKeyFromParts(prefix: string, last4: string): string {
  return `${prefix}...${last4}`;
}

export function maskApiKey(key: string): string {
  if (key.length < 10) return "****";
  const { prefix, last4 } = getApiKeyParts(key);
  return maskApiKeyFromParts(prefix, last4);
}

export function maskEmail(email: string): string {
  const [local, domain] = email.toLowerCase().split("@");
  if (!local || !domain) return "***";
  if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}
