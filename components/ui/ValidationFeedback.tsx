import React from "react";
import { cn } from "@/lib/utils";
import type {
  ValidationState_UI,
  ValidationResult,
  ValidationFeedbackProps,
} from "@/lib/types/validation";

// 下位互換性のため型エイリアスを保持
export type ValidationState = ValidationState_UI;
export type { ValidationResult, ValidationFeedbackProps };

const DEFAULT_MESSAGES = {
  valid: "入力値は有効です",
  invalid: "入力値にエラーがあります",
  validating: "検証中...",
};

const SIZE_CLASSES = {
  small: "w-3 h-3",
  medium: "w-4 h-4",
  large: "w-5 h-5",
};

const STATE_CLASSES = {
  valid: "text-green-600",
  invalid: "text-red-600",
  validating: "text-gray-600",
};

function LoadingSpinner({ size = "medium" }: { size?: "small" | "medium" | "large" }) {
  return (
    <svg
      className={cn(SIZE_CLASSES[size], "animate-spin")}
      fill="none"
      viewBox="0 0 24 24"
      data-testid="validation-loading"
      aria-label="検証中"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function SuccessIcon({ size = "medium" }: { size?: "small" | "medium" | "large" }) {
  return (
    <svg
      className={cn(SIZE_CLASSES[size])}
      fill="currentColor"
      viewBox="0 0 20 20"
      data-testid="validation-success"
      aria-label="入力値は有効です"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ErrorIcon({ size = "medium" }: { size?: "small" | "medium" | "large" }) {
  return (
    <svg
      className={cn(SIZE_CLASSES[size])}
      fill="currentColor"
      viewBox="0 0 20 20"
      data-testid="validation-error"
      aria-label="入力値にエラーがあります"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function ValidationFeedback({
  state,
  message,
  showIcon = true,
  animate = true,
  size = "medium",
  responsive = false,
  className,
  id,
  validationResults,
  ...props
}: ValidationFeedbackProps) {
  // neutral 状態では何も表示しない
  if (state === "neutral") {
    return null;
  }

  const displayMessage = message || DEFAULT_MESSAGES[state as keyof typeof DEFAULT_MESSAGES];

  const containerClasses = cn(
    "flex items-center gap-2 text-sm",
    STATE_CLASSES[state as keyof typeof STATE_CLASSES],
    animate && "animate-fade-in transition-opacity duration-200 ease-in-out",
    responsive && "responsive-feedback",
    className
  );

  const renderIcon = () => {
    if (!showIcon) return null;

    switch (state) {
      case "validating":
        return <LoadingSpinner size={size} />;
      case "valid":
        return <SuccessIcon size={size} />;
      case "invalid":
        return <ErrorIcon size={size} />;
      default:
        return null;
    }
  };

  const renderValidationResults = () => {
    if (!validationResults || validationResults.length === 0) {
      return null;
    }

    return validationResults.map((result, index) => (
      <div key={`${result.field}-${index}`} className="flex items-center gap-2 text-sm">
        {result.isValidating ? (
          <LoadingSpinner size={size} />
        ) : result.valid ? (
          <SuccessIcon size={size} />
        ) : (
          <ErrorIcon size={size} />
        )}
        <span>{result.message}</span>
      </div>
    ));
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={containerClasses}
      id={id}
      {...props}
    >
      {renderIcon()}
      {displayMessage && <span>{displayMessage}</span>}
      {renderValidationResults()}
    </div>
  );
}
