import type { AppFailure, AppResult, AppSuccess } from "@core/errors/app-result";
import type { ActionError, ActionResult } from "@core/errors/adapters/server-actions";

export function expectActionSuccess<T>(
  result: ActionResult<T>,
  message: string = "Expected action success"
): T {
  if (!result.success) {
    throw new Error(`${message}: ${result.error.code}`);
  }
  if (result.data === undefined) {
    throw new Error(`${message}: data is undefined`);
  }
  return result.data;
}

export function expectActionFailure<T>(
  result: ActionResult<T>,
  message: string = "Expected action failure"
): ActionError {
  if (result.success) {
    throw new Error(message);
  }
  return result.error;
}

export function expectAppSuccess<T, M>(
  result: AppResult<T, M>,
  message: string = "Expected app success"
): AppSuccess<T, M> {
  if (!result.success) {
    throw new Error(`${message}: ${result.error.code}`);
  }
  return result;
}

export function expectAppFailure<T, M>(
  result: AppResult<T, M>,
  message: string = "Expected app failure"
): AppFailure<M> {
  if (result.success) {
    throw new Error(message);
  }
  return result;
}
