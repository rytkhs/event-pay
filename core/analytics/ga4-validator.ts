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

  /** Pattern for valid parameter names: start with a letter, then alphanumeric and underscores, 1-40 characters */
  private static readonly PARAM_NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,39}$/;

  /** Maximum number of event parameters per event */
  private static readonly MAX_EVENT_PARAMS = 25;

  /** Maximum number of custom item-scoped parameters per item */
  private static readonly MAX_CUSTOM_ITEM_PARAMS = 27;

  /** Maximum length for string parameter values */
  private static readonly MAX_STRING_LENGTH = 100;

  /** Invalid client ID prefixes that should be rejected */
  private static readonly INVALID_CLIENT_ID_PREFIXES = ["GA1.", "1.."];

  /** Reserved parameter names and prefixes that GA4 does not accept for custom params */
  private static readonly RESERVED_PARAM_NAMES = new Set([
    "firebase_conversion",
    "firebase_error",
    "firebase_error_value",
    "firebase_screen",
    "firebase_screen_class",
    "firebase_screen_id",
    "ga_error",
    "ga_error_value",
    "ga_session_id",
    "ga_session_number",
    "google_conversion",
    "google_conversion_id",
    "google_conversion_label",
    "google_conversion_value",
  ]);

  private static readonly RESERVED_PARAM_PREFIXES = ["ga_", "google_", "firebase_", "_"];

  private static readonly REQUIRED_PARAMS_BY_EVENT: Record<string, string[]> = {
    begin_checkout: ["currency", "value", "items"],
    purchase: ["transaction_id", "currency", "value", "items"],
    sign_up: ["method"],
    login: ["method"],
    exception: ["description", "fatal"],
  };

  private static readonly STANDARD_ITEM_PARAMS = new Set([
    "item_id",
    "item_name",
    "affiliation",
    "coupon",
    "discount",
    "index",
    "item_brand",
    "item_category",
    "item_category2",
    "item_category3",
    "item_category4",
    "item_category5",
    "item_list_id",
    "item_list_name",
    "item_variant",
    "location_id",
    "price",
    "quantity",
  ]);

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
  /**
   * Sanitizes a GA4 client ID by removing the prefix (e.g., "GA1.1.")
   *
   * @param clientId - The raw client ID (e.g., from _ga cookie)
   * @returns The sanitized client ID (e.g., "1234567890.1234567890")
   */
  static sanitizeClientId(clientId: string): string {
    if (!clientId) return "";

    // Remove "GAx.x." prefix if present
    // Example: GA1.1.1234567890.1234567890 -> 1234567890.1234567890
    const prefixMatch = clientId.match(/^GA\d+\.\d+\.(.+)$/);
    if (prefixMatch?.[1]) {
      return prefixMatch[1];
    }

    return clientId;
  }

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

    // Validate pattern: digits.digits (variable length)
    if (!this.CLIENT_ID_PATTERN.test(clientId)) {
      errors.push("Client ID does not match required format (digits.digits)");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validates and sanitizes event parameters according to GA4 specifications
   *
   * - Parameter names must start with a letter and contain alphanumeric characters or underscores, max 40 characters
   * - Reserved parameter names and prefixes are rejected
   * - Event-specific required parameters are validated when eventName is provided
   * - String values are truncated to 100 characters
   * - Invalid parameters are excluded from the result
   *
   * @param params - The event parameters to validate and sanitize
   * @param debug - Whether to log debug information
   * @param eventName - Optional GA4 event name for event-specific validation
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
    debug: boolean = false,
    eventName?: string
  ): ValidationResult {
    const errors: string[] = [];
    const sanitizedParams: Record<string, unknown> = {};

    if (Object.keys(params).length > this.MAX_EVENT_PARAMS) {
      errors.push(`Too many event parameters: ${Object.keys(params).length}`);
    }

    if (eventName) {
      this.validateRequiredParams(eventName, params, errors);
    }

    for (const [key, value] of Object.entries(params)) {
      // Validate parameter name
      if (!this.isValidParamName(key)) {
        errors.push(`Invalid parameter name: ${key}`);
        if (debug) {
          // eslint-disable-next-line no-console
          console.log(`[GA4] Skipping invalid parameter name: ${key}`);
        }
        continue;
      }

      if (key === "items" && (eventName === "purchase" || eventName === "begin_checkout")) {
        if (this.validateItems(value, errors)) {
          sanitizedParams[key] = value;
        }
      } else if (typeof value === "string") {
        // Sanitize string values by truncating if necessary
        if (value.length > this.MAX_STRING_LENGTH) {
          sanitizedParams[key] = value.substring(0, this.MAX_STRING_LENGTH);
          if (debug) {
            // eslint-disable-next-line no-console
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
      isValid: errors.length === 0,
      errors,
      sanitizedParams,
    };
  }

  private static isValidParamName(name: string): boolean {
    if (!this.PARAM_NAME_PATTERN.test(name)) {
      return false;
    }
    if (this.RESERVED_PARAM_NAMES.has(name)) {
      return false;
    }
    return !this.RESERVED_PARAM_PREFIXES.some((prefix) => name.startsWith(prefix));
  }

  private static validateRequiredParams(
    eventName: string,
    params: Record<string, unknown>,
    errors: string[]
  ): void {
    const requiredParams = this.REQUIRED_PARAMS_BY_EVENT[eventName];
    if (!requiredParams) {
      return;
    }

    for (const param of requiredParams) {
      if (params[param] === undefined || params[param] === null || params[param] === "") {
        errors.push(`Missing required parameter for ${eventName}: ${param}`);
      }
    }
  }

  private static validateItems(value: unknown, errors: string[]): boolean {
    if (!Array.isArray(value)) {
      errors.push("items must be an array");
      return false;
    }
    if (value.length === 0) {
      errors.push("items must contain at least one item");
      return false;
    }

    let isValid = true;
    for (const [index, item] of value.entries()) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`items[${index}] must be an object`);
        isValid = false;
        continue;
      }

      const itemParams = item as Record<string, unknown>;
      if (!itemParams.item_id && !itemParams.item_name) {
        errors.push(`items[${index}] must include item_id or item_name`);
        isValid = false;
      }

      const customItemParams = Object.keys(itemParams).filter(
        (key) => !this.STANDARD_ITEM_PARAMS.has(key)
      );
      if (customItemParams.length > this.MAX_CUSTOM_ITEM_PARAMS) {
        errors.push(`items[${index}] has too many custom parameters: ${customItemParams.length}`);
        isValid = false;
      }

      for (const key of Object.keys(itemParams)) {
        if (!this.isValidParamName(key)) {
          errors.push(`Invalid item parameter name at items[${index}]: ${key}`);
          isValid = false;
        }
      }
    }

    return isValid;
  }
}
