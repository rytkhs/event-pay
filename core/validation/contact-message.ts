const CONTACT_MESSAGE_MIN_LENGTH = 10;

export function normalizeContactMessageForStorage(input: string): string {
  return input.trim();
}

export function canonicalizeContactMessageForFingerprint(input: string): string {
  return normalizeContactMessageForStorage(input)
    .split("\n")
    .map((line) => line.trim().replace(/[^\S\n]+/g, " "))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

export function hasValidContactMessageContent(input: string): boolean {
  return normalizeContactMessageForStorage(input).length >= CONTACT_MESSAGE_MIN_LENGTH;
}

export function hasValidContactNameContent(input: string): boolean {
  return input.trim().length > 0;
}
