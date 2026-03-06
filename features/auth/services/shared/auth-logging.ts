import { handleServerError, type ErrorContext } from "@core/utils/error-handler.server";

const EMAIL_MASK_PATTERN = /(.)(.*)(@.*)/;

export function maskEmailForLog(email: string): string {
  return email.replace(EMAIL_MASK_PATTERN, "$1***$3");
}

type AuthErrorLogContext = Omit<ErrorContext, "category" | "additionalData"> & {
  action: string;
  email?: string;
  additionalData?: Record<string, unknown>;
};

export function logAuthError(error: unknown, context: AuthErrorLogContext): void {
  const { email, additionalData, ...rest } = context;

  const mergedAdditionalData = {
    ...(additionalData ?? {}),
    ...(email ? { sanitized_email: maskEmailForLog(email) } : {}),
  };

  handleServerError(error, {
    ...rest,
    category: "authentication",
    additionalData: Object.keys(mergedAdditionalData).length > 0 ? mergedAdditionalData : undefined,
  });
}
