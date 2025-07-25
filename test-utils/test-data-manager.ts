import { createClient } from "@supabase/supabase-js";
import type { Event } from "@/types/event";
import { EVENT_STATUS } from "@/types/enums";

export class TestDataManager {
  private supabase: any;
  private adminSupabase: any;

  constructor(supabaseClient?: any) {
    // 通常のクライアント（RLS有効）
    this.supabase =
      supabaseClient ||
      createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
          "SUPABASE_ANON_KEY_REDACTED",
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
        }
      );

    // 管理者クライアント（RLSバイパス用）
    this.adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        "SUPABASE_SERVICE_ROLE_KEY_REDACTED",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );
  }

  // 管理者クライアントへのアクセサー
  get adminClient() {
    return this.adminSupabase;
  }

  /**
   * 認証済みユーザーとしてイベントを作成
   */
  async createTestEventWithAuth(
    eventData: Partial<Event> & { invite_token?: string } = {},
    userEmail: string = "test@example.com"
  ): Promise<Event> {
    // テストユーザーを作成または取得
    const user = await this.createTestUser({ email: userEmail });

    // 認証状態を設定
    await this.supabase.auth.setSession({
      access_token: `test-token-${user.id}`,
      refresh_token: "test-refresh-token",
      user: user,
    });

    const defaultEvent = {
      title: "テストイベント",
      date: new Date(Date.now() + 86400000).toISOString(), // 明日
      location: "テスト会場",
      fee: 1000,
      capacity: 50,
      status: EVENT_STATUS.UPCOMING,
      payment_methods: ["stripe"],
      created_by: user.id,
      invite_token: eventData.invite_token || null,
      ...eventData,
    };

    const { data, error } = await this.supabase
      .from("events")
      .insert(defaultEvent)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test event: ${error.message}`);
    }

    return data;
  }

  async createTestEvent(
    eventData: Partial<Event> & { invite_token?: string; created_by?: string } = {}
  ): Promise<Event> {
    // created_byが指定されていない場合は、認証ユーザーを作成
    let createdBy = eventData.created_by;
    if (!createdBy) {
      // auth.usersテーブルに実際のユーザーを作成
      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const { data: authUser, error: createError } = await this.adminSupabase.auth.admin.createUser(
        {
          email: `test-user-${uniqueId}@example.com`,
          password: "TestPassword123!",
          email_confirm: true,
        }
      );

      if (createError || !authUser?.user) {
        throw new Error(`Failed to create auth user: ${createError?.message}`);
      }

      // public.usersテーブルにも対応するレコードを作成
      const { error: publicUserError } = await this.adminSupabase.from("users").insert({
        id: authUser.user.id,
        name: "テストユーザー",
      });

      if (publicUserError) {
        console.warn("Failed to create public user record:", publicUserError.message);
      }

      createdBy = authUser.user.id;
    }

    const futureDate = new Date(Date.now() + 86400000); // 明日
    const defaultEvent = {
      title: "テストイベント",
      date: futureDate.toISOString(),
      location: "テスト会場",
      fee: 1000,
      capacity: 50,
      status: EVENT_STATUS.UPCOMING,
      payment_methods: ["stripe"],
      created_by: createdBy,
      // invite_tokenは明示的に設定されない限りnullにする
      // これによりgenerateInviteTokenAction()が正しく新しいトークンを生成する
      invite_token: eventData.invite_token || null,
      ...eventData,
    };

    // 管理者権限でイベント作成（RLSバイパス）
    const { data, error } = await this.adminSupabase
      .from("events")
      .insert(defaultEvent)
      .select()
      .single();

    if (error) {
      console.error("Event creation error details:", {
        error,
        defaultEvent,
        createdBy,
        adminSupabaseCheck: this.adminSupabase ? "initialized" : "not initialized",
      });
      throw new Error(`Failed to create test event: ${error.message} (Code: ${error.code})`);
    }

    return data;
  }

  async createTestUser(userData: any = {}): Promise<any> {
    const defaultUser = {
      email: `test-${Date.now()}@example.com`,
      password: "TestPassword123!",
      display_name: "テストユーザー",
      name: "テストユーザー", // テスト用のname追加
      ...userData,
    };

    const { data, error } = await this.supabase.auth.signUp({
      email: defaultUser.email,
      password: defaultUser.password,
      options: {
        data: {
          display_name: defaultUser.display_name,
        },
      },
    });

    if (error) {
      throw new Error(`Failed to create test user: ${error.message}`);
    }

    // データベース統合テストのために適切な構造を返す
    if (data.user) {
      const userResult = {
        user: {
          id: data.user.id,
          email: data.user.email,
          user_metadata: data.user.user_metadata,
          app_metadata: data.user.app_metadata,
        },
        session: data.session,
        // テスト用の追加プロパティ
        id: data.user.id,
        email: data.user.email,
        name: defaultUser.name,
      };
      return userResult;
    }

    return data;
  }

  async createTestAttendance(attendanceData: any = {}): Promise<any> {
    const defaultAttendance = {
      status: "attending" as const,
      nickname: "テスト参加者",
      email: `test-attendee-${Date.now()}@example.com`,
      ...attendanceData,
    };

    const { data, error } = await this.adminSupabase
      .from("attendances")
      .insert(defaultAttendance)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test attendance: ${error.message}`);
    }

    return data;
  }

  async createTestPayment(paymentData: any = {}): Promise<any> {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const defaultPayment = {
      amount: 1000,
      method: "stripe" as const,
      stripe_payment_intent_id: `pi_test_${uniqueId}`, // CHECK制約対応 + ユニーク性確保
      status: "pending" as const,
      ...paymentData,
    };

    // RLSポリシーを回避するためadminSupabaseを使用
    const { data, error } = await this.adminSupabase
      .from("payments")
      .insert(defaultPayment)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create test payment: ${error.message}`);
    }

    return data;
  }

  async setupEventWithAttendees(eventData: any = {}, attendeeCount: number = 1): Promise<any> {
    // 既存のシードデータユーザーを使用
    const creator = {
      id: "a0000000-0000-0000-0000-000000000001",
      email: "creator@test.com",
      name: "認証済み運営者",
      user: {
        id: "a0000000-0000-0000-0000-000000000001",
        email: "creator@test.com",
      },
    };

    // イベントを作成
    const event = await this.createTestEvent({
      ...eventData,
      created_by: creator.id,
    });

    // 参加者として既存のユーザーを使用
    const attendances = [];
    const attendeeIds = [
      "b0000000-0000-0000-0000-000000000001", // 参加者アリス
      "b0000000-0000-0000-0000-000000000002", // 参加者ボブ
    ];

    for (let i = 0; i < Math.min(attendeeCount, attendeeIds.length); i++) {
      const attendance = await this.createTestAttendance({
        event_id: event.id,
        nickname: `参加者${i + 1}`,
        email: `attendee${i + 1}@test.com`,
        status: "attending",
      });
      attendances.push(attendance);
    }

    return {
      creator,
      event,
      attendances,
      attendees: attendances.map((a, i) => ({
        id: attendeeIds[i],
        name: `参加者${i + 1}`,
        email: `attendee${i + 1}@test.com`,
      })),
    };
  }

  async cleanup(): Promise<void> {
    // テストデータのクリーンアップ
    try {
      // 関連するテーブルから削除（外部キー制約の順序を考慮）
      await this.adminSupabase.from("payments").delete().neq("id", "");
      await this.adminSupabase.from("attendances").delete().neq("id", "");
      await this.adminSupabase.from("events").delete().neq("id", "");

      // テスト用のauth.usersも削除（email patternで識別）
      const { data: testUsers } = await this.adminSupabase.auth.admin.listUsers();
      if (testUsers?.users) {
        for (const user of testUsers.users) {
          if (user.email?.startsWith("test-user-") && user.email.endsWith("@example.com")) {
            await this.adminSupabase.auth.admin.deleteUser(user.id);
          }
        }
      }
    } catch (error) {
      console.warn("Cleanup failed:", error);
    }
  }

  async createAuthenticatedUser(userData: any = {}): Promise<any> {
    const user = await this.createTestUser(userData);

    // テスト環境では認証状態をシミュレート
    if (user.user && user.session) {
      await this.supabase.auth.setSession(user.session);
    }

    //統合テストで直接アクセスできるユーザー情報を返す
    return {
      ...user,
      id: user.user?.id,
      email: user.user?.email,
      name: userData.name || "テストユーザー",
    };
  }

  async setupAuthenticatedEventTest(eventData: any = {}): Promise<any> {
    // auth.usersテーブルに実際のユーザーを作成
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const { data: authUser, error: createError } = await this.adminSupabase.auth.admin.createUser({
      email: `test-user-${uniqueId}@example.com`,
      password: "TestPassword123!",
      email_confirm: true,
    });

    if (createError || !authUser?.user) {
      throw new Error(`Failed to create auth user: ${createError?.message}`);
    }

    // public.usersテーブルにも対応するレコードを作成
    const { error: publicUserError } = await this.adminSupabase.from("users").insert({
      id: authUser.user.id,
      name: "テストユーザー",
    });

    if (publicUserError) {
      console.warn("Failed to create public user record:", publicUserError.message);
    }

    const creator = {
      user: authUser.user,
      id: authUser.user.id,
      email: authUser.user.email,
      name: "テストユーザー",
    };

    const event = await this.createTestEvent({
      ...eventData,
      created_by: creator.user?.id,
    });

    return { creator, event };
  }

  /**
   * 認証済みユーザーとしてイベントを作成（トークンなし）
   */
  async setupAuthenticatedEventTestWithoutToken(eventData: any = {}): Promise<any> {
    // auth.usersテーブルに実際のユーザーを作成
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const { data: authUser, error: createError } = await this.adminSupabase.auth.admin.createUser({
      email: `test-user-${uniqueId}@example.com`,
      password: "TestPassword123!",
      email_confirm: true,
    });

    if (createError || !authUser?.user) {
      throw new Error(`Failed to create auth user: ${createError?.message}`);
    }

    // public.usersテーブルにも対応するレコードを作成
    const { error: publicUserError } = await this.adminSupabase.from("users").insert({
      id: authUser.user.id,
      name: "テストユーザー",
    });

    if (publicUserError) {
      console.warn("Failed to create public user record:", publicUserError.message);
    }

    const creator = {
      user: authUser.user,
      id: authUser.user.id,
      email: authUser.user.email,
      name: "テストユーザー",
    };

    // invite_tokenを明示的にnullに設定して、generateInviteTokenAction()がテストできるようにする
    const event = await this.createTestEvent({
      ...eventData,
      created_by: creator.user?.id,
      invite_token: null, // 明示的にnullを設定
    });

    return { creator, event };
  }

  async authenticateAsUser(user: any): Promise<void> {
    if (user.user) {
      await this.supabase.auth.setSession({
        access_token: "test-token",
        refresh_token: "test-refresh-token",
        user: user.user,
      });
    }
  }

  async authenticateTestUser(userId: string): Promise<void> {
    const { error } = await this.supabase.auth.admin.generateLink({
      type: "magiclink",
      email: `test-user-${userId}@example.com`,
    });

    if (error) {
      throw new Error(`Failed to authenticate test user: ${error.message}`);
    }
  }
}
