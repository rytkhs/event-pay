import { StripeFeeCalculator } from "@/lib/services/payout/calculation";

describe("StripeFeeCalculator rounding", () => {
  const cases = [
    { amount: 100, rate: 0.039, fixed: 30 },
    { amount: 999, rate: 0.036, fixed: 0 },
    { amount: 12345, rate: 0.036, fixed: 30 },
  ];

  it.each(cases)("fee calculation matches ROUND(a*rate+fixed) %#", ({ amount, rate, fixed }) => {
    const calc = new StripeFeeCalculator({ baseRate: rate, fixedFee: fixed });
    const expected = Math.round(amount * rate + fixed);
    expect(calc.calculateSinglePaymentFee(amount)).toBe(expected);
  });
});
