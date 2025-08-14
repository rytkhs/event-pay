import { PayoutCalculator } from "@/lib/services/payout/calculation";
import {
  StripeFeeConfig,
  PlatformFeeConfig,
} from "@/lib/services/payout/types";

describe("PayoutCalculator consistency", () => {
  const stripeFeeConfig: StripeFeeConfig = {
    baseRate: 0.036,
    fixedFee: 0,
  };

  const platformFeeConfig: PlatformFeeConfig = {
    rate: 0,
    fixedFee: 0,
    minimumFee: 0,
    maximumFee: 0,
  };

  const calculator = new PayoutCalculator(stripeFeeConfig, platformFeeConfig);

  it("calculates fees identical to SQL formula (baseline case)", () => {
    const payments = [
      { amount: 1000, method: "stripe", status: "paid" },
      { amount: 2000, method: "stripe", status: "paid" },
    ];

    const result = calculator.calculateDetailedPayout(payments as any);

    // Stripe fee: ROUND(1000*0.036)+ROUND(2000*0.036)=36+72=108
    expect(result.totalStripeFee).toBe(108);
    // Platform fee 0
    expect(result.platformFee).toBe(0);
    // Net payout
    expect(result.netPayoutAmount).toBe(3000 - 108);
  });
});
