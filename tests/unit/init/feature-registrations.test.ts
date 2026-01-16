import { isSettlementReportPortRegistered } from "@core/ports/settlements";
import { isStripeConnectPortRegistered } from "@core/ports/stripe-connect";
import paymentRegistry from "@core/services/payment-registry";

import { registerAllFeatures } from "@/app/_init/feature-registrations";

describe("Feature Registrations", () => {
  it("should register payment and ports", () => {
    registerAllFeatures();

    expect(paymentRegistry.isRegistered()).toBe(true);
    expect(isSettlementReportPortRegistered()).toBe(true);
    expect(isStripeConnectPortRegistered()).toBe(true);
  });

  it("should be idempotent", () => {
    expect(() => {
      registerAllFeatures();
      registerAllFeatures();
    }).not.toThrow();

    expect(paymentRegistry.isRegistered()).toBe(true);
    expect(isSettlementReportPortRegistered()).toBe(true);
    expect(isStripeConnectPortRegistered()).toBe(true);
  });
});
