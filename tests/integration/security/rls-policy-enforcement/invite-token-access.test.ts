/**
 * RLS Policy Enforcement: Invite Token Access Control Tests
 */

import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";

import { validateInviteToken } from "@core/utils/invite-token";
import { setupRLSTest, type RLSTestSetup } from "./rls-test-setup";

describe("Invite Token Access Control", () => {
  let setup: RLSTestSetup;

  beforeAll(async () => {
    setup = await setupRLSTest();
  });

  afterAll(async () => {
    await setup.cleanup();
  });

  test("正しい招待トークンでイベント情報にアクセスできる", async () => {
    const result = await validateInviteToken(setup.testInviteToken);

    // Debug: 結果を出力
    if (!result.isValid) {
      console.log("Invite token validation failed:", JSON.stringify(result, null, 2));
    }

    expect(result.isValid).toBe(true);
    expect(result.event).toBeDefined();
    if (result.event) {
      expect(result.event.id).toBe(setup.testEventId);
      expect(result.event.title).toBe("Test Event for RLS");
    }
    expect(result.canRegister).toBe(true);
  });

  test("無効な招待トークンではアクセスできない", async () => {
    const invalidToken = "inv_invalid_token_123456789012345678";
    const result = await validateInviteToken(invalidToken);

    expect(result.isValid).toBe(false);
    expect(result.event).toBeUndefined();
    expect(result.errorCode).toBe("TOKEN_NOT_FOUND");
  });

  test("形式が正しくない招待トークンは即座に拒否される", async () => {
    const malformedToken = "invalid_format";
    const result = await validateInviteToken(malformedToken);

    expect(result.isValid).toBe(false);
    expect(result.errorCode).toBe("INVALID_TOKEN");
  });
});
