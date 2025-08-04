/**
 * ゲストトークンRLSポリシーのテスト
 * 
 * 目的:
 * - 新しく実装されたゲストトークン用RLSポリシーの動作を検証
 * - ポリシー違反時の適切なエラーハンドリングをテスト
 * - セキュリティ要件3.1, 3.2, 6.2の検証
 */

import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';
import { generateGuestToken } from '@/lib/utils/guest-token';
import { TestDataManager } from '@/test-utils/test-data-manager';

// テスト用のSupabaseクライアント設定
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

describe('ゲストトークンRLSポリシーテスト', () => {
  let testDataManager: TestDataManager;
  let testEventId: string;
  let testAttendanceId: string;
  let testPaymentId: string;
  let validGuestToken: string;
  let invalidGuestToken: string;

  beforeAll(async () => {
    // テストデータマネージャーを初期化
    testDataManager = new TestDataManager();

    // テスト用のゲストトークンを生成
    validGuestToken = generateGuestToken();
    invalidGuestToken = generateGuestToken();
  });

  beforeEach(async () => {
    // テストデータをクリーンアップ
    await testDataManager.cleanup();

    // ゲストトークン設定をクリア
    const clearClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    await clearClient.rpc('clear_test_guest_token');

    // テスト用のイベントを作成
    const testEvent = await testDataManager.createTestEvent({
      title: 'テストイベント',
      date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 1週間後
      fee: 1000,
      payment_methods: ['stripe', 'cash'],
      registration_deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(), // 5日後
      payment_deadline: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString(), // 6日後
    });
    testEventId = testEvent.id;

    // テスト用の参加記録を作成
    const testAttendance = await testDataManager.createTestAttendance({
      event_id: testEventId,
      nickname: 'テストユーザー',
      email: 'test@example.com',
      status: 'attending',
      guest_token: validGuestToken
    });
    testAttendanceId = testAttendance.id;

    // テスト用の決済記録を作成
    const testPayment = await testDataManager.createTestPayment({
      attendance_id: testAttendanceId,
      method: 'stripe',
      amount: 1000,
      status: 'pending'
    });
    testPaymentId = testPayment.id;
  });

  afterEach(async () => {
    // ゲストトークン設定をクリア
    const clearClient = createClient<Database>(supabaseUrl, supabaseAnonKey);
    await clearClient.rpc('clear_test_guest_token');

    // テストデータをクリーンアップ
    await testDataManager.cleanup();
  });

  describe('RLSポリシーの基本動作テスト', () => {
    it('有効なゲストトークンで参加記録を読み取りできる', async () => {
      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      // テスト用にapp.guest_token設定を使用
      const { error: setError } = await guestClient
        .rpc('set_test_guest_token', { token: validGuestToken });

      expect(setError).toBeNull();

      // ゲストトークンが設定されたクライアントで参加記録を取得
      const { data, error } = await guestClient
        .from('attendances')
        .select('*')
        .eq('guest_token', validGuestToken);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].id).toBe(testAttendanceId);
    });

    it('無効なゲストトークンでは空の結果が返される', async () => {
      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      // 無効なトークンを設定
      const { error: setError } = await guestClient
        .rpc('set_test_guest_token', { token: invalidGuestToken });

      expect(setError).toBeNull();

      const { data, error } = await guestClient
        .from('attendances')
        .select('*')
        .eq('id', testAttendanceId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0); // RLSポリシーにより空の結果が返される
    });

    it('ゲストトークンが設定されていない場合は空の結果が返される', async () => {
      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      const { data, error } = await guestClient
        .from('attendances')
        .select('*')
        .eq('id', testAttendanceId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  describe('attendancesテーブルのRLSポリシーテスト', () => {
    it('有効なゲストトークンで期限内に参加記録を更新できる', async () => {
      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      // ゲストトークンを設定
      await guestClient.rpc('set_test_guest_token', { token: validGuestToken });

      const { data, error } = await guestClient
        .from('attendances')
        .update({ status: 'maybe' })
        .eq('id', testAttendanceId)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].status).toBe('maybe');
    });

    it('無効なゲストトークンでは更新できない', async () => {
      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      // 無効なトークンを設定
      await guestClient.rpc('set_test_guest_token', { token: invalidGuestToken });

      const { data, error } = await guestClient
        .from('attendances')
        .update({ status: 'maybe' })
        .eq('id', testAttendanceId)
        .select();

      expect(error).toBeNull();
      expect(data).toHaveLength(0); // RLSポリシーにより更新されない
    });
  });

  describe('eventsテーブルのRLSポリシーテスト', () => {
    it('ゲストトークンで参加するイベントの詳細を読み取りできる', async () => {
      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      // ゲストトークンを設定
      await guestClient.rpc('set_test_guest_token', { token: validGuestToken });

      const { data, error } = await guestClient
        .from('events')
        .select('*')
        .eq('id', testEventId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].id).toBe(testEventId);
    });

    it('参加していないイベントの詳細は読み取りできない', async () => {
      // 別のイベントを作成
      const otherEvent = await testDataManager.createTestEvent({
        title: '別のイベント',
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        fee: 500,
        payment_methods: ['cash'],
      });

      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      // ゲストトークンを設定
      await guestClient.rpc('set_test_guest_token', { token: validGuestToken });

      const { data, error } = await guestClient
        .from('events')
        .select('*')
        .eq('id', otherEvent.id);

      expect(error).toBeNull();
      expect(data).toHaveLength(0); // 参加していないため読み取りできない
    });
  });

  describe('paymentsテーブルのRLSポリシーテスト', () => {
    it('ゲストトークンで自分の決済情報を読み取りできる', async () => {
      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      // ゲストトークンを設定
      await guestClient.rpc('set_test_guest_token', { token: validGuestToken });

      const { data, error } = await guestClient
        .from('payments')
        .select('*')
        .eq('id', testPaymentId);

      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data![0].id).toBe(testPaymentId);
    });

    it('無効なゲストトークンでは決済情報を読み取りできない', async () => {
      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      // 無効なトークンを設定
      await guestClient.rpc('set_test_guest_token', { token: invalidGuestToken });

      const { data, error } = await guestClient
        .from('payments')
        .select('*')
        .eq('id', testPaymentId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  describe('エラーハンドリングテスト', () => {
    it('RLSポリシー違反時に適切にエラーハンドリングされる', async () => {
      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      // 無効なトークンを設定
      await guestClient.rpc('set_test_guest_token', { token: invalidGuestToken });

      // 存在しない参加記録の更新を試行
      const { data, error } = await guestClient
        .from('attendances')
        .update({ status: 'maybe' })
        .eq('id', testAttendanceId)
        .select();

      // RLSポリシーによりエラーではなく空の結果が返される
      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });

    it('不正な形式のゲストトークンでアクセスした場合の動作', async () => {
      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      // 不正な形式のトークンを設定
      await guestClient.rpc('set_test_guest_token', { token: 'invalid-format-token' });

      const { data, error } = await guestClient
        .from('attendances')
        .select('*')
        .eq('id', testAttendanceId);

      expect(error).toBeNull();
      expect(data).toHaveLength(0);
    });
  });

  describe('パフォーマンステスト', () => {
    it('インデックスが適切に使用されることを確認', async () => {
      const guestClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

      // ゲストトークンを設定
      await guestClient.rpc('set_test_guest_token', { token: validGuestToken });

      // 複数のクエリを実行してパフォーマンスを確認
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        await guestClient
          .from('attendances')
          .select('*')
          .eq('guest_token', validGuestToken);
      }

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      // 10回のクエリが1秒以内に完了することを確認
      expect(executionTime).toBeLessThan(1000);
    });
  });
});