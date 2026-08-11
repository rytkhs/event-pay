import { randomUUID } from "node:crypto";

import { describe, expect } from "vitest";

import { test } from "../../fixtures/community";

/**
 * COM-01: Community owner は作成後に変更できない（直接更新の拒否）。
 *
 * 保証の実体は RLS ではなく `communities` の BEFORE UPDATE トリガー
 * `trg_enforce_community_mvp_invariants` のため、RLS を迂回する service_role で検証する。
 * authenticated の UPDATE ポリシーだけでは、service_role からの付け替えを防げない。
 */
describe("communities.created_by", () => {
  test("service_role でも所有者を付け替えられない", async ({
    adminClient,
    community,
    organizer,
  }) => {
    // 実在しない UUID を使う。FK 違反なら 23503 になるため、P0001 が返ること自体が
    // 「FK ではなく immutability トリガーが先に拒否した」ことの証明になる。
    const { error } = await adminClient
      .from("communities")
      .update({ created_by: randomUUID() })
      .eq("id", community.id);

    expect(error).not.toBeNull();
    expect(error?.code).toBe("P0001");
    expect(error?.message).toContain("communities.created_by is immutable");

    const { data, error: readError } = await adminClient
      .from("communities")
      .select("created_by")
      .eq("id", community.id)
      .single();

    expect(readError).toBeNull();
    expect(data?.created_by).toBe(organizer.id);
  });
});
