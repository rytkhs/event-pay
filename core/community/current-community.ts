import { cache } from "react";

import { cookies } from "next/headers";

import type { User } from "@supabase/supabase-js";

import {
  getCurrentUserForServerAction,
  requireCurrentUserForServerComponent,
} from "@core/auth/auth-utils";
import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import { logger } from "@core/logging/app-logger";
import {
  createServerActionSupabaseClient,
  createServerComponentSupabaseClient,
} from "@core/supabase/factory";
import type { AppSupabaseClient } from "@core/types/supabase";

export const CURRENT_COMMUNITY_COOKIE_NAME = "current_community_id";
export const CURRENT_COMMUNITY_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export type CurrentCommunitySummary = {
  description?: string | null;
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type CurrentCommunityResolvedBy = "cookie" | "empty" | "oldest_fallback";

export type CurrentCommunityResolution = {
  currentCommunity: CurrentCommunitySummary | null;
  ownedCommunities: CurrentCommunitySummary[];
  requestedCommunityId: string | null;
  resolvedBy: CurrentCommunityResolvedBy;
};

export type CurrentCommunityResolutionResult = AppResult<CurrentCommunityResolution>;
export type CurrentCommunityServerActionContext = {
  currentCommunity: CurrentCommunitySummary;
  user: User;
};

type ResolveCurrentCommunityContextParams = {
  userId: string;
  supabase: AppSupabaseClient;
  requestedCommunityId?: string | null;
};

type CommunitiesQueryResult = {
  created_at: string;
  description?: string | null;
  id: string;
  name: string;
  slug: string;
};

const CURRENT_COMMUNITY_ERROR_MESSAGE = "コミュニティ情報の取得に失敗しました";

function mapCommunitySummary(community: CommunitiesQueryResult): CurrentCommunitySummary {
  return {
    description: community.description ?? null,
    id: community.id,
    name: community.name,
    slug: community.slug,
    createdAt: community.created_at,
  };
}

function getCurrentCommunityCookieOptions() {
  return {
    httpOnly: true,
    maxAge: CURRENT_COMMUNITY_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export async function readCurrentCommunityCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(CURRENT_COMMUNITY_COOKIE_NAME)?.value ?? null;
}

export async function setCurrentCommunityCookie(communityId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_COMMUNITY_COOKIE_NAME, communityId, getCurrentCommunityCookieOptions());
}

export async function clearCurrentCommunityCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_COMMUNITY_COOKIE_NAME, "", {
    ...getCurrentCommunityCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
}

export async function listOwnedCommunities(
  supabase: AppSupabaseClient,
  userId: string
): Promise<AppResult<CurrentCommunitySummary[]>> {
  const { data, error } = await supabase
    .from("communities")
    .select("id, name, slug, created_at, description")
    .eq("created_by", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    logger.error("Failed to list owned communities for current community resolution", {
      category: "system",
      action: "community.current_context.list_owned",
      outcome: "failure",
      user_id: userId,
      error,
    });

    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: error,
        details: {
          operation: "list_owned_communities",
          userId,
        },
        retryable: true,
        userMessage: CURRENT_COMMUNITY_ERROR_MESSAGE,
      })
    );
  }

  return okResult((data ?? []).map(mapCommunitySummary));
}

export async function resolveCurrentCommunityContext({
  userId,
  supabase,
  requestedCommunityId,
}: ResolveCurrentCommunityContextParams): Promise<CurrentCommunityResolutionResult> {
  const ownedCommunitiesResult = await listOwnedCommunities(supabase, userId);

  if (!ownedCommunitiesResult.success) {
    return ownedCommunitiesResult;
  }

  const ownedCommunities = ownedCommunitiesResult.data ?? [];
  const normalizedRequestedCommunityId = requestedCommunityId ?? null;

  if (ownedCommunities.length === 0) {
    return okResult({
      currentCommunity: null,
      ownedCommunities,
      requestedCommunityId: normalizedRequestedCommunityId,
      resolvedBy: "empty",
    });
  }

  const resolvedFromCookie =
    normalizedRequestedCommunityId === null
      ? null
      : (ownedCommunities.find((community) => community.id === normalizedRequestedCommunityId) ??
        null);

  if (resolvedFromCookie) {
    return okResult({
      currentCommunity: resolvedFromCookie,
      ownedCommunities,
      requestedCommunityId: normalizedRequestedCommunityId,
      resolvedBy: "cookie",
    });
  }

  return okResult({
    currentCommunity: ownedCommunities[0] ?? null,
    ownedCommunities,
    requestedCommunityId: normalizedRequestedCommunityId,
    resolvedBy: "oldest_fallback",
  });
}

const getCachedCurrentCommunityForServerComponent = cache(
  async (): Promise<CurrentCommunityResolution> => {
    const user = await requireCurrentUserForServerComponent();
    const supabase = await createServerComponentSupabaseClient();
    const requestedCommunityId = await readCurrentCommunityCookie();

    const result = await resolveCurrentCommunityContext({
      userId: user.id,
      supabase,
      requestedCommunityId,
    });

    if (!result.success) {
      throw result.error;
    }

    if (!result.data) {
      throw new AppError("INTERNAL_ERROR", {
        message: "Current community resolution returned no data.",
        userMessage: CURRENT_COMMUNITY_ERROR_MESSAGE,
      });
    }

    return result.data;
  }
);

export async function resolveCurrentCommunityForServerComponent(): Promise<CurrentCommunityResolution> {
  return await getCachedCurrentCommunityForServerComponent();
}

export async function resolveCurrentCommunityForServerAction(
  userOverride?: User
): Promise<CurrentCommunityResolutionResult> {
  const user = userOverride ?? (await getCurrentUserForServerAction());
  if (!user) {
    return errResult(
      new AppError("UNAUTHORIZED", {
        userMessage: "認証が必要です",
      })
    );
  }
  const supabase = await createServerActionSupabaseClient();
  const requestedCommunityId = await readCurrentCommunityCookie();

  return await resolveCurrentCommunityContext({
    userId: user.id,
    supabase,
    requestedCommunityId,
  });
}

export async function getCurrentCommunityServerActionContext(): Promise<
  AppResult<CurrentCommunityServerActionContext>
> {
  const user = await getCurrentUserForServerAction();
  if (!user) {
    return errResult(
      new AppError("UNAUTHORIZED", {
        userMessage: "認証が必要です",
      })
    );
  }

  const currentCommunityResolution = await resolveCurrentCommunityForServerAction(user);
  if (!currentCommunityResolution.success) {
    return currentCommunityResolution;
  }

  const currentCommunity = currentCommunityResolution.data?.currentCommunity;
  if (!currentCommunity) {
    return errResult(
      new AppError("NOT_FOUND", {
        userMessage: "操作対象のコミュニティが見つかりません",
      })
    );
  }

  return okResult({
    currentCommunity,
    user,
  });
}
