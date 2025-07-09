/**
 * バリデーション関連の型定義
 */

export interface ValidationState {
  value: string;
  isValid: boolean;
  error?: string;
  isValidating: boolean;
}

export interface ValidationOptions {
  debounceMs?: number;
  asyncValidator?: AsyncValidator;
  validateOnBlur?: boolean;
}

export interface ValidationResult {
  field: string;
  valid: boolean;
  message: string;
  isValidating?: boolean;
}

export type ValidationState_UI = "neutral" | "validating" | "valid" | "invalid";

export type SyncValidator = (value: string) => boolean | string;
export type AsyncValidator = (value: string) => Promise<boolean>;

export interface ValidationFeedbackProps {
  state: ValidationState_UI;
  message?: string;
  showIcon?: boolean;
  animate?: boolean;
  size?: "small" | "medium" | "large";
  responsive?: boolean;
  className?: string;
  id?: string;
  validationResults?: ValidationResult[];
}

export interface UseRealTimeValidationReturn {
  state: ValidationState;
  setValue: (newValue: string) => void;
  validate: () => void;
}

export interface DebounceValidationOptions {
  delay: number;
  immediate?: boolean;
}

export type DebouncedFunction<T extends (...args: unknown[]) => unknown> = (
  ...args: Parameters<T>
) => void;
