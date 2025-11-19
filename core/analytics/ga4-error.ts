/**
 * GA4 Analytics Error Handling
 *
 * Custom error class for GA4-related errors with structured error codes and context.
 */

/**
 * GA4 error codes for categorizing different types of errors
 */
export const GA4ErrorCode = {
  TIMEOUT: "GA4_TIMEOUT",
  INVALID_CLIENT_ID: "GA4_INVALID_CLIENT_ID",
  INVALID_PARAMETER: "GA4_INVALID_PARAMETER",
  API_ERROR: "GA4_API_ERROR",
  RETRY_EXHAUSTED: "GA4_RETRY_EXHAUSTED",
  CONFIGURATION_ERROR: "GA4_CONFIGURATION_ERROR",
} as const;

export type GA4ErrorCodeType = (typeof GA4ErrorCode)[keyof typeof GA4ErrorCode];

/**
 * Custom error class for GA4 analytics operations
 *
 * @example
 * ```typescript
 * throw new GA4Error(
 *   "Client ID validation failed",
 *   GA4ErrorCode.INVALID_CLIENT_ID,
 *   { clientId: "invalid-id" }
 * );
 * ```
 */
export class GA4Error extends Error {
  /**
   * Creates a new GA4Error instance
   *
   * @param message - Human-readable error message
   * @param code - Error code from GA4ErrorCode constants
   * @param context - Optional additional context about the error
   */
  constructor(
    message: string,
    public readonly code: GA4ErrorCodeType,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GA4Error";

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, GA4Error);
    }
  }
}
