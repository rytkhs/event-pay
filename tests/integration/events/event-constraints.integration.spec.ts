import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { createTestUser, deleteTestUser, type TestUser } from "@tests/helpers/test-user";

describe("Event constraints (schema-level)", () => {
  let organizer: TestUser;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    organizer = await createTestUser(
      `event-constraints-${Date.now()}@example.com`,
      "TestPassword123!"
    );
  });

  afterAll(async () => {
    // cleanup events
    try {
      const adminClient = await SecureSupabaseClientFactory.create().createAuditedAdminClient(
        AdminReason.TEST_DATA_CLEANUP,
        "Cleaning up event constraints test events",
        { accessedTables: ["public.events"], operationType: "DELETE" }
      );
      if (createdEventIds.length > 0) {
        await adminClient.from("events").delete().in("id", createdEventIds);
      }
    } catch {
      // best-effort cleanup
    }

    try {
      await deleteTestUser(organizer.email);
    } catch {
      // ignore
    }
  });

  test("stripe利用時のpayment_deadline必須CHECK", async () => {
    const factory = SecureSupabaseClientFactory.create();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Insert event with stripe method and null payment_deadline to trigger CHECK",
      { accessedTables: ["public.events"], operationType: "INSERT" }
    );

    const now = Date.now();
    const date = new Date(now + 60 * 60 * 1000).toISOString();
    const registrationDeadline = new Date(now + 30 * 60 * 1000).toISOString();

    const { error, data } = await admin
      .from("events")
      .insert({
        title: "CHECK: stripe requires payment_deadline",
        date,
        location: "test",
        description: "",
        fee: 1000,
        capacity: 10,
        registration_deadline: registrationDeadline,
        payment_deadline: null, // invalid with stripe
        payment_methods: ["stripe"],
        invite_token: `inv_${Math.random().toString(36).slice(2, 18)}`,
        created_by: organizer.id,
      })
      .select("id")
      .single();

    // Expect CHECK violation (23514) due to events_payment_deadline_required_if_stripe
    expect(error).not.toBeNull();
    if (error) {
      expect(error.code).toBe("23514");
    }

    if (data?.id) {
      createdEventIds.push(data.id);
    }
  });

  test("registration_deadline <= dateのCHECK", async () => {
    const factory = SecureSupabaseClientFactory.create();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Insert event with registration_deadline after event date to trigger CHECK",
      { accessedTables: ["public.events"], operationType: "INSERT" }
    );

    const now = Date.now();
    const date = new Date(now + 60 * 60 * 1000).toISOString();
    const badRegistrationDeadline = new Date(now + 2 * 60 * 60 * 1000).toISOString(); // after event date

    const { error, data } = await admin
      .from("events")
      .insert({
        title: "CHECK: registration_deadline <= date",
        date,
        location: "test",
        description: "",
        fee: 0,
        capacity: 5,
        registration_deadline: badRegistrationDeadline, // invalid (after date)
        payment_deadline: null,
        payment_methods: ["cash"],
        invite_token: `inv_${Math.random().toString(36).slice(2, 18)}`,
        created_by: organizer.id,
      })
      .select("id")
      .single();

    // Expect CHECK violation (23514) due to events_registration_deadline_before_event
    expect(error).not.toBeNull();
    if (error) {
      expect(error.code).toBe("23514");
    }

    if (data?.id) {
      createdEventIds.push(data.id);
    }
  });

  test("events_fee_check: fee must be 0 or within [100, 1_000_000]", async () => {
    const factory = SecureSupabaseClientFactory.create();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "events fee boundary checks",
      { accessedTables: ["public.events"], operationType: "INSERT" }
    );

    const now = Date.now();
    const date = new Date(now + 60 * 60 * 1000).toISOString();
    const registrationDeadline = date;

    // fee < 100 should fail
    const { error: lowFeeErr } = await admin
      .from("events")
      .insert({
        title: "fee < 100 should fail",
        date,
        location: "test",
        description: "",
        fee: 50,
        capacity: 10,
        registration_deadline: registrationDeadline,
        payment_deadline: null,
        payment_methods: ["cash"],
        invite_token: `inv_${Math.random().toString(36).slice(2, 18)}`,
        created_by: organizer.id,
      })
      .select("id")
      .single();
    expect(lowFeeErr).not.toBeNull();

    // fee in range should pass (record id returned)
    const ok = await admin
      .from("events")
      .insert({
        title: "fee ok",
        date,
        location: "test",
        description: "",
        fee: 100,
        capacity: 10,
        registration_deadline: registrationDeadline,
        payment_deadline: null,
        payment_methods: ["cash"],
        invite_token: `inv_${Math.random().toString(36).slice(2, 18)}`,
        created_by: organizer.id,
      })
      .select("id")
      .single();
    expect(ok.error).toBeNull();
    if (ok.data?.id) createdEventIds.push(ok.data.id);

    // fee > 1_000_000 should fail
    const { error: highFeeErr } = await admin
      .from("events")
      .insert({
        title: "fee too high",
        date,
        location: "test",
        description: "",
        fee: 1_000_001,
        capacity: 10,
        registration_deadline: registrationDeadline,
        payment_deadline: null,
        payment_methods: ["cash"],
        invite_token: `inv_${Math.random().toString(36).slice(2, 18)}`,
        created_by: organizer.id,
      })
      .select("id")
      .single();
    expect(highFeeErr).not.toBeNull();
  });

  test("events_capacity_check: capacity must be > 0 or null", async () => {
    const factory = SecureSupabaseClientFactory.create();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "events capacity checks",
      { accessedTables: ["public.events"], operationType: "INSERT" }
    );

    const date = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    // zero invalid
    const badZero = await admin
      .from("events")
      .insert({
        title: "capacity zero invalid",
        date,
        fee: 0,
        capacity: 0,
        location: "test",
        registration_deadline: date,
        payment_deadline: null,
        payment_methods: ["cash"],
        invite_token: `inv_${Math.random().toString(36).slice(2, 18)}`,
        created_by: organizer.id,
      })
      .select("id")
      .single();
    expect(badZero.error).not.toBeNull();

    // negative invalid
    const badNeg = await admin
      .from("events")
      .insert({
        title: "capacity negative invalid",
        date,
        fee: 0,
        capacity: -1,
        location: "test",
        registration_deadline: date,
        payment_deadline: null,
        payment_methods: ["cash"],
        invite_token: `inv_${Math.random().toString(36).slice(2, 18)}`,
        created_by: organizer.id,
      })
      .select("id")
      .single();
    expect(badNeg.error).not.toBeNull();

    // null allowed
    const okNull = await admin
      .from("events")
      .insert({
        title: "capacity null ok",
        date,
        fee: 0,
        capacity: null,
        location: "test",
        registration_deadline: date,
        payment_deadline: null,
        payment_methods: ["cash"],
        invite_token: `inv_${Math.random().toString(36).slice(2, 18)}`,
        created_by: organizer.id,
      })
      .select("id")
      .single();
    expect(okNull.error).toBeNull();
    if (okNull.data?.id) createdEventIds.push(okNull.data.id);
  });

  test("events_payment_deadline_within_30d_after_date & methods not empty (methods empty allowed by schema)", async () => {
    const factory = SecureSupabaseClientFactory.create();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "events deadline window and methods checks",
      { accessedTables: ["public.events"], operationType: "INSERT" }
    );

    const base = new Date();
    const date = new Date(base.getTime() + 60 * 60 * 1000);
    const over30d = new Date(date.getTime() + 31 * 24 * 60 * 60 * 1000);

    // deadline > date+30d should fail
    const tooLate = await admin
      .from("events")
      .insert({
        title: "deadline too late",
        date: date.toISOString(),
        fee: 0,
        capacity: 1,
        location: "x",
        registration_deadline: date.toISOString(),
        payment_deadline: over30d.toISOString(),
        payment_methods: ["cash"],
        invite_token: `inv_${Math.random().toString(36).slice(2, 18)}`,
        created_by: organizer.id,
      })
      .select("id")
      .single();
    expect(tooLate.error).not.toBeNull();

    // empty methods should fail (events_payment_methods_check)
    const emptyMethods = await admin
      .from("events")
      .insert({
        title: "methods empty",
        date: date.toISOString(),
        fee: 0,
        capacity: 1,
        location: "x",
        registration_deadline: date.toISOString(),
        payment_deadline: null,
        payment_methods: [],
        invite_token: `inv_${Math.random().toString(36).slice(2, 18)}`,
        created_by: organizer.id,
      })
      .select("id")
      .single();
    expect(emptyMethods.error).not.toBeNull();
  });
});
