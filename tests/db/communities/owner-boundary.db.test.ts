import { describe, expect } from "vitest";

import { test } from "../../fixtures/community";

describe("communities owner boundary", () => {
  test("認証済み主催者は自分の未削除コミュニティを参照できる", async ({
    community,
    organizerClient,
  }) => {
    const { data, error } = await organizerClient
      .from("communities")
      .select("id, created_by")
      .eq("id", community.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toEqual({ id: community.id, created_by: community.createdBy });
  });

  test("別主催者のコミュニティは参照できない", async ({ organizerClient, otherCommunity }) => {
    const { data, error } = await organizerClient
      .from("communities")
      .select("id")
      .eq("id", otherCommunity.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test("削除済みの所有コミュニティは参照できない", async ({
    deletedCommunity,
    organizerClient,
  }) => {
    const { data, error } = await organizerClient
      .from("communities")
      .select("id")
      .eq("id", deletedCommunity.id)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test("別主催者のコミュニティを更新できず永続化状態も変わらない", async ({
    adminClient,
    organizerClient,
    otherCommunity,
    unique,
  }) => {
    const replacementName = unique.communityName("越境更新後");
    const { data: updateData, error: updateError } = await organizerClient
      .from("communities")
      .update({ name: replacementName })
      .eq("id", otherCommunity.id)
      .select("id")
      .maybeSingle();

    expect(updateError).toBeNull();
    expect(updateData).toBeNull();

    const { data, error } = await adminClient
      .from("communities")
      .select("name")
      .eq("id", otherCommunity.id)
      .single();

    expect(error).toBeNull();
    expect(data?.name).toBe(otherCommunity.name);
  });
});
