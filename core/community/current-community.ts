import { cache } from "react";

import { cookies } from "next/headers";

import {
  requireCurrentUserForServerAction,
  requireCurrentUserForServerComponent,
} from "@core/auth/auth-utils";
import {
  createServerActionSupabaseClient,
  createServerComponentSupabaseClient,
} from "@core/supabase/factory";
import type { AppSupabaseClient } from "@core/types/supabase";

export const CURRENT_COMMUNITY_COOKIE_NAME = "current_community_id";
export const CURRENT_COMMUNITY_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export type CurrentCommunitySummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
};

export type CurrentCommunityCookieMutation = "clear" | "none" | "set";
export type CurrentCommunityResolvedBy = "cookie" | "empty" | "oldest_fallback";

export type CurrentCommunityResolution = {
  currentCommunity: CurrentCommunitySummary | null;
  ownedCommunities: CurrentCommunitySummary[];
  requestedCommunityId: string | null;
  cookieMutation: CurrentCommunityCookieMutation;
  resolvedBy: CurrentCommunityResolvedBy;
};

type ResolveCurrentCommunityContextParams = {
  userId: string;
  supabase: AppSupabaseClient;
  requestedCommunityId?: string | null;
};

type CommunitiesQueryResult = {
  created_at: string;
  id: string;
  name: string;
  slug: string;
};

function mapCommunitySummary(community: CommunitiesQueryResult): CurrentCommunitySummary {
  return {
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
): Promise<CurrentCommunitySummary[]> {
  const { data, error } = await supabase
    .from("communities")
    .select("id, name, slug, created_at")
    .eq("created_by", userId)
    .eq("is_deleted", false)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapCommunitySummary);
}

export async function resolveCurrentCommunityContext({
  userId,
  supabase,
  requestedCommunityId,
}: ResolveCurrentCommunityContextParams): Promise<CurrentCommunityResolution> {
  const ownedCommunities = await listOwnedCommunities(supabase, userId);
  const normalizedRequestedCommunityId = requestedCommunityId ?? null;

  if (ownedCommunities.length === 0) {
    return {
      currentCommunity: null,
      ownedCommunities,
      requestedCommunityId: normalizedRequestedCommunityId,
      cookieMutation: "clear",
      resolvedBy: "empty",
    };
  }

  const resolvedFromCookie =
    normalizedRequestedCommunityId === null
      ? null
      : (ownedCommunities.find((community) => community.id === normalizedRequestedCommunityId) ??
        null);

  if (resolvedFromCookie) {
    return {
      currentCommunity: resolvedFromCookie,
      ownedCommunities,
      requestedCommunityId: normalizedRequestedCommunityId,
      cookieMutation: "none",
      resolvedBy: "cookie",
    };
  }

  return {
    currentCommunity: ownedCommunities[0] ?? null,
    ownedCommunities,
    requestedCommunityId: normalizedRequestedCommunityId,
    cookieMutation: "set",
    resolvedBy: "oldest_fallback",
  };
}

const getCachedCurrentCommunityForServerComponent = cache(
  async (): Promise<CurrentCommunityResolution> => {
    const user = await requireCurrentUserForServerComponent();
    const supabase = await createServerComponentSupabaseClient();
    const requestedCommunityId = await readCurrentCommunityCookie();

    return await resolveCurrentCommunityContext({
      userId: user.id,
      supabase,
      requestedCommunityId,
    });
  }
);

export async function resolveCurrentCommunityForServerComponent(): Promise<CurrentCommunityResolution> {
  return await getCachedCurrentCommunityForServerComponent();
}

export async function resolveCurrentCommunityForServerAction(): Promise<CurrentCommunityResolution> {
  const user = await requireCurrentUserForServerAction();
  const supabase = await createServerActionSupabaseClient();
  const requestedCommunityId = await readCurrentCommunityCookie();

  return await resolveCurrentCommunityContext({
    userId: user.id,
    supabase,
    requestedCommunityId,
  });
}
