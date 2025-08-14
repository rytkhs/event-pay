import { StripeFeeCalculator, DEFAULT_STRIPE_FEE_CONFIG } from "@/lib/services/payout/calculation";

/**
 * StripeFeeCalculator で得られる "各決済ごとに丸め → 合算" の値と
 * 単純に "総額×率を丸め" した近似値との差分を検証する。差分が小口大量決済時に 0 を超えることを確認し、
 * 将来 SQL 側で誤って近似式に戻してしまった場合の検知に用いる。
 */
describe("StripeFeeCalculator precision", () => {
  const calc = new StripeFeeCalculator(DEFAULT_STRIPE_FEE_CONFIG);
  const rate = DEFAULT_STRIPE_FEE_CONFIG.baseRate;

  function naiveFee(total: number): number {
    return Math.round(total * rate);
  }

  it("per-transaction rounding should differ from naive rounding for small transactions", () => {
    // 例: 50円の決済を100回 → naiveは Math.round(5000*0.036)=180 だが正確には round(1.8)*100 = 2*100 = 200
    const singleAmount = 50;
    const count = 100;
    const payments = Array.from({ length: count }, () => ({ amount: singleAmount, method: "stripe", status: "paid" }));

    const accurateFee = calc.calculateMultiplePaymentsFee(payments).totalFee;
    const naive = naiveFee(singleAmount * count);

    expect(accurateFee).not.toEqual(naive);
    expect(accurateFee - naive).toBeGreaterThan(0);
  });

  it("large single transaction results should match", () => {
    // 単一高額決済では両者が一致するケースもある
    const amount = 10000;
    const payments = [{ amount, method: "stripe", status: "paid" }];
    const accurateFee = calc.calculateMultiplePaymentsFee(payments).totalFee;
    const naive = naiveFee(amount);

    expect(accurateFee).toEqual(naive);
  });
});
