export const FEATURES = {
  /**
   * Destination charges を使用するかどうか
   * - USE_DESTINATION_CHARGES 環境変数が "true" の場合に有効
   */
  useDestinationCharges: process.env.USE_DESTINATION_CHARGES === "true",
} as const;

/** Destination charges が有効か判定するユーティリティ */
export const isDestinationChargesEnabled = () => FEATURES.useDestinationCharges;
