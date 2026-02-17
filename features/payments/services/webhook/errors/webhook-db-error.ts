export interface WebhookDatabaseErrorLike {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}

function normalize(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function isCardinalityDatabaseError(error: WebhookDatabaseErrorLike): boolean {
  const rawCode = error.code;
  const code = typeof rawCode === "string" ? rawCode.toUpperCase() : "";

  if (code === "PGRST116") {
    return true;
  }

  const message = normalize(error.message);
  const details = normalize(error.details);

  return (
    message.includes("multiple rows") ||
    message.includes("multiple (or no) rows") ||
    details.includes("multiple")
  );
}

/**
 * SQLSTATE class 22(data exception) / 23(integrity constraint violation) を
 * payload・データ不整合由来の終端エラーとして扱う。
 */
export function isTerminalDatabaseError(error: WebhookDatabaseErrorLike): boolean {
  if (isCardinalityDatabaseError(error)) {
    return true;
  }

  const code = error.code;
  if (typeof code !== "string" || code.length < 2) {
    return false;
  }

  return code.startsWith("22") || code.startsWith("23");
}
