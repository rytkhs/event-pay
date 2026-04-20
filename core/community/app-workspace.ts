import { cache } from "react";

import { redirect } from "next/navigation";

import {
  requireCurrentAppUserForServerComponent,
  type CurrentAppUser,
} from "@core/auth/auth-utils";
import {
  resolveCurrentCommunityForServerComponent,
  type CurrentCommunityResolution,
  type CurrentCommunitySummary,
} from "@core/community/current-community";

export type AppWorkspaceContext = {
  currentUser: CurrentAppUser;
  currentCommunity: CurrentCommunitySummary | null;
  ownedCommunities: CurrentCommunitySummary[];
  hasOwnedCommunities: boolean;
  isCommunityEmptyState: boolean;
  currentCommunityResolution: CurrentCommunityResolution;
};

export type AppWorkspaceShellData = {
  currentCommunity: CurrentCommunitySummary | null;
  ownedCommunities: CurrentCommunitySummary[];
  hasOwnedCommunities: boolean;
  isCommunityEmptyState: boolean;
};

function buildAppWorkspaceContext(
  currentUser: CurrentAppUser,
  currentCommunityResolution: CurrentCommunityResolution
): AppWorkspaceContext {
  const hasOwnedCommunities = currentCommunityResolution.ownedCommunities.length > 0;

  return {
    currentUser,
    currentCommunity: currentCommunityResolution.currentCommunity,
    ownedCommunities: currentCommunityResolution.ownedCommunities,
    hasOwnedCommunities,
    isCommunityEmptyState: !hasOwnedCommunities,
    currentCommunityResolution,
  };
}

const getCachedAppWorkspaceForServerComponent = cache(async (): Promise<AppWorkspaceContext> => {
  const [currentUser, currentCommunityResolution] = await Promise.all([
    requireCurrentAppUserForServerComponent(),
    resolveCurrentCommunityForServerComponent(),
  ]);

  return buildAppWorkspaceContext(currentUser, currentCommunityResolution);
});

export async function resolveAppWorkspaceForServerComponent(): Promise<AppWorkspaceContext> {
  return await getCachedAppWorkspaceForServerComponent();
}

export async function requireNonEmptyCommunityWorkspaceForServerComponent(): Promise<AppWorkspaceContext> {
  const workspace = await resolveAppWorkspaceForServerComponent();

  if (workspace.isCommunityEmptyState) {
    redirect("/communities/create");
  }

  return workspace;
}

export function toAppWorkspaceShellData(
  workspace: Pick<
    AppWorkspaceContext,
    "currentCommunity" | "ownedCommunities" | "hasOwnedCommunities" | "isCommunityEmptyState"
  >
): AppWorkspaceShellData {
  return {
    currentCommunity: workspace.currentCommunity,
    ownedCommunities: workspace.ownedCommunities,
    hasOwnedCommunities: workspace.hasOwnedCommunities,
    isCommunityEmptyState: workspace.isCommunityEmptyState,
  };
}
