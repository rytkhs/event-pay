/**
 * 共通バリデーション関数
 * コンポーネント間で重複するバリデーションロジックを統一
 */

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * 数値の範囲をバリデート
 */
export function validateNumberRange(
  value: number,
  min: number,
  max: number,
  fieldName: string = "value"
): number {
  if (typeof value !== "number" || isNaN(value)) {
    throw new ValidationError(`${fieldName} must be a valid number`, fieldName, "INVALID_TYPE");
  }

  if (value < min || value > max) {
    throw new ValidationError(
      `${fieldName} must be between ${min} and ${max}`,
      fieldName,
      "OUT_OF_RANGE"
    );
  }

  return value;
}

/**
 * 進捗値をバリデート
 */
export function validateProgress(value: number): number {
  return validateNumberRange(value, 0, 100, "progress");
}

/**
 * CSS時間値をバリデート
 */
export function validateCSSTime(value: string, fieldName: string = "duration"): string {
  const cssTimeRegex = /^(\d+(\.\d+)?)(s|ms)$/;

  if (!cssTimeRegex.test(value)) {
    throw new ValidationError(
      `${fieldName} must be a valid CSS time value (e.g., "1s", "500ms")`,
      fieldName,
      "INVALID_FORMAT"
    );
  }

  return value;
}

/**
 * 列挙値をバリデート
 */
export function validateEnum<T extends string>(
  value: T,
  allowedValues: readonly T[],
  fieldName: string = "value"
): T {
  if (!allowedValues.includes(value)) {
    throw new ValidationError(
      `${fieldName} must be one of: ${allowedValues.join(", ")}`,
      fieldName,
      "INVALID_ENUM"
    );
  }

  return value;
}

/**
 * 文字列の長さをバリデート
 */
export function validateStringLength(
  value: string,
  minLength: number = 0,
  maxLength: number = Infinity,
  fieldName: string = "value"
): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${fieldName} must be a string`, fieldName, "INVALID_TYPE");
  }

  if (value.length < minLength) {
    throw new ValidationError(
      `${fieldName} must be at least ${minLength} characters long`,
      fieldName,
      "TOO_SHORT"
    );
  }

  if (value.length > maxLength) {
    throw new ValidationError(
      `${fieldName} must be at most ${maxLength} characters long`,
      fieldName,
      "TOO_LONG"
    );
  }

  return value;
}

/**
 * 安全なバリデーション実行
 * エラーをキャッチしてログに記録し、デフォルト値を返す
 */
export function safeValidate<T>(validator: () => T, defaultValue: T, errorMessage?: string): T {
  try {
    return validator();
  } catch (error) {
    if (errorMessage && process.env.NODE_ENV !== "test") {
      console.error(errorMessage, error);
    }
    return defaultValue;
  }
}
