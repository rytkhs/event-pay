import { describe, expect } from "vitest";

import { createCommunity, createCommunitySchema } from "@features/communities/server";

import { test } from "../../fixtures/auth";

/**
 * 公開 service `createCommunity` をアプリ境界として、ローカル Supabase まで通す。
 *
 * `organizerClient` は anon キーでサインイン済みのため、RLS の
 * `Owners can insert own communities`（`WITH CHECK auth.uid() = created_by`）を実際に通過する。
 * 作成された community は `organizer` の teardown で cascade 削除される
 * （`communities_created_by_fkey ... ON DELETE CASCADE`）。
 */
describe("createCommunity", () => {
  test("主催者が自分のコミュニティを作成し、内容が永続化される", async ({
    adminClient,
    organizer,
    organizerClient,
    unique,
  }) => {
    const name = unique.communityName();
    const input = createCommunitySchema.parse({ name, description: "  テスト用の説明  " });

    const result = await createCommunity(organizerClient, organizer.id, input);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const communityId = result.data?.communityId;
    expect(communityId).toEqual(expect.any(String));

    const { data, error } = await adminClient
      .from("communities")
      .select("created_by, name, description, slug, legal_slug, is_deleted")
      .eq("id", communityId as string)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      created_by: organizer.id,
      name,
      // validation の transform で前後の空白が落ちる
      description: "テスト用の説明",
      is_deleted: false,
    });
    // slug / legal_slug は DB 既定値 `generate_community_slug()` で採番される
    expect(data?.slug).toBeTruthy();
    expect(data?.legal_slug).toBeTruthy();
  });
});
