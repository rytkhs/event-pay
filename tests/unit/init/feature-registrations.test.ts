import { isPaymentPortRegistered } from "@core/ports/payments";
import { isSettlementReportPortRegistered } from "@core/ports/settlements";
import { isStripeConnectPortRegistered } from "@core/ports/stripe-connect";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

describe("Feature Registrations", () => {
  it("should register payment and ports", () => {
    ensureFeaturesRegistered();

    expect(isPaymentPortRegistered()).toBe(true);
    expect(isSettlementReportPortRegistered()).toBe(true);
    expect(isStripeConnectPortRegistered()).toBe(true);
  });

  it("should be idempotent", () => {
    expect(() => {
      ensureFeaturesRegistered();
      ensureFeaturesRegistered();
    }).not.toThrow();

    expect(isPaymentPortRegistered()).toBe(true);
    expect(isSettlementReportPortRegistered()).toBe(true);
    expect(isStripeConnectPortRegistered()).toBe(true);
  });
});
