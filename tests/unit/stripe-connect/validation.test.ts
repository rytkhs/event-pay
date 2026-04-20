import {
  COMMUNITY_DESCRIPTION_MAX_LENGTH_MESSAGE,
  COMMUNITY_DESCRIPTION_MIN_LENGTH_MESSAGE,
  requiredOnboardingCommunityDescriptionSchema,
  startOnboardingSchema,
  validateCreateExpressAccountParams,
} from "@features/stripe-connect/validation";

describe("stripe-connect validation", () => {
  it("does not default businessType to individual", () => {
    const result = validateCreateExpressAccountParams({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@example.com",
    });

    expect(result.businessType).toBeUndefined();
    expect(result.country).toBe("JP");
  });

  it("validates representative community id for onboarding", () => {
    const result = startOnboardingSchema.safeParse({
      representativeCommunityId: "not-a-uuid",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.representativeCommunityId).toEqual([
        "Stripe アカウント設定に使うコミュニティを選択してください",
      ]);
    }
  });

  it("validates onboarding community description maximum length", () => {
    const result = startOnboardingSchema.safeParse({
      communityDescription: "あ".repeat(1001),
      representativeCommunityId: "550e8400-e29b-41d4-a716-446655440000",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.communityDescription).toEqual([
        COMMUNITY_DESCRIPTION_MAX_LENGTH_MESSAGE,
      ]);
    }
  });

  it("requires 10 to 1000 characters when onboarding needs community description", () => {
    const tooShort = requiredOnboardingCommunityDescriptionSchema.safeParse({
      communityDescription: "短い",
    });
    const valid = requiredOnboardingCommunityDescriptionSchema.safeParse({
      communityDescription: "オンライン集金で利用する読書会の説明です",
    });
    const tooLong = requiredOnboardingCommunityDescriptionSchema.safeParse({
      communityDescription: "あ".repeat(1001),
    });

    expect(tooShort.success).toBe(false);
    if (!tooShort.success) {
      expect(tooShort.error.flatten().fieldErrors.communityDescription).toEqual([
        COMMUNITY_DESCRIPTION_MIN_LENGTH_MESSAGE,
      ]);
    }
    expect(valid.success).toBe(true);
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) {
      expect(tooLong.error.flatten().fieldErrors.communityDescription).toEqual([
        COMMUNITY_DESCRIPTION_MAX_LENGTH_MESSAGE,
      ]);
    }
  });
});
