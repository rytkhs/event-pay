export const FEATURES = {
  /** Destination charges は常に有効 */
  useDestinationCharges: true,
} as const;

/** Destination charges は常に有効 */
export const isDestinationChargesEnabled = () => true;
