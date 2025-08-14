import { PayoutCalculator, DEFAULT_PLATFORM_FEE_CONFIG } from "@/lib/services/payout/calculation";
import { isPayoutAmountEligible } from "@/lib/services/payout/constants";

/** 単純なモック決済データ */
const payments = [
  { amount: 1000, method: "stripe", status: "paid" },
  { amount: 2000, method: "stripe", status: "paid" },
];

describe("Payout eligibility consistency", () => {
  it("netPayoutAmount が isPayoutAmountEligible の条件を満たすか判定", () => {
    const stripeFeeConfig = { baseRate: 0.039, fixedFee: 30 };
    const calculator = new PayoutCalculator(stripeFeeConfig, DEFAULT_PLATFORM_FEE_CONFIG);

    const result = calculator.calculateBasicPayout(payments as any);

    const eligible = isPayoutAmountEligible(result.netPayoutAmount);

    // 手動で計算した期待値
    const expectedFees = Math.round(1000 * 0.039 + 30) + Math.round(2000 * 0.039 + 30);
    const expectedNet = 3000 - expectedFees;

    expect(result.netPayoutAmount).toBe(expectedNet);
    expect(eligible).toBe(result.netPayoutAmount >= 100);
  });
});
