import {
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
        "代表公開ページに使うコミュニティを選択してください",
      ]);
    }
  });
});
