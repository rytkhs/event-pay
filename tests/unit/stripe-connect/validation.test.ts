import { validateCreateExpressAccountParams } from "@features/stripe-connect/validation";

describe("stripe-connect validation", () => {
  it("does not default businessType to individual", () => {
    const result = validateCreateExpressAccountParams({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      email: "user@example.com",
    });

    expect(result.businessType).toBeUndefined();
    expect(result.country).toBe("JP");
  });
});
