import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export class PassageDecryptionError extends Error {
  constructor() {
    super("Invalid encrypted passage");
    this.name = "PassageDecryptionError";
  }
}

const CONTEXT = "aozora-puzzle-passage-encryption";

function deriveKey(): Buffer {
  const secret = process.env.PUZZLE_TOKEN_SECRET ?? "aozora-puzzle-dev-secret";
  return crypto.createHmac("sha256", CONTEXT).update(secret).digest();
}

export function encryptPassage(passage: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(passage, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64url");
}

export function decryptPassage(encoded: string): string {
  const key = deriveKey();
  const data = Buffer.from(encoded, "base64url");

  if (data.length < IV_LENGTH + TAG_LENGTH) {
    throw new PassageDecryptionError();
  }

  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
  } catch {
    throw new PassageDecryptionError();
  }
}
