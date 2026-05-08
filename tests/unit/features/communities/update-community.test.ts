jest.mock("@core/logging/app-logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    withContext: jest.fn().mockReturnThis(),
  },
}));

import { logger } from "@core/logging/app-logger";
import {
  updateCommunityBasicInfoSchema,
  updateCommunityPublicPageVisibilitySchema,
} from "@features/communities/server";
import { updateCommunityBasicInfo } from "@features/communities/services/update-community-basic-info";
import { updateCommunityPublicPageVisibility } from "@features/communities/services/update-community-public-page-visibility";

type QueryResponse = {
  data: unknown;
  error: unknown;
};

function createSupabaseMock(response: QueryResponse) {
  const updatePayloads: unknown[] = [];

  const maybeSingle = jest.fn().mockResolvedValue(response);
  const select = jest.fn().mockReturnValue({ maybeSingle });
  const eqIsDeleted = jest.fn().mockReturnValue({ select });
  const eqCreatedBy = jest.fn().mockReturnValue({ eq: eqIsDeleted });
  const eqId = jest.fn().mockReturnValue({ eq: eqCreatedBy });
  const update = jest.fn((payload: unknown) => {
    updatePayloads.push(payload);
    return { eq: eqId };
  });

  const from = jest.fn((table: string) => {
    if (table === "communities") {
      return { update };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    supabase: { from } as never,
    spies: {
      from,
      updatePayloads,
      eqId,
      eqCreatedBy,
      eqIsDeleted,
      select,
    },
  };
}

describe("features/communities/services/update-community-basic-info", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("description の空文字は schema で null に正規化する", () => {
    expect(
      updateCommunityBasicInfoSchema.parse({
        name: "  ボドゲ会  ",
        description: "   ",
      })
    ).toEqual({
      name: "ボドゲ会",
      description: null,
    });
  });

  it("name と description だけを更新する", async () => {
    const { supabase, spies } = createSupabaseMock({
      data: {
        id: "community-1",
        name: "新しい名前",
        description: "新しい説明",
      },
      error: null,
    });

    const result = await updateCommunityBasicInfo(supabase, "user-1", "community-1", {
      name: "新しい名前",
      description: "新しい説明",
    });

    expect(result).toEqual({
      success: true,
      data: {
        communityId: "community-1",
        name: "新しい名前",
        description: "新しい説明",
      },
      meta: undefined,
    });
    expect(spies.updatePayloads).toEqual([
      {
        name: "新しい名前",
        description: "新しい説明",
      },
    ]);
    expect(spies.select).toHaveBeenCalledWith("id, name, description");
    expect(logger.info).toHaveBeenCalledWith(
      "Community basic info updated",
      expect.objectContaining({
        action: "community.update_basic_info",
        communityId: "community-1",
      })
    );
  });

  it("更新対象が無ければ NOT_FOUND を返す", async () => {
    const { supabase } = createSupabaseMock({
      data: null,
      error: null,
    });

    const result = await updateCommunityBasicInfo(supabase, "user-1", "community-x", {
      name: "名前",
      description: null,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("expected failure");
    }

    expect(result.error.code).toBe("NOT_FOUND");
    expect(result.error.userMessage).toBe("更新対象のコミュニティが見つかりません");
  });
});

describe("features/communities/services/update-community-public-page-visibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("公開ページ表示設定を boolean として受け取る", () => {
    expect(
      updateCommunityPublicPageVisibilitySchema.parse({
        showCommunityLink: true,
        showLegalDisclosureLink: false,
      })
    ).toEqual({
      showCommunityLink: true,
      showLegalDisclosureLink: false,
    });
  });

  it("show_community_link と show_legal_disclosure_link を同時更新する", async () => {
    const { supabase, spies } = createSupabaseMock({
      data: {
        id: "community-1",
        show_community_link: true,
        show_legal_disclosure_link: false,
      },
      error: null,
    });

    const result = await updateCommunityPublicPageVisibility(supabase, "user-1", "community-1", {
      showCommunityLink: true,
      showLegalDisclosureLink: false,
    });

    expect(result).toEqual({
      success: true,
      data: {
        communityId: "community-1",
        showCommunityLink: true,
        showLegalDisclosureLink: false,
      },
      meta: undefined,
    });
    expect(spies.updatePayloads).toEqual([
      {
        show_community_link: true,
        show_legal_disclosure_link: false,
      },
    ]);
    expect(spies.select).toHaveBeenCalledWith(
      "id, show_community_link, show_legal_disclosure_link"
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Community public page visibility updated",
      expect.objectContaining({
        action: "community.update_public_page_visibility",
        communityId: "community-1",
      })
    );
  });
});
