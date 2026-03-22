import "server-only";

import { AppError, errResult, okResult, type AppResult } from "@core/errors";
import type { AppSupabaseClient } from "@core/types/supabase";

import { getPublicCommunityBySlug } from "./get-public-community";

export type CreateCommunityContactInput = {
  communitySlug: string;
  email: string;
  fingerprintHash: string;
  ipHash: string | null;
  message: string;
  name: string;
  userAgent: string | null;
};

export type CommunityContactCreated = {
  communityId: string;
  communityName: string;
  communitySlug: string;
};

const CREATE_COMMUNITY_CONTACT_ERROR_MESSAGE = "お問い合わせの送信に失敗しました";

export async function createCommunityContact(
  supabase: AppSupabaseClient,
  input: CreateCommunityContactInput
): Promise<AppResult<CommunityContactCreated>> {
  const communityResult = await getPublicCommunityBySlug(supabase, input.communitySlug);
  if (!communityResult.success) {
    return communityResult;
  }

  const community = communityResult.data;
  if (!community) {
    return errResult(
      new AppError("NOT_FOUND", {
        userMessage: "対象のコミュニティが見つかりません",
        retryable: false,
        details: { slug: input.communitySlug },
      })
    );
  }

  const { error } = await supabase.from("community_contacts").insert({
    community_id: community.id,
    name: input.name,
    email: input.email,
    message: input.message,
    fingerprint_hash: input.fingerprintHash,
    user_agent: input.userAgent,
    ip_hash: input.ipHash,
  });

  if (error) {
    if (error.code === "23505") {
      return errResult(
        new AppError("RESOURCE_CONFLICT", {
          userMessage: "同一内容の短時間での再送は制限しています",
          retryable: true,
          details: { slug: input.communitySlug },
        })
      );
    }

    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: error,
        userMessage: CREATE_COMMUNITY_CONTACT_ERROR_MESSAGE,
        retryable: true,
        details: {
          operation: "create_community_contact",
          slug: input.communitySlug,
        },
      })
    );
  }

  return okResult({
    communityId: community.id,
    communityName: community.name,
    communitySlug: community.slug,
  });
}
