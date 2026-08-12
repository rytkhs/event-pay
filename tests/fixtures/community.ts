import type { AppSupabaseClient } from "@core/types/supabase";

import { test as authTest } from "./auth";

/**
 * `organizer` が所有するコミュニティ。
 *
 * `db` テストはアプリの service を経由しないため、service_role で直接 insert する。
 * `slug` / `legal_slug` は `generate_community_slug()` の DB 既定値に任せる。
 */

export type TestCommunity = {
  id: string;
  name: string;
  slug: string;
  legalSlug: string;
  createdBy: string;
};

export type CommunityFixtures = {
  community: TestCommunity;
  deletedCommunity: TestCommunity;
  otherCommunity: TestCommunity;
};

const FIXED_DELETED_AT = "2026-01-01T00:00:00.000Z";

async function createCommunityRecord(options: {
  adminClient: AppSupabaseClient;
  createdBy: string;
  name: string;
  deleted?: boolean;
}): Promise<TestCommunity> {
  const { data, error } = await options.adminClient
    .from("communities")
    .insert({
      created_by: options.createdBy,
      name: options.name,
      description: null,
    })
    .select("id, name, slug, legal_slug, created_by")
    .single();

  if (error || !data) {
    throw new Error(`テストコミュニティの作成に失敗しました: ${error?.message ?? "row が空です"}`);
  }

  if (options.deleted) {
    const { error: deleteError } = await options.adminClient
      .from("communities")
      .update({ is_deleted: true, deleted_at: FIXED_DELETED_AT })
      .eq("id", data.id);

    if (deleteError) {
      throw new Error(`テストコミュニティのsoft deleteに失敗しました: ${deleteError.message}`);
    }
  }

  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    legalSlug: data.legal_slug,
    createdBy: data.created_by,
  };
}

async function deleteCommunityRecord(
  adminClient: AppSupabaseClient,
  community: TestCommunity
): Promise<void> {
  const { error } = await adminClient.from("communities").delete().eq("id", community.id);

  if (error) {
    throw new Error(`テストコミュニティの削除に失敗しました: ${error.message}`);
  }
}

export const test = authTest.extend<CommunityFixtures>({
  community: async ({ adminClient, organizer, unique }, use) => {
    const community = await createCommunityRecord({
      adminClient,
      createdBy: organizer.id,
      name: unique.communityName(),
    });

    try {
      await use(community);
    } finally {
      // authenticated ロールに DELETE 権限はないため service_role で消す。
      // 存在しない行の delete は no-op なので、organizer の cascade と重なっても問題ない。
      await deleteCommunityRecord(adminClient, community);
    }
  },

  deletedCommunity: async ({ adminClient, organizer, unique }, use) => {
    const community = await createCommunityRecord({
      adminClient,
      createdBy: organizer.id,
      name: unique.communityName("削除済みコミュニティ"),
      deleted: true,
    });

    try {
      await use(community);
    } finally {
      await deleteCommunityRecord(adminClient, community);
    }
  },

  otherCommunity: async ({ adminClient, otherOrganizer, unique }, use) => {
    const community = await createCommunityRecord({
      adminClient,
      createdBy: otherOrganizer.id,
      name: unique.communityName("別主催者コミュニティ"),
    });

    try {
      await use(community);
    } finally {
      await deleteCommunityRecord(adminClient, community);
    }
  },
});
