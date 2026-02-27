/**
 * RLS Policy Enforcement: RLS boundaries for fee_config/system_logs Tests
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";

import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

describe("RLS boundaries for fee_config/system_logs", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("fee_config: admin can UPDATE (read-only for normal roles)", async () => {
    const admin = await createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "update fee_config for test"
    );
    const { data: feeBefore } = await admin
      .from("fee_config")
      .select("is_tax_included")
      .limit(1)
      .single();
    const toggle = !(feeBefore?.is_tax_included ?? true);
    const { error: updErr } = await admin
      .from("fee_config")
      .update({ is_tax_included: toggle })
      .eq("id", 1);
    expect(updErr).toBeNull();
  });

  test("system_logs: anon cannot INSERT; admin can SELECT", async () => {
    const factory = getSecureClientFactory();
    const anon = factory.createPublicClient();
    const ins = await anon.from("system_logs").insert({
      id: 999999,
      created_at: new Date().toISOString(),
      log_level: "info",
      log_category: "system",
      actor_type: "system",
      action: "test",
      message: "x",
      outcome: "success",
    });
    expect(ins.error).not.toBeNull();

    const admin = await factory.createAuditedAdminClient(
      AdminReason.TEST_DATA_SETUP,
      "select system_logs"
    );
    const selAdmin = await admin.from("system_logs").select("id").limit(1);
    expect(selAdmin.error).toBeNull();
  });
});
