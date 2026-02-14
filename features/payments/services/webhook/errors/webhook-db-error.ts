export interface WebhookDatabaseErrorLike {
  code?: string | null;
}

/**
 * SQLSTATE class 22(data exception) / 23(integrity constraint violation) を
 * payload・データ不整合由来の終端エラーとして扱う。
 */
export function isTerminalDatabaseError(error: WebhookDatabaseErrorLike): boolean {
  const code = error.code;
  if (typeof code !== "string" || code.length < 2) {
    return false;
  }

  return code.startsWith("22") || code.startsWith("23");
}
