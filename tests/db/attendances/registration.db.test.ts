import { describe, expect } from "vitest";

import type { AppDatabase, AppSupabaseClient } from "@core/types/supabase";

import { test } from "../../fixtures/rsvp";

type AttendanceStatus = AppDatabase["public"]["Enums"]["attendance_status_enum"];

async function registerAttendance(
  client: AppSupabaseClient,
  input: {
    eventId: string;
    nickname: string;
    email: string;
    status: AttendanceStatus;
    guestToken: string;
  }
) {
  return client.rpc("register_attendance_with_payment", {
    p_event_id: input.eventId,
    p_nickname: input.nickname,
    p_email: input.email,
    p_status: input.status,
    p_guest_token: input.guestToken,
    p_event_fee: 0,
  });
}

describe("初回RSVP", () => {
  test("参加回答を1件登録できる", async ({ adminClient, anonClient, event, rsvp, unique }) => {
    const guestToken = rsvp.createGuestToken("tracer");
    const { data: attendanceId, error } = await registerAttendance(anonClient, {
      eventId: event.id,
      nickname: "テスト参加者",
      email: unique.email("tracer"),
      status: "attending",
      guestToken,
    });

    expect(error).toBeNull();
    expect(attendanceId).toEqual(expect.any(String));

    const { data, error: readError } = await adminClient
      .from("attendances")
      .select("event_id, status, guest_token")
      .eq("id", attendanceId as string)
      .single();

    expect(readError).toBeNull();
    expect(data).toEqual({
      event_id: event.id,
      status: "attending",
      guest_token: guestToken,
    });
  });

  test("満員のイベントへ2件目の参加回答を登録できない", async ({
    adminClient,
    anonClient,
    event,
    rsvp,
    unique,
  }) => {
    await rsvp.createAttendance({ eventId: event.id, label: "occupied" });

    const { data, error } = await registerAttendance(anonClient, {
      eventId: event.id,
      nickname: "2人目",
      email: unique.email("second"),
      status: "attending",
      guestToken: rsvp.createGuestToken("second"),
    });

    expect(data).toBeNull();
    expect(error?.code).toBe("P0001");

    const { count, error: countError } = await adminClient
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "attending");

    expect(countError).toBeNull();
    expect(count).toBe(1);
  });

  describe.each(["maybe", "not_attending"] as const)("%sの初回回答", (status) => {
    test("満員でも登録でき、定員を消費しない", async ({
      adminClient,
      anonClient,
      event,
      rsvp,
      unique,
    }) => {
      await rsvp.createAttendance({ eventId: event.id, label: `occupied-${status}` });

      const { data, error } = await registerAttendance(anonClient, {
        eventId: event.id,
        nickname: `回答-${status}`,
        email: unique.email(status),
        status,
        guestToken: rsvp.createGuestToken(status),
      });

      expect(error).toBeNull();
      expect(data).toEqual(expect.any(String));

      const { count, error: countError } = await adminClient
        .from("attendances")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("status", "attending");

      expect(countError).toBeNull();
      expect(count).toBe(1);
    });
  });

  test("定員1名への同時参加回答は1件だけ成功する", async ({ adminClient, event, rsvp, unique }) => {
    const firstClient = rsvp.createPublicClient();
    const secondClient = rsvp.createPublicClient();

    const results = await Promise.all([
      registerAttendance(firstClient, {
        eventId: event.id,
        nickname: "同時回答A",
        email: unique.email("concurrent-a"),
        status: "attending",
        guestToken: rsvp.createGuestToken("concurrent-a"),
      }),
      registerAttendance(secondClient, {
        eventId: event.id,
        nickname: "同時回答B",
        email: unique.email("concurrent-b"),
        status: "attending",
        guestToken: rsvp.createGuestToken("concurrent-b"),
      }),
    ]);

    expect(results.map((result) => result.error?.code ?? "success").sort()).toEqual([
      "P0001",
      "success",
    ]);

    const { count, error } = await adminClient
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "attending");

    expect(error).toBeNull();
    expect(count).toBe(1);
  });

  test("同一イベントではメールアドレスの大文字小文字を区別せず重複を拒否する", async ({
    adminClient,
    anonClient,
    rsvp,
  }) => {
    const event = await rsvp.createEvent({ capacity: null });
    await registerAttendance(anonClient, {
      eventId: event.id,
      nickname: "先の回答",
      email: "duplicate@example.com",
      status: "maybe",
      guestToken: rsvp.createGuestToken("duplicate-first"),
    });

    const { data, error } = await registerAttendance(anonClient, {
      eventId: event.id,
      nickname: "後の回答",
      email: "DUPLICATE@EXAMPLE.COM",
      status: "not_attending",
      guestToken: rsvp.createGuestToken("duplicate-second"),
    });

    expect(data).toBeNull();
    expect(error?.code).toBe("23505");

    const { count, error: countError } = await adminClient
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);

    expect(countError).toBeNull();
    expect(count).toBe(1);
  });

  test("同じメールアドレスの同時回答は1件だけ成功する", async ({ adminClient, rsvp }) => {
    const event = await rsvp.createEvent({ capacity: null });
    const firstClient = rsvp.createPublicClient();
    const secondClient = rsvp.createPublicClient();

    const results = await Promise.all([
      registerAttendance(firstClient, {
        eventId: event.id,
        nickname: "重複回答A",
        email: "concurrent-duplicate@example.com",
        status: "maybe",
        guestToken: rsvp.createGuestToken("email-concurrent-a"),
      }),
      registerAttendance(secondClient, {
        eventId: event.id,
        nickname: "重複回答B",
        email: "CONCURRENT-DUPLICATE@EXAMPLE.COM",
        status: "not_attending",
        guestToken: rsvp.createGuestToken("email-concurrent-b"),
      }),
    ]);

    expect(results.map((result) => result.error?.code ?? "success").sort()).toEqual([
      "23505",
      "success",
    ]);

    const { count, error } = await adminClient
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id);

    expect(error).toBeNull();
    expect(count).toBe(1);
  });
});
