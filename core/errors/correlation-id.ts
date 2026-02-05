type CorrelationIdOptions = {
  prefix?: string;
  length?: number;
};

/**
 * 指定された長さのランダムな16進数文字列を生成
 */
function buildRandomHex(length: number): string {
  const crypto = globalThis.crypto;

  if (crypto?.getRandomValues) {
    const bytes = new Uint8Array(Math.ceil(length / 2));
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, length);
  }

  // フォールバック: 基本的にここには到達しない
  return Math.random()
    .toString(16)
    .slice(2, 2 + length)
    .padEnd(length, "0");
}

/**
 * システム全体でリクエストや処理を追跡するための相関IDを生成
 * 例: req_a1b2c3d4e5f6g7h8
 */
export function generateCorrelationId({
  prefix = "req",
  length = 16,
}: CorrelationIdOptions = {}): string {
  return `${prefix}_${buildRandomHex(length)}`;
}
