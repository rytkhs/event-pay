import { createHash } from "crypto";

const EMAIL_IDEMPOTENCY_PREFIX = "eventpay";
const EMAIL_IDEMPOTENCY_VERSION = "v1";

function sanitizeScope(scope: string): string {
  const normalized = scope
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "default";
}

function normalizePart(part: unknown): string {
  if (part === null || part === undefined) return "";
  if (part instanceof Date) return part.toISOString();
  if (
    typeof part === "string" ||
    typeof part === "number" ||
    typeof part === "boolean" ||
    typeof part === "bigint"
  ) {
    return String(part);
  }

  try {
    return JSON.stringify(part);
  } catch {
    return String(part);
  }
}

export function buildEmailIdempotencyKey(params: { scope: string; parts: unknown[] }): string {
  const scope = sanitizeScope(params.scope);
  const raw = params.parts.map(normalizePart).join("|");
  const digest = createHash("sha256").update(raw).digest("hex").slice(0, 32);

  return `${EMAIL_IDEMPOTENCY_PREFIX}/${EMAIL_IDEMPOTENCY_VERSION}/${scope}/${digest}`;
}
