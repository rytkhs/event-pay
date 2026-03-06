import { AppError, errResult } from "@core/errors";

import type { AuthCommandResult } from "../auth-command-service.types";

export function validationErrorResult(
  userMessage: string,
  fieldErrors?: Record<string, string[] | undefined>
): AuthCommandResult<never> {
  return errResult(
    new AppError("VALIDATION_ERROR", {
      userMessage,
      details: fieldErrors,
    })
  );
}
