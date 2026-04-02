import { describe, expect, test } from "@jest/globals";

import {
  canonicalizeContactMessageForFingerprint,
  normalizeContactMessageForStorage,
} from "@core/validation/contact-message";
import { CommunityContactInputSchema } from "@core/validation/community-contact";
import { ContactInputSchema } from "@core/validation/contact";

describe("contact message normalization", () => {
  test("preserves line breaks for storage", () => {
    expect(normalizeContactMessageForStorage("  1行目\n\n2行目  ")).toBe("1行目\n\n2行目");
  });

  test("canonicalizes whitespace for fingerprint without flattening paragraphs", () => {
    expect(
      canonicalizeContactMessageForFingerprint("  1行目   \n  2行目\t\tです  \n\n\n 3行目 ")
    ).toBe("1行目\n2行目 です\n\n3行目");
  });
});

describe("contact schemas", () => {
  const validInput = {
    name: "山田 太郎",
    email: "taro@example.com",
    message: "お問い合わせ本文です",
    consent: true,
  };

  test("rejects blank-only names", () => {
    const result = ContactInputSchema.safeParse({
      ...validInput,
      name: "   ",
    });

    expect(result.success).toBe(false);
  });

  test("rejects messages that are too short after trimming", () => {
    const result = ContactInputSchema.safeParse({
      ...validInput,
      message: "          abcdefgh  ",
    });

    expect(result.success).toBe(false);
  });

  test("rejects blank-only messages for community contact", () => {
    const result = CommunityContactInputSchema.safeParse({
      ...validInput,
      message: "          ",
    });

    expect(result.success).toBe(false);
  });
});
