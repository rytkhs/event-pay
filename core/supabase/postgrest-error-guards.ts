import type { PostgrestError } from "@supabase/supabase-js";

export function isPostgrestError(error: unknown): error is PostgrestError {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybe = error as Partial<PostgrestError>;
  return typeof maybe.code === "string" && typeof maybe.message === "string";
}

export function hasPostgrestCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const maybe = error as { code?: unknown };
  return typeof maybe.code === "string" && maybe.code === code;
}
