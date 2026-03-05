import { InputSanitizer } from "@core/auth-security";

export function sanitizeEmailOrNull(email: string): string | null {
  try {
    return InputSanitizer.sanitizeEmail(email);
  } catch {
    return null;
  }
}

export function sanitizePasswordOrNull(password: string): string | null {
  try {
    return InputSanitizer.sanitizePassword(password);
  } catch {
    return null;
  }
}

export function sanitizeName(name: string): string {
  return name.trim();
}
