import { randomBytes } from "node:crypto";

import { getSecureClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { generateInviteToken } from "@core/utils/invite-token";

import type { Database } from "@/types/database";

type EventInsert = Database["public"]["Tables"]["events"]["Insert"];

export interface TestEvent {
  id: string;
  title: string;
  date: string;
  fee: number;
  capacity: number | null;
  invite_token: string;
  created_by: string;
  payment_methods?: Database["public"]["Enums"]["payment_method_enum"][];
  participants?: Array<{ email: string; nickname: string }>;
}

export interface CreateTestEventOptions {
  title?: string;
  date?: string;
  fee?: number;
  capacity?: number | null;
  payment_methods?: Database["public"]["Enums"]["payment_method_enum"][];
  location?: string;
  description?: string;
  registration_deadline?: string | null;
  payment_deadline?: string | null;
  canceled_at?: string | null;
}

/**
 * テスト用イベントを作成する
 *
 * @param createdBy イベント作成者のユーザーID
 * @param options イベントのオプション設定
 * @returns 作成されたイベント情報
 */
export async function createTestEvent(
  createdBy: string,
  options: CreateTestEventOptions = {}
): Promise<TestEvent> {
  const secureFactory = getSecureClientFactory();

  // 監査付き管理者クライアントを作成
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `Creating test event for E2E tests`,
    {
      operationType: "INSERT",
      accessedTables: ["public.events"],
      additionalInfo: {
        testContext: "playwright-e2e-setup",
        createdBy,
      },
    }
  );

  // 将来の日時を生成（現在時刻から1時間後）
  const futureDate = new Date(Date.now() + 60 * 60 * 1000);
  const futureDateString = futureDate.toISOString();

  // デフォルトの申込締切（イベント開始30分前）
  const defaultRegistrationDeadline = new Date(futureDate.getTime() - 30 * 60 * 1000).toISOString();

  // 招待トークンを生成
  const inviteToken = generateInviteToken();

  // デフォルト値を設定
  const defaultOptions: Required<Omit<CreateTestEventOptions, "date">> & { date: string } = {
    title: "テスト用イベント",
    date: futureDateString,
    fee: 0, // デフォルトは無料
    capacity: null, // デフォルトは定員なし
    payment_methods: [],
    location: "テスト会場",
    description: "E2Eテスト用のイベントです",
    registration_deadline: defaultRegistrationDeadline,
    payment_deadline: null,
    canceled_at: null,
  };

  const eventOptions = { ...defaultOptions, ...options };

  // 有料イベントの場合、payment_methodsが空ならstripeを設定
  if (eventOptions.fee > 0 && eventOptions.payment_methods.length === 0) {
    eventOptions.payment_methods = ["stripe"];
  }

  // イベントデータを構築
  const eventData: EventInsert = {
    title: eventOptions.title,
    date: eventOptions.date,
    location: eventOptions.location,
    description: eventOptions.description,
    fee: eventOptions.fee,
    capacity: eventOptions.capacity,
    payment_methods: eventOptions.payment_methods,
    registration_deadline: eventOptions.registration_deadline || defaultRegistrationDeadline,
    payment_deadline: eventOptions.payment_deadline || null,
    canceled_at: eventOptions.canceled_at ?? null,
    invite_token: inviteToken,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };

  // データベースにイベントを作成
  const { data: createdEvent, error } = await adminClient
    .from("events")
    .insert(eventData)
    .select()
    .single();

  if (error) {
    console.error("Failed to create test event:", error);
    throw new Error(`Failed to create test event: ${error.message}`);
  }

  if (!createdEvent) {
    throw new Error("Event creation succeeded but event data is missing");
  }

  console.log(`Test event created successfully: ${eventOptions.title} (ID: ${createdEvent.id})`);

  return {
    id: createdEvent.id,
    title: createdEvent.title,
    date: createdEvent.date,
    fee: createdEvent.fee,
    capacity: createdEvent.capacity,
    invite_token: createdEvent.invite_token,
    created_by: createdEvent.created_by,
    payment_methods: createdEvent.payment_methods,
  };
}

function generateTestGuestToken(): string {
  const randomPart = randomBytes(24).toString("base64url");
  return `gst_${randomPart.slice(0, 32)}`;
}

/**
 * 複数の参加者が既に登録されているテストイベントを作成する
 *
 * @param createdBy イベント作成者のユーザーID
 * @param options イベントのオプション設定
 * @param participantCount 事前に作成する参加者数
 * @returns 作成されたイベント情報
 */
export async function createTestEventWithParticipants(
  createdBy: string,
  options: CreateTestEventOptions = {},
  participantCount: number = 1
): Promise<TestEvent> {
  // イベントを作成
  const event = await createTestEvent(createdBy, options);

  // 参加者を作成
  const secureFactory = getSecureClientFactory();
  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_SETUP,
    `Creating test participants for event ${event.id}`,
    {
      operationType: "INSERT",
      accessedTables: ["public.attendances"],
      additionalInfo: {
        testContext: "playwright-e2e-setup",
        eventId: event.id,
        participantCount,
      },
    }
  );

  // 参加者データを作成
  // 参加者データを作成
  const participants = Array.from({ length: participantCount }, (_, i) => {
    // タイムスタンプとインデックスを組み合わせてユニークなサフィックスを生成
    const uniqueSuffix = `${Date.now()}-${i}`;
    return {
      event_id: event.id,
      nickname: `テスト参加者${i + 1}`,
      email: `test-participant-${uniqueSuffix}@example.com`,
      status: "attending" as const,
      guest_token: generateTestGuestToken(),
    };
  });

  const { error: participantError } = await adminClient.from("attendances").insert(participants);

  if (participantError) {
    console.error("Failed to create test participants:", participantError);
    // 参加者作成に失敗した場合、イベントを削除してロールバック
    await adminClient.from("events").delete().eq("id", event.id);
    throw new Error(`Failed to create test participants: ${participantError.message}`);
  }

  console.log(`Created ${participantCount} test participants for event ${event.id}`);

  return {
    ...event,
    participants: participants.map((p) => ({ email: p.email, nickname: p.nickname })),
  };
}

/**
 * テストイベントを削除する
 *
 * @param eventId 削除するイベントID
 */
export async function deleteTestEvent(eventId: string): Promise<void> {
  const secureFactory = getSecureClientFactory();

  const adminClient = await secureFactory.createAuditedAdminClient(
    AdminReason.TEST_DATA_CLEANUP,
    `Deleting test event after E2E tests: ${eventId}`,
    {
      operationType: "DELETE",
      accessedTables: ["public.events", "public.attendances", "public.payments"],
      additionalInfo: {
        testContext: "playwright-e2e-cleanup",
        eventId,
      },
    }
  );

  // 関連する参加者と決済データを先に削除
  await adminClient.from("payments").delete().eq("event_id", eventId);
  await adminClient.from("attendances").delete().eq("event_id", eventId);

  // イベントを削除
  const { error } = await adminClient.from("events").delete().eq("id", eventId);

  if (error) {
    console.error("Failed to delete test event:", error);
    throw new Error(`Failed to delete test event: ${error.message}`);
  }

  console.log(`Test event deleted successfully: ${eventId}`);
}

/**
 * テスト用の有料イベントを作成する便利関数
 */
export async function createPaidTestEvent(
  createdBy: string,
  fee: number = 1000,
  capacity: number | null = null
): Promise<TestEvent> {
  // 有料イベントの場合は payment_deadline も必要
  const futureDate = new Date(Date.now() + 60 * 60 * 1000);
  const paymentDeadline = new Date(futureDate.getTime() - 15 * 60 * 1000).toISOString(); // イベント開始15分前

  return createTestEvent(createdBy, {
    title: `有料テストイベント（${fee}円）`,
    fee,
    capacity,
    payment_methods: ["stripe"],
    payment_deadline: paymentDeadline,
  });
}

/**
 * テスト用の定員ありイベントを作成する便利関数
 */
export async function createCapacityLimitedTestEvent(
  createdBy: string,
  capacity: number,
  fee: number = 0
): Promise<TestEvent> {
  return createTestEvent(createdBy, {
    title: `定員${capacity}名のテストイベント`,
    fee,
    capacity,
    payment_methods: fee > 0 ? ["stripe"] : [],
  });
}

/**
 * 定員いっぱいのテストイベントを作成する便利関数
 */
export async function createFullCapacityTestEvent(
  createdBy: string,
  capacity: number,
  fee: number = 0
): Promise<TestEvent> {
  return createTestEventWithParticipants(
    createdBy,
    {
      title: `定員満了テストイベント（${capacity}名）`,
      fee,
      capacity,
      payment_methods: fee > 0 ? ["stripe"] : [],
    },
    capacity
  );
}
