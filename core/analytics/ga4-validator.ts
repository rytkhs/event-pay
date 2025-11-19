/**
 * GA4 Analytics Validation Utilities
 *
 * Provides validation and sanitization for GA4 client IDs and event parameters
 * according to Google Analytics 4 specifications.
 */

/**
 * Result of a validation operation
 */
export interface ValidationResult {
  /** Whether the validation passed */
  isValid: boolean;
  /** List of validation error messages */
  errors: string[];
  /** Sanitized parameters (only present for parameter validation) */
  sanitizedParams?: Record<string, unknown>;
}

/**
 * Validator for GA4 client IDs and event parameters
 */
export class GA4Validator {
  /** Pattern for valid GA4 client IDs: numbers.numbers (variable length) */
  private static readonly CLIENT_ID_PATTERN = /^\d+\.\d+$/;

  /** Pattern for valid parameter names: alphanumeric and underscores, 1-40 characters */
  private static readonly PARAM_NAME_PATTERN = /^[a-zA-Z0-9_]{1,40}$/;

  /** Maximum length for string parameter values */
  private static readonly MAX_STRING_LENGTH = 100;

  /** Invalid client ID prefixes that should be rejected */
  private static readonly INVALID_CLIENT_ID_PREFIXES = ["GA1.", "1.."];

  /**
   * Validates a GA4 client ID
   *
   * @param clientId - The client ID to validate
   * @returns Validation result with any errors found
   *
   * @example
   * ```typescript
   * const result = GA4Validator.validateClientId("1234567890.0987654321");
   * if (!result.isValid) {
   *   console.error("Invalid client ID:", result.errors);
   * }
   * ```
   */
  static validateClientId(clientId: string): ValidationResult {
    const errors: string[] = [];

    if (!clientId) {
      errors.push("Client ID is empty");
      return { isValid: false, errors };
    }

    // Check for invalid prefixes
    for (const prefix of this.INVALID_CLIENT_ID_PREFIXES) {
      if (clientId.startsWith(prefix)) {
        errors.push(`Client ID contains invalid prefix: ${prefix}`);
      }
    }

    // Validate pattern: 10 digits, period, 10 digits
    if (!this.CLIENT_ID_PATTERN.test(clientId)) {
      errors.push("Client ID does not match required format (10digits.10digits)");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates and sanitizes event parameters according to GA4 specifications
   *
   *- Parameter names must be alphanumeric with underscores, max 40 characters
   * - String values are truncated to 100 characters
   * - Invalid parameters are excluded from the result
   *
   * @param params - The event parameters to validate and sanitize
   * @param debug - Whether to log debug information
   * @returns Validation result with sanitized parameters
   *
   * @example
   * ```typescript
   * const result = GA4Validator.validateAndSanitizeParams({
   *   event_name: "purchase",
   *   "invalid-name": "value", // Will be excluded
   *   long_string: "a".repeat(150) // Will be truncated to 100 chars
   * });
   * ```
   */
  static validateAndSanitizeParams(
    params: Record<string, unknown>,
    debug: boolean = false
  ): ValidationResult {
    const errors: string[] = [];
    const sanitizedParams: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      // Validate parameter name
      if (!this.PARAM_NAME_PATTERN.test(key)) {
        errors.push(`Invalid parameter name: ${key}`);
        if (debug) {
          console.log(`[GA4] Skipping invalid parameter name: ${key}`);
        }
        continue;
      }

      // Sanitize string values by truncating if necessary
      if (typeof value === "string") {
        if (value.length > this.MAX_STRING_LENGTH) {
          sanitizedParams[key] = value.substring(0, this.MAX_STRING_LENGTH);
          if (debug) {
            console.log(
              `[GA4] Truncated parameter ${key} from ${value.length} to ${this.MAX_STRING_LENGTH} characters`
            );
          }
        } else {
          sanitizedParams[key] = value;
        }
      } else {
        // Non-string values pass through unchanged
        sanitizedParams[key] = value;
      }
    }

    // 空のパラメータも有効とする（GA4はパラメータなしのイベントを許可）
    return {
      isValid: true,
      errors,
      sanitizedParams,
    };
  }
}
