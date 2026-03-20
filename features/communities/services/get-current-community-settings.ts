import "server-only";

import { getPublicUrl } from "@core/seo/metadata";
import type { AppSupabaseClient } from "@core/types/supabase";

type CommunitySettingsRow = {
  description: string | null;
  id: string;
  name: string;
  slug: string;
};

export type CurrentCommunitySettingsReadModel = {
  community: {
    description: string | null;
    id: string;
    name: string;
    slug: string;
  };
  publicPageUrl: string;
};

export async function getCurrentCommunitySettings(
  supabase: AppSupabaseClient,
  ownerUserId: string,
  currentCommunityId: string
): Promise<CurrentCommunitySettingsReadModel | null> {
  const { data: community, error: communityError } = await supabase
    .from("communities")
    .select("id, name, description, slug")
    .eq("id", currentCommunityId)
    .eq("created_by", ownerUserId)
    .eq("is_deleted", false)
    .maybeSingle<CommunitySettingsRow>();

  if (communityError) {
    throw communityError;
  }

  if (!community) {
    return null;
  }

  return {
    community: {
      description: community.description,
      id: community.id,
      name: community.name,
      slug: community.slug,
    },
    publicPageUrl: getPublicUrl(`/c/${community.slug}`),
  };
}
