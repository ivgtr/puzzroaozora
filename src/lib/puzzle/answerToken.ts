import crypto from "node:crypto";
import type { Difficulty } from "@/types/puzzle";

type AnswerPayload = {
  puzzleId: string;
  difficulty: Difficulty;
  order: string[];
  correctText: string;
  issuedAt: number;
};

function getSecret(): string {
  return process.env.PUZZLE_TOKEN_SECRET ?? "aozora-puzzle-dev-secret";
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(payloadEncoded: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payloadEncoded).digest("base64url");
}

export function createAnswerToken(payload: AnswerPayload): string {
  const payloadEncoded = toBase64Url(JSON.stringify(payload));
  const signature = sign(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function verifyAnswerToken(token: string): AnswerPayload | null {
  const [payloadEncoded, signature] = token.split(".");
  if (!payloadEncoded || !signature) {
    return null;
  }

  const expectedSignature = sign(payloadEncoded);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    return JSON.parse(fromBase64Url(payloadEncoded)) as AnswerPayload;
  } catch {
    return null;
  }
}
