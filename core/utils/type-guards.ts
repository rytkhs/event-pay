export type UnknownRecord = Record<string, unknown>;

export interface ErrorLike {
  name?: string;
  message?: string;
  code?: string;
  type?: string;
  digest?: string;
  statusCode?: number;
  stack?: string;
  cause?: unknown;
  details?: unknown;
}

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

export function getStringProp(value: unknown, key: string): string | undefined {
  if (!isRecord(value)) return undefined;
  const prop = value[key];
  return typeof prop === "string" ? prop : undefined;
}

export function getNumberProp(value: unknown, key: string): number | undefined {
  if (!isRecord(value)) return undefined;
  const prop = value[key];
  return typeof prop === "number" ? prop : undefined;
}

export function getFiniteNumberProp(value: unknown, key: string): number | undefined {
  const prop = getNumberProp(value, key);
  return typeof prop === "number" && Number.isFinite(prop) ? prop : undefined;
}

export function getRecordProp(value: unknown, key: string): UnknownRecord | undefined {
  if (!isRecord(value)) return undefined;
  const prop = value[key];
  return isRecord(prop) ? prop : undefined;
}

export function toErrorLike(value: unknown): ErrorLike {
  const result: ErrorLike = {};

  if (value instanceof Error) {
    result.name = value.name;
    result.message = value.message;
    result.stack = value.stack;
  }

  if (!isRecord(value)) {
    return result;
  }

  const name = value["name"];
  const message = value["message"];
  const code = value["code"];
  const type = value["type"];
  const digest = value["digest"];
  const statusCode = value["statusCode"];
  const stack = value["stack"];

  if (typeof name === "string") result.name = name;
  if (typeof message === "string") result.message = message;
  if (typeof code === "string") result.code = code;
  if (typeof type === "string") result.type = type;
  if (typeof digest === "string") result.digest = digest;
  if (typeof statusCode === "number") result.statusCode = statusCode;
  if (typeof stack === "string") result.stack = stack;

  if ("cause" in value) {
    result.cause = value["cause"];
  }
  if ("details" in value) {
    result.details = value["details"];
  }

  return result;
}
