import {
  toActionResultFromAppResult,
  type ActionResult,
} from "@core/errors/adapters/server-actions";
import type { AppResult } from "@core/errors";
import type { AuthCommandResult, AuthSideEffects } from "@features/auth/server";

export function projectAuthCommandResult<T>(result: AuthCommandResult<T>): {
  actionResult: ActionResult<T>;
  sideEffects?: AuthSideEffects;
} {
  const { sideEffects, ...options } = result.meta ?? {};

  return {
    actionResult: toActionResultFromAppResult(result as AppResult<T>, options),
    sideEffects,
  };
}
