import { AppError } from "./app-error";
import { normalizeError } from "./normalize";
import type { ErrorCode } from "./types";

export type AppSuccess<T = void, M = undefined> = {
  success: true;
  data?: T;
  meta?: M;
};

export type AppFailure<M = undefined> = {
  success: false;
  error: AppError;
  meta?: M;
};

export type AppResult<T = void, M = undefined> = AppSuccess<T, M> | AppFailure<M>;

export function okResult<T, M = undefined>(data?: T, meta?: M): AppResult<T, M> {
  return { success: true, data, meta };
}

export function errResult<M = undefined>(error: AppError, meta?: M): AppResult<never, M> {
  return { success: false, error, meta };
}

export function errFrom<M = undefined>(
  error: unknown,
  options: { defaultCode?: ErrorCode; meta?: M } = {}
): AppResult<never, M> {
  const appError = normalizeError(error, options.defaultCode ?? "INTERNAL_ERROR");
  return errResult(appError, options.meta);
}

export function isOkResult<T, M>(result: AppResult<T, M>): result is AppSuccess<T, M> {
  return result.success === true;
}

export function isErrResult<T, M>(result: AppResult<T, M>): result is AppFailure<M> {
  return result.success === false;
}

export function mapResult<T, U, M>(
  result: AppResult<T, M>,
  mapper: (data: T) => U
): AppResult<U, M> {
  if (result.success) {
    if (result.data === undefined) {
      return okResult(undefined, result.meta) as AppResult<U, M>;
    }
    return okResult(mapper(result.data as T), result.meta);
  }
  return result;
}

export function mapMeta<T, M, N>(
  result: AppResult<T, M>,
  mapper: (meta: M | undefined) => N
): AppResult<T, N> {
  if (result.success) {
    return okResult(result.data, mapper(result.meta));
  }
  return errResult(result.error, mapper(result.meta));
}
