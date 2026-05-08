import { AppError } from "@core/errors/app-error";
import { getCurrentCommunitySettings } from "@features/communities/services/get-current-community-settings";

function createSupabaseMock(options: { community?: { data: unknown; error: unknown } }) {
  const communityMaybeSingle = jest.fn().mockResolvedValue(
    options.community ?? {
      data: {
        id: "community-1",
        name: "ボドゲ会",
        description: "毎月集まるサークルです",
        slug: "community-slug",
        legal_slug: "legal-slug",
        show_community_link: true,
        show_legal_disclosure_link: false,
      },
      error: null,
    }
  );

  const communityEqIsDeleted = jest.fn().mockReturnValue({ maybeSingle: communityMaybeSingle });
  const communityEqCreatedBy = jest.fn().mockReturnValue({ eq: communityEqIsDeleted });
  const communityEqId = jest.fn().mockReturnValue({ eq: communityEqCreatedBy });
  const communitySelect = jest.fn().mockReturnValue({ eq: communityEqId });

  const from = jest.fn((table: string) => {
    if (table === "communities") {
      return { select: communitySelect };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: {
      from,
    },
    from,
    communitySelect,
    communityEqId,
    communityEqCreatedBy,
    communityEqIsDeleted,
  };
}

describe("getCurrentCommunitySettings", () => {
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
  });

  it("current community の基本情報と絶対公開 URL を返す", async () => {
    const {
      supabase,
      from,
      communitySelect,
      communityEqId,
      communityEqCreatedBy,
      communityEqIsDeleted,
    } = createSupabaseMock({});

    const result = await getCurrentCommunitySettings(supabase as never, "user-1", "community-1");

    expect(result).toEqual({
      success: true,
      data: {
        community: {
          id: "community-1",
          name: "ボドゲ会",
          description: "毎月集まるサークルです",
          slug: "community-slug",
          legalSlug: "legal-slug",
          showCommunityLink: true,
          showLegalDisclosureLink: false,
        },
        legalPageUrl: "https://example.com/tokushoho/legal-slug",
        publicPageUrl: "https://example.com/c/community-slug",
      },
      meta: undefined,
    });
    expect(from).toHaveBeenCalledWith("communities");
    expect(communitySelect).toHaveBeenCalledWith(
      "id, name, description, slug, legal_slug, show_community_link, show_legal_disclosure_link"
    );
    expect(communityEqId).toHaveBeenCalledWith("id", "community-1");
    expect(communityEqCreatedBy).toHaveBeenCalledWith("created_by", "user-1");
    expect(communityEqIsDeleted).toHaveBeenCalledWith("is_deleted", false);
  });

  it("current community が owner 所有で解決できない場合は null を返す", async () => {
    const { supabase } = createSupabaseMock({
      community: {
        data: null,
        error: null,
      },
    });

    await expect(
      getCurrentCommunitySettings(supabase as never, "user-1", "community-x")
    ).resolves.toEqual({
      success: true,
      data: null,
      meta: undefined,
    });
  });

  it("DB エラー時は DATABASE_ERROR を AppResult failure で返す", async () => {
    const dbError = new Error("db failed");
    const { supabase } = createSupabaseMock({
      community: {
        data: null,
        error: dbError,
      },
    });

    const result = await getCurrentCommunitySettings(supabase as never, "user-1", "community-1");

    expect(result.success).toBe(false);
    expect(result).toMatchObject({
      success: false,
      meta: undefined,
    });

    if (result.success) {
      throw new Error("expected failure result");
    }

    expect(result.error).toBeInstanceOf(AppError);
    expect(result.error.code).toBe("DATABASE_ERROR");
    expect(result.error.userMessage).toBe("コミュニティ設定の取得に失敗しました");
    expect(result.error.details).toEqual({
      communityId: "community-1",
      operation: "get_current_community_settings",
      ownerUserId: "user-1",
    });
  });
});
