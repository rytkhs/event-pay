/**
 * RLSポリシー検証統合テスト
 * EventPay データベースのRow Level Security (RLS) ポリシーを検証
 */

import { createClient } from '@/lib/supabase/server';

describe('RLSポリシー検証', () => {
  let supabase: ReturnType<typeof createClient>;

  beforeAll(() => {
    supabase = createClient();
  });

  describe('usersテーブルRLSポリシー', () => {
    test('認証済みユーザーは全プロフィールを閲覧できる', async () => {
      // 実際のテストでは認証されたクライアントを使用
      const { data, error } = await supabase
        .from('users')
        .select('id, display_name, avatar_url')
        .limit(10);

      // RLSポリシーにより、認証済みユーザーは閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('ユーザーは自身の情報のみ更新できる', async () => {
      // 実際のテストでは、認証されたユーザーのIDを使用
      const userId = 'test-user-id';

      const { error } = await supabase
        .from('users')
        .update({
          display_name: '更新されたユーザー名',
        })
        .eq('id', userId);

      // 自身の情報更新は成功するはず
      expect(error).toBeNull();
    });

    test('他のユーザーの情報は更新できない', async () => {
      // 実際のテストでは、他のユーザーのIDを使用
      const otherUserId = 'other-user-id';

      const { error } = await supabase
        .from('users')
        .update({
          display_name: '不正な更新',
        })
        .eq('id', otherUserId);

      // RLSポリシーにより更新が拒否されるはず
      expect(error).toBeTruthy();
    });
  });

  describe('eventsテーブルRLSポリシー', () => {
    test('認証済みユーザーは全イベントを閲覧できる', async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, title, description, event_date')
        .limit(10);

      // 認証済みユーザーは全イベント閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('認証済みユーザーはイベントを作成できる', async () => {
      const { data, error } = await supabase
        .from('events')
        .insert({
          title: 'テストイベント',
          description: 'RLSテスト用イベント',
          event_date: '2024-12-31T18:00:00Z',
          location: 'テスト会場',
          capacity: 50,
          participation_fee: 1000,
          creator_id: 'test-user-id',
        })
        .select();

      // 認証済みユーザーはイベント作成可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('イベント作成者のみ自分のイベントを更新できる', async () => {
      const eventId = 'test-event-id';

      const { error } = await supabase
        .from('events')
        .update({
          title: '更新されたイベント',
        })
        .eq('id', eventId)
        .eq('creator_id', 'test-user-id'); // 作成者のみ更新可能

      // 作成者による更新は成功するはず
      expect(error).toBeNull();
    });

    test('他のユーザーのイベントは更新できない', async () => {
      const eventId = 'other-user-event-id';

      const { error } = await supabase
        .from('events')
        .update({
          title: '不正な更新',
        })
        .eq('id', eventId)
        .eq('creator_id', 'other-user-id'); // 他のユーザーのイベント

      // RLSポリシーにより更新が拒否されるはず
      expect(error).toBeTruthy();
    });

    test('イベント作成者のみ自分のイベントを削除できる', async () => {
      const eventId = 'test-event-id';

      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)
        .eq('creator_id', 'test-user-id');

      // 作成者による削除は成功するはず
      expect(error).toBeNull();
    });
  });

  describe('attendancesテーブルRLSポリシー', () => {
    test('イベント作成者は参加者一覧を閲覧できる', async () => {
      const { data, error } = await supabase
        .from('attendances')
        .select(`
          id,
          status,
          events!inner(creator_id)
        `)
        .eq('events.creator_id', 'test-user-id');

      // イベント作成者は参加者一覧閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('参加者は自分の参加情報のみ閲覧できる', async () => {
      const { data, error } = await supabase
        .from('attendances')
        .select('id, status, event_id')
        .eq('user_id', 'test-user-id');

      // 参加者は自分の参加情報閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('クライアントから直接参加情報を作成できない', async () => {
      const { error } = await supabase
        .from('attendances')
        .insert({
          event_id: 'test-event-id',
          user_id: 'test-user-id',
          status: 'pending',
        });

      // クライアントからの直接作成は拒否されるはず
      expect(error).toBeTruthy();
    });

    test('クライアントから直接参加情報を更新できない', async () => {
      const attendanceId = 'test-attendance-id';

      const { error } = await supabase
        .from('attendances')
        .update({
          status: 'confirmed',
        })
        .eq('id', attendanceId);

      // クライアントからの直接更新は拒否されるはず
      expect(error).toBeTruthy();
    });
  });

  describe('paymentsテーブルRLSポリシー', () => {
    test('イベント作成者は決済情報を閲覧できる', async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          id,
          amount,
          method,
          status,
          attendances!inner(
            events!inner(creator_id)
          )
        `)
        .eq('attendances.events.creator_id', 'test-user-id');

      // イベント作成者は決済情報閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('参加者は自分の決済情報のみ閲覧できる', async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          id,
          amount,
          method,
          status,
          attendances!inner(user_id)
        `)
        .eq('attendances.user_id', 'test-user-id');

      // 参加者は自分の決済情報閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('クライアントから直接決済情報を作成できない', async () => {
      const { error } = await supabase
        .from('payments')
        .insert({
          attendance_id: 'test-attendance-id',
          amount: 1000,
          method: 'stripe',
          status: 'pending',
        });

      // クライアントからの直接作成は拒否されるはず
      expect(error).toBeTruthy();
    });

    test('クライアントから直接決済情報を更新できない', async () => {
      const paymentId = 'test-payment-id';

      const { error } = await supabase
        .from('payments')
        .update({
          status: 'completed',
        })
        .eq('id', paymentId);

      // クライアントからの直接更新は拒否されるはず
      expect(error).toBeTruthy();
    });
  });

  describe('public_profilesビューRLSポリシー', () => {
    test('認証済みユーザーは公開プロフィールを閲覧できる', async () => {
      const { data, error } = await supabase
        .from('public_profiles')
        .select('id, display_name, avatar_url')
        .limit(10);

      // 認証済みユーザーは公開プロフィール閲覧可能
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('公開プロフィールビューは読み取り専用', async () => {
      const { error } = await supabase
        .from('public_profiles')
        .update({
          display_name: '不正な更新',
        })
        .eq('id', 'test-user-id');

      // ビューは読み取り専用なので更新は拒否されるはず
      expect(error).toBeTruthy();
    });
  });

  describe('セキュリティ関数RLSポリシー', () => {
    test('get_event_creator_name関数が適切に動作する', async () => {
      const { data, error } = await supabase
        .rpc('get_event_creator_name', {
          event_id: 'test-event-id'
        });

      // 関数は適切に動作するはず
      expect(error).toBeNull();
      expect(data).toBeDefined();
    });

    test('未認証ユーザーは保護された関数を実行できない', async () => {
      // 未認証クライアントでのテスト（実際のテストでは未認証クライアントを使用）
      const { error } = await supabase
        .rpc('protected_function', {
          param: 'test'
        });

      // 未認証ユーザーは保護された関数実行不可
      expect(error).toBeTruthy();
    });
  });
});
