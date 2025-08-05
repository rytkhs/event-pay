import type { Event } from "@/types/event";
import { EVENT_STATUS } from "@/types/enums";
import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { AdminReason } from "@/lib/security/secure-client-factory.types";
import type { SupabaseClient } from "@supabase/supabase-js";

export class TestDataManager {
  private secureClientFactory: SecureSupabaseClientFactory;
  private authenticatedClient: SupabaseClient;

  constructor(supabaseClient?: SupabaseClient) {
    this.secureClientFactory = new SecureSupabaseClientFactory();

    // 通常のクライアント（RLS有効）
    this.authenticatedClient = supabaseClient || this.secureClientFactory.createAuthenticatedClient();
  }

  /**
   * 管理者権限が真に必要な場合のみ使用（監査付き）
   * テストデータのクリーンアップなど限定的な用途のみ
   */
  private async getAuditedAdminClient(reason: AdminReason, context: string): Promise<SupabaseClient> {
    return await this.secureClientFactory.createAuditedAdminClient(reason, context);
  }

  /**
   * 認証済みユーザーとしてイベントを作成（RLSポリシーを尊重）
   */
  async createTestEventWithAuth(
    eventData: Partial<Event> & { invite_token?: string } = {},
    userEmail: string = "test@example.com"
  ): Promise<Event> {
    // テストユーザーを作成または取得
    const user = await this.createTestUser({ email: userEmail });

    // 認証状態を設定
    await this.authenticatedClient.auth.setSession({
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

    // RLSポリシーを尊重してイベント作成
    const { data, error } = await this.authenticatedClient
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
    let authenticatedClient = this.authenticatedClient;

    if (!createdBy) {
      // 管理者権限でユーザー作成（テストデータセットアップのため）
      const adminClient = await this.getAuditedAdminClient(
        AdminReason.TEST_DATA_SETUP,
        "Creating test user for event creation"
      );

      const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
        email: `test-user-${uniqueId}@example.com`,
        password: "TestPassword123!",
        email_confirm: true,
      });

      if (createError || !authUser?.user) {
        throw new Error(`Failed to create auth user: ${createError?.message}`);
      }

      // public.usersテーブルにも対応するレコードを作成（RLSポリシーを尊重）
      const { error: publicUserError } = await this.authenticatedClient.from("users").insert({
        id: authUser.user.id,
        name: "テストユーザー",
      });

      if (publicUserError) {
        console.warn("Failed to create public user record:", publicUserError.message);
      }

      createdBy = authUser.user.id;

      // 作成したユーザーとして認証
      await authenticatedClient.auth.setSession({
        access_token: `test-token-${authUser.user.id}`,
        refresh_token: "test-refresh-token",
        user: authUser.user,
      });
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
      invite_token: eventData.invite_token || null,
      ...eventData,
    };

    // RLSポリシーを尊重してイベント作成
    const { data, error } = await authenticatedClient
      .from("events")
      .insert(defaultEvent)
      .select()
      .single();

    if (error) {
      console.error("Event creation error details:", {
        error,
        defaultEvent,
        createdBy,
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
      name: "テストユーザー",
      ...userData,
    };

    // 通常のサインアップ（RLSポリシーを尊重）
    const { data, error } = await this.authenticatedClient.auth.signUp({
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
    // ゲストトークンを生成（マイグレーション後はNOT NULL制約があるため必須）
    const { generateGuestToken } = await import("@/lib/utils/guest-token");

    const defaultAttendance = {
      status: "attending" as const,
      nickname: "テスト参加者",
      email: `test-attendee-${Date.now()}@example.com`,
      guest_token: generateGuestToken(), // gst_プレフィックス付き36文字
      ...attendanceData,
    };

    // 通常のクライアントでattendance作成（RLSポリシーを尊重）
    // イベント作成者として認証されている場合、attendanceを作成可能
    const { data, error } = await this.authenticatedClient
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

    // RLSポリシーを尊重してpayment作成
    // attendance_idが指定されている場合、そのattendanceに関連するpaymentとして作成
    const { data, error } = await this.authenticatedClient
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
    // イベント作成者（運営者）を動的に作成（管理者権限でユーザー作成のみ）
    const adminClient = await this.getAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      `Creating test creator and ${attendeeCount} attendees for event setup`
    );

    const uniqueId = `creator-${Date.now()}`;
    const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
      email: `test-creator-${uniqueId}@example.com`,
      password: "TestPassword123!",
      email_confirm: true,
    });

    if (createError || !authUser?.user) {
      throw new Error(`Failed to create creator user: ${createError?.message}`);
    }

    // 作成者として認証してpublic.usersレコードを作成（RLSポリシーを尊重）
    await this.authenticatedClient.auth.setSession({
      access_token: `test-token-${authUser.user.id}`,
      refresh_token: "test-refresh-token",
      user: authUser.user,
    });

    await this.authenticatedClient.from("users").insert({
      id: authUser.user.id,
      name: "動的作成された運営者",
    });

    const creator = {
      id: authUser.user.id,
      email: authUser.user.email,
      name: "動的作成された運営者",
      user: authUser.user,
    };

    // イベントを作成（RLSポリシーを尊重）
    const event = await this.createTestEvent({
      ...eventData,
      created_by: creator.id,
    });

    // 参加者も動的に作成
    const attendeeCreationPromises = [];
    for (let i = 0; i < attendeeCount; i++) {
      attendeeCreationPromises.push(
        (async () => {
          const attendeeId = `attendee-${i}-${Date.now()}-${Math.random()}`;
          const { data: attendeeAuthUser, error: attendeeCreateError } =
            await adminClient.auth.admin.createUser({
              email: `test-attendee-${attendeeId}@example.com`,
              password: "TestPassword123!",
              email_confirm: true,
            });

          if (attendeeCreateError || !attendeeAuthUser?.user) {
            throw new Error(`Failed to create attendee user ${i}: ${attendeeCreateError?.message}`);
          }

          // 参加者として一時的に認証してpublic.usersレコードを作成
          const tempClient = this.secureClientFactory.createAuthenticatedClient();
          await tempClient.auth.setSession({
            access_token: `test-token-${attendeeAuthUser.user.id}`,
            refresh_token: "test-refresh-token",
            user: attendeeAuthUser.user,
          });

          await tempClient.from("users").insert({
            id: attendeeAuthUser.user.id,
            name: `動的作成された参加者${i + 1}`,
          });

          // 作成者として再認証してattendanceを作成
          await this.authenticatedClient.auth.setSession({
            access_token: `test-token-${authUser.user.id}`,
            refresh_token: "test-refresh-token",
            user: authUser.user,
          });

          const attendance = await this.createTestAttendance({
            event_id: event.id,
            nickname: `参加者${i + 1}`,
            email: attendeeAuthUser.user.email,
            status: "attending",
          });

          return {
            attendance,
            attendee: {
              id: attendeeAuthUser.user.id,
              name: `動的作成された参加者${i + 1}`,
              email: attendeeAuthUser.user.email,
              user: attendeeAuthUser.user,
            },
          };
        })()
      );
    }

    const results = await Promise.all(attendeeCreationPromises);
    const attendances = results.map((r) => r.attendance);
    const attendees = results.map((r) => r.attendee);

    return {
      creator,
      event,
      attendances,
      attendees,
    };
  }

  async cleanup(): Promise<void> {
    // テストデータのクリーンアップ（管理者権限が真に必要）
    const adminClient = await this.getAuditedAdminClient(
      AdminReason.TEST_DATA_CLEANUP,
      "Cleaning up test data after test execution"
    );

    try {
      // 関連するテーブルから削除（外部キー制約の順序を考慮）
      await adminClient.from("payments").delete().neq("id", "");
      await adminClient.from("attendances").delete().neq("id", "");
      await adminClient.from("events").delete().neq("id", "");

      // テスト用のauth.usersも削除（email patternで識別）
      const { data: testUsers } = await adminClient.auth.admin.listUsers();
      if (testUsers?.users) {
        for (const user of testUsers.users) {
          if (
            user.email?.startsWith("test-user-") ||
            user.email?.startsWith("test-creator-") ||
            user.email?.startsWith("test-attendee-")
          ) {
            if (user.email.endsWith("@example.com")) {
              await adminClient.auth.admin.deleteUser(user.id);
            }
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
      await this.authenticatedClient.auth.setSession(user.session);
    }

    // 統合テストで直接アクセスできるユーザー情報を返す
    return {
      ...user,
      id: user.user?.id,
      email: user.user?.email,
      name: userData.name || "テストユーザー",
    };
  }

  async setupAuthenticatedEventTest(eventData: any = {}): Promise<any> {
    // auth.usersテーブルに実際のユーザーを作成（管理者権限でユーザー作成のみ）
    const adminClient = await this.getAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Creating authenticated user for event test"
    );

    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
      email: `test-user-${uniqueId}@example.com`,
      password: "TestPassword123!",
      email_confirm: true,
    });

    if (createError || !authUser?.user) {
      throw new Error(`Failed to create auth user: ${createError?.message}`);
    }

    // 作成したユーザーとして認証してpublic.usersレコードを作成（RLSポリシーを尊重）
    await this.authenticatedClient.auth.setSession({
      access_token: `test-token-${authUser.user.id}`,
      refresh_token: "test-refresh-token",
      user: authUser.user,
    });

    const { error: publicUserError } = await this.authenticatedClient.from("users").insert({
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
    // auth.usersテーブルに実際のユーザーを作成（管理者権限でユーザー作成のみ）
    const adminClient = await this.getAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Creating authenticated user for event test without token"
    );

    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
      email: `test-user-${uniqueId}@example.com`,
      password: "TestPassword123!",
      email_confirm: true,
    });

    if (createError || !authUser?.user) {
      throw new Error(`Failed to create auth user: ${createError?.message}`);
    }

    // 作成したユーザーとして認証してpublic.usersレコードを作成（RLSポリシーを尊重）
    await this.authenticatedClient.auth.setSession({
      access_token: `test-token-${authUser.user.id}`,
      refresh_token: "test-refresh-token",
      user: authUser.user,
    });

    const { error: publicUserError } = await this.authenticatedClient.from("users").insert({
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
      await this.authenticatedClient.auth.setSession({
        access_token: "test-token",
        refresh_token: "test-refresh-token",
        user: user.user,
      });
    }
  }

  async authenticateTestUser(userId: string): Promise<void> {
    // 管理者権限でマジックリンク生成（テスト認証のため）
    const adminClient = await this.getAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      `Generating magic link for test user: ${userId}`
    );

    const { error } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: `test-user-${userId}@example.com`,
    });

    if (error) {
      throw new Error(`Failed to authenticate test user: ${error.message}`);
    }
  }

  /**
   * ゲストトークンを使用したクライアントを作成
   */
  createGuestClient(guestToken: string): SupabaseClient {
    return this.secureClientFactory.createGuestClient(guestToken);
  }

  /**
   * 読み取り専用クライアントを作成
   */
  createReadOnlyClient(): SupabaseClient {
    return this.secureClientFactory.createReadOnlyClient();
  }
}
