import { randomUUID } from "node:crypto";

import { assert, describe, expect } from "vitest";

import { CURRENT_COMMUNITY_COOKIE_NAME } from "@core/community/current-community";

import { updateCurrentCommunityAction } from "@/app/(app)/actions/current-community";

import { test } from "../../fixtures/community";
import { runInNextServerActionContext } from "../../setup/next-request-context";

describe("updateCurrentCommunityAction", () => {
  test("主催者が自分の未削除コミュニティを選択できる", async ({
    community,
    organizerRequestCookies,
  }) => {
    const execution = await runInNextServerActionContext(
      { cookies: organizerRequestCookies },
      async () => await updateCurrentCommunityAction(community.id)
    );

    expect(execution.result.success).toBe(true);
    assert(execution.result.success);
    expect(execution.result.data).toEqual({ currentCommunityId: community.id });
    expect(execution.responseCookies).toContainEqual(
      expect.objectContaining({
        name: CURRENT_COMMUNITY_COOKIE_NAME,
        value: community.id,
        httpOnly: true,
        maxAge: 60 * 60 * 24 * 180,
        path: "/",
        sameSite: "lax",
      })
    );
  });

  test("別主催者のコミュニティは選択できずcookieも更新しない", async ({
    community,
    organizerRequestCookies,
    otherCommunity,
  }) => {
    const execution = await runInNextServerActionContext(
      {
        cookies: [
          ...organizerRequestCookies,
          { name: CURRENT_COMMUNITY_COOKIE_NAME, value: community.id },
        ],
      },
      async () => await updateCurrentCommunityAction(otherCommunity.id)
    );

    expect(execution.result.success).toBe(false);
    assert(!execution.result.success);
    expect(execution.result.error.code).toBe("FORBIDDEN");
    expect(execution.responseCookies).not.toContainEqual(
      expect.objectContaining({ name: CURRENT_COMMUNITY_COOKIE_NAME })
    );
  });

  test("削除済みの所有コミュニティは選択できずcookieも更新しない", async ({
    community,
    deletedCommunity,
    organizerRequestCookies,
  }) => {
    const execution = await runInNextServerActionContext(
      {
        cookies: [
          ...organizerRequestCookies,
          { name: CURRENT_COMMUNITY_COOKIE_NAME, value: community.id },
        ],
      },
      async () => await updateCurrentCommunityAction(deletedCommunity.id)
    );

    expect(execution.result.success).toBe(false);
    assert(!execution.result.success);
    expect(execution.result.error.code).toBe("FORBIDDEN");
    expect(execution.responseCookies).not.toContainEqual(
      expect.objectContaining({ name: CURRENT_COMMUNITY_COOKIE_NAME })
    );
  });

  test("存在しないコミュニティは選択できずcookieも更新しない", async ({
    community,
    organizerRequestCookies,
  }) => {
    const execution = await runInNextServerActionContext(
      {
        cookies: [
          ...organizerRequestCookies,
          { name: CURRENT_COMMUNITY_COOKIE_NAME, value: community.id },
        ],
      },
      async () => await updateCurrentCommunityAction(randomUUID())
    );

    expect(execution.result.success).toBe(false);
    assert(!execution.result.success);
    expect(execution.result.error.code).toBe("FORBIDDEN");
    expect(execution.responseCookies).not.toContainEqual(
      expect.objectContaining({ name: CURRENT_COMMUNITY_COOKIE_NAME })
    );
  });

  test("UUIDでない入力はvalidation errorとなりcookieも更新しない", async ({
    community,
    organizerRequestCookies,
  }) => {
    const execution = await runInNextServerActionContext(
      {
        cookies: [
          ...organizerRequestCookies,
          { name: CURRENT_COMMUNITY_COOKIE_NAME, value: community.id },
        ],
      },
      async () => await updateCurrentCommunityAction("not-a-uuid")
    );

    expect(execution.result.success).toBe(false);
    assert(!execution.result.success);
    expect(execution.result.error.code).toBe("VALIDATION_ERROR");
    expect(execution.result.error.fieldErrors).toEqual({
      nextCommunityId: ["有効なコミュニティIDを指定してください"],
    });
    expect(execution.responseCookies).not.toContainEqual(
      expect.objectContaining({ name: CURRENT_COMMUNITY_COOKIE_NAME })
    );
  });

  test("未認証requestはunauthorizedとなりcookieも更新しない", async () => {
    const currentCommunityId = randomUUID();
    const execution = await runInNextServerActionContext(
      {
        cookies: [{ name: CURRENT_COMMUNITY_COOKIE_NAME, value: currentCommunityId }],
      },
      async () => await updateCurrentCommunityAction(randomUUID())
    );

    expect(execution.result.success).toBe(false);
    assert(!execution.result.success);
    expect(execution.result.error.code).toBe("UNAUTHORIZED");
    expect(execution.responseCookies).not.toContainEqual(
      expect.objectContaining({ name: CURRENT_COMMUNITY_COOKIE_NAME })
    );
  });
});
