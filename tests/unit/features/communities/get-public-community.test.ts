import { AppError } from "@core/errors/app-error";
import {
  getPublicCommunityBySlug,
  getPublicCommunityByLegalSlug,
} from "../../../../features/communities/services/get-public-community";
import type { AppSupabaseClient } from "@core/types/supabase";

describe("get-public-community", () => {
  let supabase: AppSupabaseClient;

  // Use a mock supabase client using proxy to intercept method calls
  beforeEach(() => {
    supabase = {
      rpc: jest.fn(),
    } as unknown as AppSupabaseClient;
  });

  describe("getPublicCommunityBySlug", () => {
    it("should return the public community model when successful", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [
          {
            id: "fake-id",
            name: "Community One",
            description: "Desc",
            slug: "c-slug",
            legal_slug: "l-slug",
          },
        ],
        error: null,
      });

      const result = await getPublicCommunityBySlug(supabase, "c-slug");

      expect(supabase.rpc).toHaveBeenCalledWith("rpc_public_get_community_by_slug", {
        p_slug: "c-slug",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          id: "fake-id",
          name: "Community One",
          description: "Desc",
          slug: "c-slug",
          legalSlug: "l-slug",
        });
      }
    });

    it("should return null if not found", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await getPublicCommunityBySlug(supabase, "unknown-slug");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should return errResult if database error occurs", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: null,
        error: new Error("db failure"),
      });

      const result = await getPublicCommunityBySlug(supabase, "unknown-slug");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(AppError);
        expect(result.error.code).toBe("DATABASE_ERROR");
      }
    });
  });

  describe("getPublicCommunityByLegalSlug", () => {
    it("should return the public community model when successful", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [
          {
            id: "fake-id-2",
            name: "Community Two",
            description: "Legal Desc",
            slug: "c-slug-2",
            legal_slug: "l-slug-2",
          },
        ],
        error: null,
      });

      const result = await getPublicCommunityByLegalSlug(supabase, "l-slug-2");

      expect(supabase.rpc).toHaveBeenCalledWith("rpc_public_get_community_by_legal_slug", {
        p_legal_slug: "l-slug-2",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          id: "fake-id-2",
          name: "Community Two",
          description: "Legal Desc",
          slug: "c-slug-2",
          legalSlug: "l-slug-2",
        });
      }
    });

    it("should return null if not found", async () => {
      (supabase.rpc as jest.Mock).mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await getPublicCommunityByLegalSlug(supabase, "unknown-slug");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });
  });
});
