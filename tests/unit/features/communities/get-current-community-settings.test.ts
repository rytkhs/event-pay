import { getCurrentCommunitySettings } from "@features/communities/services/get-current-community-settings";

function createSupabaseMock(options: { community?: { data: unknown; error: unknown } }) {
  const communityMaybeSingle = jest.fn().mockResolvedValue(
    options.community ?? {
      data: {
        id: "community-1",
        name: "ボドゲ会",
        description: "毎月集まるサークルです",
        slug: "community-slug",
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
      community: {
        id: "community-1",
        name: "ボドゲ会",
        description: "毎月集まるサークルです",
        slug: "community-slug",
      },
      publicPageUrl: "https://example.com/c/community-slug",
    });
    expect(from).toHaveBeenCalledWith("communities");
    expect(communitySelect).toHaveBeenCalledWith("id, name, description, slug");
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
    ).resolves.toBeNull();
  });
});
