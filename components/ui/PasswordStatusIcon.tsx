interface PasswordStatusIconProps {
  type: "success" | "error" | "none";
  message?: string;
  testId?: string;
}

export function PasswordStatusIcon({ type, message, testId }: PasswordStatusIconProps) {
  if (type === "none") {
    return null;
  }

  const isSuccess = type === "success";
  const iconColor = isSuccess ? "text-success" : "text-destructive";
  const defaultTestId = isSuccess ? "password-match-success" : "password-match-error";

  return (
    <div className={`flex items-center ${iconColor} text-sm`}>
      {isSuccess ? (
        <svg
          data-testid={testId || defaultTestId}
          className="w-4 h-4 mr-1"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg
          data-testid={testId || defaultTestId}
          className="w-4 h-4 mr-1"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {message && <span>{message}</span>}
    </div>
  );
}
