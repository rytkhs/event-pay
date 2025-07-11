import { describe, it, expect } from '@jest/globals';

/**
 * サービス手数料計算の検証テスト
 * issue 32で実装された「Math.floor(fee * 0.036)」の問題を検証
 */
describe('サービス手数料計算の精度問題', () => {
  // 現在の実装（問題のある実装）
  const calculateServiceFeeFloor = (fee: number): number => {
    return Math.floor(fee * 0.036);
  };

  // 正確な計算
  const calculateServiceFeeAccurate = (fee: number): number => {
    return fee * 0.036;
  };

  // 四捨五入版（修正案）
  const calculateServiceFeeRounded = (fee: number): number => {
    return Math.round(fee * 0.036);
  };

  describe('少額イベントでの影響検証', () => {
    it('100円イベントで0.60円の損失が発生する', () => {
      const fee = 100;
      const accurate = calculateServiceFeeAccurate(fee);
      const floored = calculateServiceFeeFloor(fee);
      const loss = accurate - floored;

      expect(accurate).toBeCloseTo(3.6, 2);
      expect(floored).toBe(3);
      expect(loss).toBeCloseTo(0.6, 2);
      expect(loss / fee).toBeCloseTo(0.006, 6); // 0.6%の損失
    });

    it('500円イベントでは損失が発生しない', () => {
      const fee = 500;
      const accurate = calculateServiceFeeAccurate(fee);
      const floored = calculateServiceFeeFloor(fee);
      const loss = accurate - floored;

      expect(accurate).toBe(18);
      expect(floored).toBe(18);
      expect(loss).toBe(0);
    });

    it('2777円イベントで最大0.97円の損失が発生する', () => {
      const fee = 2777;
      const accurate = calculateServiceFeeAccurate(fee);
      const floored = calculateServiceFeeFloor(fee);
      const loss = accurate - floored;

      expect(accurate).toBeCloseTo(99.972, 3);
      expect(floored).toBe(99);
      expect(loss).toBeCloseTo(0.972, 3);
    });
  });

  describe('大量参加イベントでの影響検証', () => {
    it('100円イベント×100人で60円の損失が発生する', () => {
      const fee = 100;
      const participants = 100;
      const lossPerParticipant = calculateServiceFeeAccurate(fee) - calculateServiceFeeFloor(fee);
      const totalLoss = lossPerParticipant * participants;

      expect(totalLoss).toBeCloseTo(60, 1);
    });

    it('複数イベントでの月間損失シミュレーション', () => {
      const events = [
        { fee: 100, count: 50, avgParticipants: 10 },
        { fee: 200, count: 30, avgParticipants: 15 },
        { fee: 300, count: 20, avgParticipants: 12 },
      ];

      let totalMonthlyLoss = 0;

      events.forEach(event => {
        const lossPerParticipant = calculateServiceFeeAccurate(event.fee) - calculateServiceFeeFloor(event.fee);
        const totalParticipants = event.count * event.avgParticipants;
        const eventLoss = lossPerParticipant * totalParticipants;
        totalMonthlyLoss += eventLoss;
      });

      expect(totalMonthlyLoss).toBeCloseTo(582, 0); // 月間582円の損失
    });
  });

  describe('データベース精算との整合性検証', () => {
    it('payoutsテーブルの計算式との不整合を検証', () => {
      // payoutsテーブルの制約: net_payout_amount = total_stripe_sales - total_stripe_fee - platform_fee
      const fee = 100;
      const participants = 10;
      const totalRevenue = fee * participants;
      const stripeFeeRate = 0.036; // 3.6%
      
      // 現在の実装での計算
      const serviceFeePerParticipant = calculateServiceFeeFloor(fee);
      const totalServiceFeeCharged = serviceFeePerParticipant * participants;
      
      // 正確な計算
      const totalServiceFeeExpected = totalRevenue * stripeFeeRate;
      
      // 差額（EventPay側の損失）
      const discrepancy = totalServiceFeeExpected - totalServiceFeeCharged;
      
      expect(totalServiceFeeExpected).toBe(36);
      expect(totalServiceFeeCharged).toBe(30);
      expect(discrepancy).toBe(6);
    });
  });

  describe('修正案の検証', () => {
    it('四捨五入版では精度が改善される', () => {
      const testCases = [
        { fee: 100, expected: 4 }, // 3.6 → 4
        { fee: 139, expected: 5 }, // 5.004 → 5
        { fee: 500, expected: 18 }, // 18.0 → 18
        { fee: 2777, expected: 100 }, // 99.972 → 100
      ];

      testCases.forEach(({ fee, expected }) => {
        const rounded = calculateServiceFeeRounded(fee);
        expect(rounded).toBe(expected);
      });
    });

    it('四捨五入版での年間損失/利益を検証', () => {
      const events = [
        { fee: 100, count: 50, avgParticipants: 10 },
        { fee: 500, count: 30, avgParticipants: 20 },
        { fee: 1000, count: 20, avgParticipants: 15 },
      ];

      let totalYearlyDifference = 0;

      events.forEach(event => {
        const accurate = calculateServiceFeeAccurate(event.fee);
        const rounded = calculateServiceFeeRounded(event.fee);
        const differencePerParticipant = rounded - accurate;
        const totalParticipants = event.count * event.avgParticipants * 12; // 年間
        const eventDifference = differencePerParticipant * totalParticipants;
        totalYearlyDifference += eventDifference;
      });

      // 四捨五入では若干の増収になる可能性がある
      console.log(`年間差額: ${totalYearlyDifference.toFixed(2)}円`);
      expect(Math.abs(totalYearlyDifference)).toBeLessThan(3000); // 年間3000円以内の差額
    });
  });

  describe('切り捨て問題の特定パターン', () => {
    it('最も損失が大きくなる料金を特定', () => {
      const maxLossItems: Array<{ fee: number; loss: number; lossRate: number }> = [];
      
      // 100円〜10000円の範囲で検証
      for (let fee = 100; fee <= 10000; fee += 100) {
        const accurate = calculateServiceFeeAccurate(fee);
        const floored = calculateServiceFeeFloor(fee);
        const loss = accurate - floored;
        const lossRate = loss / fee;
        
        if (loss > 0.5) { // 0.5円以上の損失
          maxLossItems.push({ fee, loss, lossRate });
        }
      }

      // 最も損失率が高いものを確認
      const maxLossRateItem = maxLossItems.reduce((max, item) => 
        item.lossRate > max.lossRate ? item : max
      );

      expect(maxLossRateItem.fee).toBe(100);
      expect(maxLossRateItem.loss).toBeCloseTo(0.6, 2);
      expect(maxLossRateItem.lossRate).toBeCloseTo(0.006, 6);
    });
  });
});