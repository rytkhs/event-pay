import { createHash } from "node:crypto";

import type { AppDatabase, AppSupabaseClient } from "@core/types/supabase";

import { createLocalAnonClient } from "../setup/local-supabase";

import { test as communityTest } from "./community";

type AttendanceStatus = AppDatabase["public"]["Enums"]["attendance_status_enum"];
type PaymentMethod = AppDatabase["public"]["Enums"]["payment_method_enum"];

export type TestEvent = {
  id: string;
  communityId: string;
  capacity: number | null;
};

export type TestAttendance = {
  id: string;
  eventId: string;
  email: string;
  guestToken: string;
  status: AttendanceStatus;
};

type CreateEventOptions = {
  capacity?: number | null;
  fee?: number;
  paymentMethods?: PaymentMethod[];
  /**
   * 支払期限。`payment_methods` に `stripe` を含めるときは必須
   * （`events_payment_deadline_required_if_stripe`）。
   */
  paymentDeadline?: string;
};

type CreateAttendanceOptions = {
  eventId: string;
  status?: AttendanceStatus;
  email?: string;
  guestToken?: string;
  label?: string;
};

type RsvpFactory = {
  createEvent(options?: CreateEventOptions): Promise<TestEvent>;
  createAttendance(options: CreateAttendanceOptions): Promise<TestAttendance>;
  createGuestToken(label?: string): string;
  createPublicClient(): AppSupabaseClient;
};

type RsvpFixtures = {
  event: TestEvent;
  rsvp: RsvpFactory;
};

const REGISTRATION_DEADLINE = "2099-05-31T00:00:00.000Z";
const EVENT_DATE = "2099-06-01T00:00:00.000Z";

export const test = communityTest.extend<RsvpFixtures>({
  rsvp: async ({ adminClient, community, organizer, unique }, use) => {
    const createGuestToken = (label = "guest") => {
      const body = createHash("sha256")
        .update(`${unique.token}:${label}`)
        .digest("base64url")
        .slice(0, 32);
      return `gst_${body}`;
    };

    const createEvent = async (options: CreateEventOptions = {}): Promise<TestEvent> => {
      const capacity = options.capacity === undefined ? 1 : options.capacity;
      const { data, error } = await adminClient
        .from("events")
        .insert({
          community_id: community.id,
          created_by: organizer.id,
          title: `テストイベント-${unique.token.slice(0, 8)}`,
          date: EVENT_DATE,
          registration_deadline: REGISTRATION_DEADLINE,
          fee: options.fee ?? 0,
          capacity,
          payment_methods: options.paymentMethods ?? ["cash"],
          payment_deadline: options.paymentDeadline ?? null,
        })
        .select("id, community_id, capacity")
        .single();

      if (error || !data) {
        throw new Error(`テストイベントの作成に失敗しました: ${error?.message ?? "row が空です"}`);
      }

      return { id: data.id, communityId: data.community_id, capacity: data.capacity };
    };

    const createAttendance = async (options: CreateAttendanceOptions): Promise<TestAttendance> => {
      const label = options.label ?? "attendance";
      const email = options.email ?? unique.email(label);
      const guestToken = options.guestToken ?? createGuestToken(label);
      const status = options.status ?? "attending";
      const { data, error } = await adminClient
        .from("attendances")
        .insert({
          event_id: options.eventId,
          nickname: `テスト参加者-${label}`,
          email,
          status,
          guest_token: guestToken,
        })
        .select("id, event_id, email, guest_token, status")
        .single();

      if (error || !data) {
        throw new Error(`テスト出欠の作成に失敗しました: ${error?.message ?? "row が空です"}`);
      }

      return {
        id: data.id,
        eventId: data.event_id,
        email: data.email,
        guestToken: data.guest_token,
        status: data.status,
      };
    };

    await use({
      createAttendance,
      createEvent,
      createGuestToken,
      createPublicClient: createLocalAnonClient,
    });
  },

  event: async ({ rsvp }, use) => {
    await use(await rsvp.createEvent());
  },
});
