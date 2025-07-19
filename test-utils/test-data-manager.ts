import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Event } from "@/types/event";

export class TestDataManager {
  private supabase: any;

  constructor(supabaseClient?: any) {
    this.supabase = supabaseClient || createServerSupabaseClient();
  }

  async createTestEvent(eventData: Partial<Event> = {}): Promise<Event> {
    const defaultEvent = {
      title: "テストイベント",
      description: "テスト用のイベントです",
      date: new Date(Date.now() + 86400000).toISOString(), // 明日
      location: "テスト会場",
      fee: 1000,
      capacity: 50,
      status: "draft" as const,
      payment_methods: ["stripe"],
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

  async createTestUser(userData: any = {}): Promise<any> {
    const defaultUser = {
      email: `test-${Date.now()}@example.com`,
      password: "TestPassword123!",
      display_name: "テストユーザー",
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

    return data;
  }

  async createTestAttendance(attendanceData: any = {}): Promise<any> {
    const defaultAttendance = {
      status: "attending" as const,
      payment_status: "pending" as const,
      ...attendanceData,
    };

    const { data, error } = await this.supabase
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
    const defaultPayment = {
      amount: 1000,
      method: "stripe" as const,
      status: "pending" as const,
      ...paymentData,
    };

    const { data, error } = await this.supabase
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
    // イベント作成者を作成
    const creator = await this.createTestUser();
    
    // イベントを作成
    const event = await this.createTestEvent({
      ...eventData,
      created_by: creator.user?.id,
    });

    // 参加者を作成
    const attendances = [];
    for (let i = 0; i < attendeeCount; i++) {
      const attendee = await this.createTestUser();
      const attendance = await this.createTestAttendance({
        event_id: event.id,
        user_id: attendee.user?.id,
      });
      attendances.push(attendance);
    }

    return {
      creator,
      event,
      attendances,
    };
  }

  async cleanup(): Promise<void> {
    // テストデータのクリーンアップ
    try {
      await this.supabase.from("payments").delete().neq("id", "");
      await this.supabase.from("attendances").delete().neq("id", "");
      await this.supabase.from("events").delete().neq("id", "");
    } catch (error) {
      console.warn("Cleanup failed:", error);
    }
  }

  async createAuthenticatedUser(userData: any = {}): Promise<any> {
    const user = await this.createTestUser(userData);
    
    // テスト環境では認証状態をシミュレート
    if (user.user) {
      await this.supabase.auth.setSession({
        access_token: 'test-token',
        refresh_token: 'test-refresh-token',
        user: user.user,
      });
    }

    return user;
  }

  async setupAuthenticatedEventTest(eventData: any = {}): Promise<any> {
    const creator = await this.createAuthenticatedUser();
    const event = await this.createTestEvent({
      ...eventData,
      created_by: creator.user?.id,
    });

    return { creator, event };
  }

  async authenticateAsUser(user: any): Promise<void> {
    if (user.user) {
      await this.supabase.auth.setSession({
        access_token: 'test-token',
        refresh_token: 'test-refresh-token', 
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