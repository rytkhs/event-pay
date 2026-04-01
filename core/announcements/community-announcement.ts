import { cache } from "react";

import { cookies } from "next/headers";

import { createServerComponentSupabaseClient } from "@core/supabase/factory";

export const COMMUNITY_ANNOUNCEMENT_EXISTING_USER_CUTOFF_AT_ENV =
  "COMMUNITY_ANNOUNCEMENT_EXISTING_USER_CUTOFF_AT";
export const COMMUNITY_ANNOUNCEMENT_DISMISS_COOKIE_NAME =
  "community_announcement_launch_v1_dismissed";
export const COMMUNITY_ANNOUNCEMENT_DISMISS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

type CommunityAnnouncementState = {
  shouldShow: boolean;
};

function getCommunityAnnouncementCookieOptions() {
  return {
    httpOnly: true,
    maxAge: COMMUNITY_ANNOUNCEMENT_DISMISS_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

function parseCommunityAnnouncementCutoffAt(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

async function hasDismissedCommunityAnnouncement(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(COMMUNITY_ANNOUNCEMENT_DISMISS_COOKIE_NAME)?.value === "true";
}

async function getUserCreatedAt(userId: string): Promise<Date | null> {
  const supabase = await createServerComponentSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("created_at")
    .eq("id", userId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (error || !data?.created_at) {
    return null;
  }

  const createdAt = new Date(data.created_at);
  return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

const getCachedCommunityAnnouncementState = cache(
  async (userId: string): Promise<CommunityAnnouncementState> => {
    const cutoffAt = parseCommunityAnnouncementCutoffAt(
      process.env[COMMUNITY_ANNOUNCEMENT_EXISTING_USER_CUTOFF_AT_ENV]
    );

    if (!cutoffAt) {
      return { shouldShow: false };
    }

    if (await hasDismissedCommunityAnnouncement()) {
      return { shouldShow: false };
    }

    const userCreatedAt = await getUserCreatedAt(userId);
    if (!userCreatedAt) {
      return { shouldShow: false };
    }

    return {
      shouldShow: userCreatedAt < cutoffAt,
    };
  }
);

export async function resolveCommunityAnnouncementForServerComponent(
  userId: string
): Promise<CommunityAnnouncementState> {
  return await getCachedCommunityAnnouncementState(userId);
}

export async function dismissCommunityAnnouncement(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(
    COMMUNITY_ANNOUNCEMENT_DISMISS_COOKIE_NAME,
    "true",
    getCommunityAnnouncementCookieOptions()
  );
}
