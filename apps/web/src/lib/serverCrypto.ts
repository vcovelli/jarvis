import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const CIPHER = "aes-256-gcm";
const VERSION = "v1";

function getEncryptionKey() {
  const secret = process.env.FINANCIAL_DATA_KEY ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("FINANCIAL_DATA_KEY or NEXTAUTH_SECRET is required to protect financial secrets.");
  }
  if (/^[a-f0-9]{64}$/i.test(secret)) {
    return Buffer.from(secret, "hex");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(CIPHER, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptSecret(payload: string) {
  const [version, iv, tag, encrypted] = payload.split(":");
  if (version !== VERSION || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted secret format.");
  }
  const decipher = createDecipheriv(CIPHER, getEncryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
