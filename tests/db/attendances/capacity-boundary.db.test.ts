import { describe, expect } from "vitest";

import { test } from "../../fixtures/rsvp";

describe("出欠変更の定員境界", () => {
  describe.each(["maybe", "not_attending"] as const)("%sから参加への変更", (status) => {
    test("満員時は拒否され、元の出欠が維持される", async ({
      adminClient,
      anonClient,
      event,
      rsvp,
    }) => {
      await rsvp.createAttendance({ eventId: event.id, label: `occupied-${status}` });
      const target = await rsvp.createAttendance({
        eventId: event.id,
        label: `guest-target-${status}`,
        status,
      });

      const { error } = await anonClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: target.id,
        p_guest_token: target.guestToken,
        p_status: "attending",
        p_event_fee: 0,
      });

      expect(error?.code).toBe("P0001");

      const { data, error: readError } = await adminClient
        .from("attendances")
        .select("status")
        .eq("id", target.id)
        .single();

      expect(readError).toBeNull();
      expect(data?.status).toBe(status);
    });
  });

  test("空席ができた後はゲストが不参加から参加へ変更できる", async ({
    adminClient,
    anonClient,
    event,
    rsvp,
  }) => {
    const occupied = await rsvp.createAttendance({ eventId: event.id, label: "occupied" });
    const target = await rsvp.createAttendance({
      eventId: event.id,
      label: "guest-target",
      status: "not_attending",
    });

    const { error: releaseError } = await adminClient
      .from("attendances")
      .update({ status: "not_attending" })
      .eq("id", occupied.id);
    expect(releaseError).toBeNull();

    const { error } = await anonClient.rpc("update_guest_attendance_with_payment", {
      p_attendance_id: target.id,
      p_guest_token: target.guestToken,
      p_status: "attending",
      p_event_fee: 0,
    });

    expect(error).toBeNull();

    const { data, error: readError } = await adminClient
      .from("attendances")
      .select("status")
      .eq("id", target.id)
      .single();

    expect(readError).toBeNull();
    expect(data?.status).toBe("attending");
  });

  test("定員1名への同時変更は1件だけ参加になる", async ({ adminClient, event, rsvp }) => {
    const firstTarget = await rsvp.createAttendance({
      eventId: event.id,
      label: "concurrent-update-a",
      status: "maybe",
    });
    const secondTarget = await rsvp.createAttendance({
      eventId: event.id,
      label: "concurrent-update-b",
      status: "not_attending",
    });
    const firstClient = rsvp.createPublicClient();
    const secondClient = rsvp.createPublicClient();

    const results = await Promise.all([
      firstClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: firstTarget.id,
        p_guest_token: firstTarget.guestToken,
        p_status: "attending",
        p_event_fee: 0,
      }),
      secondClient.rpc("update_guest_attendance_with_payment", {
        p_attendance_id: secondTarget.id,
        p_guest_token: secondTarget.guestToken,
        p_status: "attending",
        p_event_fee: 0,
      }),
    ]);

    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    expect(results.filter((result) => result.error !== null)).toHaveLength(1);

    const { count, error } = await adminClient
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "attending");

    expect(error).toBeNull();
    expect(count).toBe(1);
  });
});

describe("主催者操作の定員境界", () => {
  test("主催者も満員のイベントへ参加者を追加できない", async ({
    adminClient,
    event,
    organizerClient,
    rsvp,
    unique,
  }) => {
    await rsvp.createAttendance({ eventId: event.id, label: "occupied" });

    const { data, error } = await organizerClient.rpc("admin_add_attendance_with_capacity_check", {
      p_event_id: event.id,
      p_nickname: "主催者追加参加者",
      p_email: unique.email("admin-add"),
      p_status: "attending",
      p_guest_token: rsvp.createGuestToken("admin-add"),
    });

    expect(data).toBeNull();
    expect(error?.code).toBe("P0004");

    const { count, error: countError } = await adminClient
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "attending");

    expect(countError).toBeNull();
    expect(count).toBe(1);
  });

  test("主催者も満員時に未定の出欠を参加へ代理変更できない", async ({
    adminClient,
    event,
    organizer,
    organizerClient,
    rsvp,
  }) => {
    await rsvp.createAttendance({ eventId: event.id, label: "occupied" });
    const target = await rsvp.createAttendance({
      eventId: event.id,
      label: "admin-update-target",
      status: "maybe",
    });

    const { data, error } = await organizerClient.rpc("rpc_admin_update_attendance_status", {
      p_event_id: event.id,
      p_attendance_id: target.id,
      p_new_status: "attending",
      p_user_id: organizer.id,
      p_acknowledged_finalized_payment: false,
      p_acknowledged_past_event: false,
    });

    expect(data).toBeNull();
    expect(error?.code).toBe("P0004");

    const { data: persisted, error: readError } = await adminClient
      .from("attendances")
      .select("status")
      .eq("id", target.id)
      .single();

    expect(readError).toBeNull();
    expect(persisted?.status).toBe("maybe");
  });
});

describe("定員trigger", () => {
  test("RPCを経由しない参加の追加も満員時に拒否する", async ({
    adminClient,
    event,
    rsvp,
    unique,
  }) => {
    await rsvp.createAttendance({ eventId: event.id, label: "occupied" });

    const { error } = await adminClient.from("attendances").insert({
      event_id: event.id,
      nickname: "直接追加参加者",
      email: unique.email("direct-insert"),
      status: "attending",
      guest_token: rsvp.createGuestToken("direct-insert"),
    });

    expect(error?.code).toBe("P0004");

    const { count, error: countError } = await adminClient
      .from("attendances")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("status", "attending");

    expect(countError).toBeNull();
    expect(count).toBe(1);
  });

  test("RPCを経由しない参加への変更も満員時に拒否する", async ({ adminClient, event, rsvp }) => {
    await rsvp.createAttendance({ eventId: event.id, label: "occupied" });
    const target = await rsvp.createAttendance({
      eventId: event.id,
      label: "direct-update-target",
      status: "not_attending",
    });

    const { error } = await adminClient
      .from("attendances")
      .update({ status: "attending" })
      .eq("id", target.id);

    expect(error?.code).toBe("P0004");

    const { data, error: readError } = await adminClient
      .from("attendances")
      .select("status")
      .eq("id", target.id)
      .single();

    expect(readError).toBeNull();
    expect(data?.status).toBe("not_attending");
  });
});
