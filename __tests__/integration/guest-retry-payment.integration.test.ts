/**
 * 再決済フローの統合テスト
 * 決済失敗・未決済からの再決済導線をテストする
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createTestAttendance, cleanupTestData } from '@/test-utils/factories';
import { validateGuestToken } from '@/lib/utils/guest-token';
import { updateGuestAttendanceAction } from '@/app/events/actions/update-guest-attendance';

describe('再決済フロー統合テスト', () => {
  let testAttendanceId: string;
  let testGuestToken: string;

  beforeEach(async () => {
    // 決済失敗状態のテストデータ作成
    const testData = await createTestAttendance({
      event: { fee: 1000 },
      payment: {
        status: 'failed',
        method: 'stripe'
      }
    });
    testAttendanceId = testData.attendanceId;
    testGuestToken = testData.guestToken;
  });

  afterEach(async () => {
    await cleanupTestData([testAttendanceId]);
  });

  describe('決済失敗からの再決済', () => {
    it('failed状態から同じ決済方法での再決済が可能', async () => {
      // 参加状況確認
      const tokenValidation = await validateGuestToken(testGuestToken);
      expect(tokenValidation.isValid).toBe(true);
      expect(tokenValidation.attendance?.payment?.status).toBe('failed');

      // 同じ決済方法で再決済実行
      const formData = new FormData();
      formData.append('guestToken', testGuestToken);
      formData.append('attendanceStatus', 'attending');
      formData.append('paymentMethod', 'stripe');

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.requiresAdditionalPayment).toBe(true);
      expect(result.data?.paymentMethod).toBe('stripe');
    });

    it('pending状態から同じ決済方法での再決済が可能', async () => {
      // pending状態に変更
      const testDataPending = await createTestAttendance({
        event: { fee: 1000 },
        payment: {
          status: 'pending',
          method: 'stripe'
        }
      });

      const formData = new FormData();
      formData.append('guestToken', testDataPending.guestToken);
      formData.append('attendanceStatus', 'attending');
      formData.append('paymentMethod', 'stripe');

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.requiresAdditionalPayment).toBe(true);

      await cleanupTestData([testDataPending.attendanceId]);
    });

    it('paid状態では再決済が不要', async () => {
      // paid状態のテストデータ
      const testDataPaid = await createTestAttendance({
        event: { fee: 1000 },
        payment: {
          status: 'paid',
          method: 'stripe'
        }
      });

      const formData = new FormData();
      formData.append('guestToken', testDataPaid.guestToken);
      formData.append('attendanceStatus', 'attending');
      formData.append('paymentMethod', 'stripe');

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.requiresAdditionalPayment).toBe(false);

      await cleanupTestData([testDataPaid.attendanceId]);
    });
  });

  describe('決済方法変更', () => {
    it('失敗状態からの決済方法変更で再決済が必要', async () => {
      const formData = new FormData();
      formData.append('guestToken', testGuestToken);
      formData.append('attendanceStatus', 'attending');
      formData.append('paymentMethod', 'cash'); // stripe → cash に変更

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.requiresAdditionalPayment).toBe(true);
      expect(result.data?.paymentMethod).toBe('cash');
    });
  });

  describe('無料イベント', () => {
    it('無料イベントでは決済不要', async () => {
      const testDataFree = await createTestAttendance({
        event: { fee: 0 },
        payment: null
      });

      const formData = new FormData();
      formData.append('guestToken', testDataFree.guestToken);
      formData.append('attendanceStatus', 'attending');

      const result = await updateGuestAttendanceAction(formData);

      expect(result.success).toBe(true);
      expect(result.data?.requiresAdditionalPayment).toBe(false);

      await cleanupTestData([testDataFree.attendanceId]);
    });
  });
});
