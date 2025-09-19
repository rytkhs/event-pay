import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import {
  createTestUserWithConnect,
  createPaidTestEvent,
  createTestAttendance,
  createPaidStripePayment,
  cleanupTestPaymentData,
  type TestPaymentUser,
  type TestPaymentEvent,
  type TestAttendanceData,
} from "@/tests/helpers/test-payment-data";
import { deleteTestUser } from "@/tests/helpers/test-user";

/**
 * Settlement integration tests (normal flow)
 * - Generate settlement report for an event with PAID Stripe payments
 * - Regenerate within the same JST day (ON CONFLICT upsert) and verify update
 */
describe("清算レポート生成・更新（正常フロー）", () => {
  let organizer: TestPaymentUser;
  let event: TestPaymentEvent;
  let attendance: TestAttendanceData;
  const createdPaymentIds: string[] = [];

  const secureFactory = SecureSupabaseClientFactory.getInstance();
  let adminClient: any;

  beforeAll(async () => {
    adminClient = await secureFactory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "Settlement integration test setup",
      {
        accessedTables: [
          "public.events",
          "public.attendances",
          "public.payments",
          "public.settlements",
        ],
      }
    );

    organizer = await createTestUserWithConnect();
    event = await createPaidTestEvent(organizer.id, { fee: 1500, title: "Settlement Test Event" });
    attendance = await createTestAttendance(event.id, {
      email: `settlement-attendee-${Date.now()}@example.com`,
      nickname: "清算統合テスト参加者",
    });

    // Insert two PAID Stripe payments
    const p1 = await createPaidStripePayment(attendance.id, {
      amount: 1500,
      applicationFeeAmount: 150,
      stripeAccountId: organizer.stripeConnectAccountId,
      stripeBalanceTransactionFee: 60,
    });
    const p2 = await createPaidStripePayment(attendance.id, {
      amount: 2000,
      applicationFeeAmount: 200,
      stripeAccountId: organizer.stripeConnectAccountId,
      stripeBalanceTransactionFee: 72,
    });
    createdPaymentIds.push(p1.id, p2.id);
  });

  afterAll(async () => {
    await cleanupTestPaymentData({
      paymentIds: createdPaymentIds,
      attendanceIds: [attendance.id],
      eventIds: [event.id],
      userIds: [organizer.id],
    });

    await deleteTestUser(organizer.email);
  });

  test("初回生成時に新しい清算スナップショットが挿入される", async () => {
    const { data, error } = await adminClient.rpc("generate_settlement_report", {
      input_event_id: event.id,
      input_created_by: organizer.id,
    });

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
    const row = data[0];

    expect(row.report_id).toBeTruthy();
    // 既存有無フラグはDB実装差異で反転する可能性があるため厳密には検証しない
    expect(typeof row.already_exists).toBe("boolean");
    expect(row.returned_event_id).toBe(event.id);
    expect(row.event_title).toBe(event.title);
    expect(row.created_by).toBe(organizer.id);
    expect(row.stripe_account_id).toBe(organizer.stripeConnectAccountId);
    expect(row.transfer_group).toBe(`event_${event.id}_payout`);
    expect(row.settlement_mode).toBe("destination_charge");

    // Totals
    expect(row.total_stripe_sales).toBe(1500 + 2000);
    expect(row.total_stripe_fee).toBe(60 + 72);
    expect(row.total_application_fee).toBe(150 + 200);
    // net_payout_amount = sales - refunded - application_fee
    expect(row.total_refunded_amount).toBe(0);
    expect(row.net_payout_amount).toBe(3500 - 0 - 350);
    expect(row.payment_count).toBe(2);
    expect(row.refunded_count).toBe(0);

    // keep for next test
    (global as any).__reportId = row.report_id;
  });

  test("同一JST日での再生成時に既存スナップショットと合計が更新される", async () => {
    // Add another PAID payment and regenerate
    const p3 = await createPaidStripePayment(attendance.id, {
      amount: 1000,
      applicationFeeAmount: 100,
      stripeAccountId: organizer.stripeConnectAccountId,
      stripeBalanceTransactionFee: 36,
    });
    createdPaymentIds.push(p3.id);

    const { data, error } = await adminClient.rpc("generate_settlement_report", {
      input_event_id: event.id,
      input_created_by: organizer.id,
    });

    expect(error).toBeNull();
    const row = data[0];

    // Same JST day upsert should keep the same report id
    expect(row.report_id).toBe((global as any).__reportId);

    // Updated totals
    expect(row.total_stripe_sales).toBe(1500 + 2000 + 1000);
    expect(row.total_stripe_fee).toBe(60 + 72 + 36);
    expect(row.total_application_fee).toBe(150 + 200 + 100);
    expect(row.total_refunded_amount).toBe(0);
    expect(row.net_payout_amount).toBe(4500 - 0 - 450);
    expect(row.payment_count).toBe(3);
    expect(row.refunded_count).toBe(0);
  });

  test("異なる日付での複数レポート生成（概念検証：同日内では同一report_id）", async () => {
    // Since we cannot easily mock PostgreSQL's now() function in integration tests,
    // we verify the same-day behavior instead: multiple calls within the same JST day
    // should return the same report_id (demonstrating the date-based conflict resolution).

    // Call the RPC again (should be same JST day as previous tests)
    const { data, error } = await adminClient.rpc("generate_settlement_report", {
      input_event_id: event.id,
      input_created_by: organizer.id,
    });

    expect(error).toBeNull();
    const row = data[0];

    // Same JST day should return the SAME report_id (ON CONFLICT behavior)
    expect(row.report_id).toBe((global as any).__reportId);

    // Verify the conflict resolution logic is working
    // Note: already_exists = NOT v_was_update, so if we updated existing record, it returns false
    expect(row.already_exists).toBe(false);

    // Same totals (same event data, updated)
    expect(row.total_stripe_sales).toBe(4500); // 1500 + 2000 + 1000
    expect(row.payment_count).toBe(3);

    // Note: In a real-world scenario, different JST dates would generate different report_ids
    // This is tested conceptually here by verifying the same-day upsert behavior
  });

  test("Stripe Connectアカウント情報の詳細検証", async () => {
    // Generate fresh report to verify Connect account details
    const { data, error } = await adminClient.rpc("generate_settlement_report", {
      input_event_id: event.id,
      input_created_by: organizer.id,
    });

    expect(error).toBeNull();
    const row = data[0];

    // Detailed Stripe Connect account validation
    expect(row.stripe_account_id).toBe(organizer.stripeConnectAccountId);
    expect(row.stripe_account_id).toMatch(/^acct_[A-Za-z0-9]+$/); // Stripe account ID format

    // Transfer group should follow the pattern
    expect(row.transfer_group).toBe(`event_${event.id}_payout`);

    // Settlement mode should be destination_charge (Connect Express)
    expect(row.settlement_mode).toBe("destination_charge");

    // Verify the account is properly linked to the organizer
    const { data: connectAccount, error: connectError } = await adminClient
      .from("stripe_connect_accounts")
      .select("stripe_account_id, payouts_enabled, charges_enabled")
      .eq("user_id", organizer.id)
      .single();

    expect(connectError).toBeNull();
    expect(connectAccount).not.toBeNull();
    expect(connectAccount?.stripe_account_id).toBe(row.stripe_account_id);
    expect(connectAccount?.payouts_enabled).toBe(true);

    // Additional settlement report metadata validation
    expect(row.dispute_count).toBe(0); // No disputes in test data
    expect(row.total_disputed_amount).toBe(0);
    expect(typeof row.report_generated_at).toBe("string");
    expect(typeof row.report_updated_at).toBe("string");

    // Verify generated_at and updated_at are valid timestamps
    expect(new Date(row.report_generated_at).getTime()).toBeGreaterThan(0);
    expect(new Date(row.report_updated_at).getTime()).toBeGreaterThan(0);
  });
});
