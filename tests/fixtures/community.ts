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
};

export const test = authTest.extend<CommunityFixtures>({
  community: async ({ adminClient, organizer, unique }, use) => {
    const { data, error } = await adminClient
      .from("communities")
      .insert({
        created_by: organizer.id,
        name: unique.communityName(),
        description: null,
        // current_payout_profile_id は null のままにする。
        // enforce_community_mvp_invariants が非 null 時に所有者一致を要求するため。
      })
      .select("id, name, slug, legal_slug, created_by")
      .single();

    if (error || !data) {
      throw new Error(
        `テストコミュニティの作成に失敗しました: ${error?.message ?? "row が空です"}`
      );
    }

    const community: TestCommunity = {
      id: data.id,
      name: data.name,
      slug: data.slug,
      legalSlug: data.legal_slug,
      createdBy: data.created_by,
    };

    try {
      await use(community);
    } finally {
      // authenticated ロールに DELETE 権限はないため service_role で消す。
      // 存在しない行の delete は no-op なので、organizer の cascade と重なっても問題ない。
      const { error: deleteError } = await adminClient
        .from("communities")
        .delete()
        .eq("id", community.id);

      if (deleteError) {
        throw new Error(`テストコミュニティの削除に失敗しました: ${deleteError.message}`);
      }
    }
  },
});
