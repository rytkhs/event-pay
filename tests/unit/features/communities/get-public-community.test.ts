import { createClient } from "@supabase/supabase-js";
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
      from: jest.fn(),
    } as unknown as AppSupabaseClient;
  });

  describe("getPublicCommunityBySlug", () => {
    it("should return the community model with organizer name when successful", async () => {
      const mockEq2 = jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: "fake-id",
            name: "Community One",
            description: "Desc",
            slug: "c-slug",
            legal_slug: "l-slug",
            users: { name: "Test User" },
          },
          error: null,
        }),
      });
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const result = await getPublicCommunityBySlug(supabase, "c-slug");

      expect(supabase.from).toHaveBeenCalledWith("communities");
      expect(mockSelect).toHaveBeenCalledWith(
        "id, name, description, slug, legal_slug, users:created_by(name)"
      );
      expect(mockEq1).toHaveBeenCalledWith("slug", "c-slug");
      expect(mockEq2).toHaveBeenCalledWith("is_deleted", false);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          id: "fake-id",
          name: "Community One",
          description: "Desc",
          slug: "c-slug",
          legalSlug: "l-slug",
          organizerName: "Test User",
        });
      }
    });

    it("should return null if not found", async () => {
      const mockEq2 = jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const result = await getPublicCommunityBySlug(supabase, "unknown-slug");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it("should return errResult if database error occurs", async () => {
      const mockEq2 = jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: new Error("db failure"),
        }),
      });
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const result = await getPublicCommunityBySlug(supabase, "unknown-slug");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(AppError);
        expect(result.error.code).toBe("DATABASE_ERROR");
      }
    });
  });

  describe("getPublicCommunityByLegalSlug", () => {
    it("should return the community model with organizer name when successful", async () => {
      const mockEq2 = jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: {
            id: "fake-id",
            name: "Community Two",
            description: "Legal Desc",
            slug: "c-slug-2",
            legal_slug: "l-slug-2",
            users: { name: "Organizer" },
          },
          error: null,
        }),
      });
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const result = await getPublicCommunityByLegalSlug(supabase, "l-slug-2");

      expect(supabase.from).toHaveBeenCalledWith("communities");
      expect(mockSelect).toHaveBeenCalledWith(
        "id, name, description, slug, legal_slug, users:created_by(name)"
      );
      expect(mockEq1).toHaveBeenCalledWith("legal_slug", "l-slug-2");
      expect(mockEq2).toHaveBeenCalledWith("is_deleted", false);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({
          id: "fake-id",
          name: "Community Two",
          description: "Legal Desc",
          slug: "c-slug-2",
          legalSlug: "l-slug-2",
          organizerName: "Organizer",
        });
      }
    });

    it("should return null if not found", async () => {
      const mockEq2 = jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });
      const mockEq1 = jest.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = jest.fn().mockReturnValue({ eq: mockEq1 });
      (supabase.from as jest.Mock).mockReturnValue({ select: mockSelect });

      const result = await getPublicCommunityByLegalSlug(supabase, "unknown-slug");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });
  });
});
