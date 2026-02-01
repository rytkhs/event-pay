import { ERROR_REGISTRY } from "./registry";
import type { ErrorCode } from "./types";

const ERROR_CODE_SET = new Set(Object.keys(ERROR_REGISTRY));

export function isErrorCode(value: string): value is ErrorCode {
  return ERROR_CODE_SET.has(value);
}
