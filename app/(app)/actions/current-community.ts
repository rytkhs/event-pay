"use server";

import { z } from "zod";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import {
  clearCurrentCommunityCookie,
  resolveCurrentCommunityContext,
  setCurrentCommunityCookie,
} from "@core/community/current-community";
import {
  fail,
  failFrom,
  ok,
  toActionResultFromAppResult,
  type ActionResult,
} from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { createServerActionSupabaseClient } from "@core/supabase/factory";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

const currentCommunityIdSchema = z.string().uuid("有効なコミュニティIDを指定してください");

type UpdateCurrentCommunityResult = ActionResult<{ currentCommunityId: string | null }>;

export async function updateCurrentCommunityAction(
  nextCommunityId: string | null
): Promise<UpdateCurrentCommunityResult> {
  ensureFeaturesRegistered();

  try {
    const user = await getCurrentUserForServerAction();

    if (!user) {
      logger.warn("Unauthenticated current community switch attempt", {
        category: "authentication",
        action: "community.switch",
        actor_type: "anonymous",
        outcome: "failure",
      });
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    if (nextCommunityId === null) {
      await clearCurrentCommunityCookie();
      logger.info("Current community selection cleared", {
        category: "system",
        action: "community.switch.clear",
        actor_type: "user",
        outcome: "success",
        user_id: user.id,
      });
      return ok({ currentCommunityId: null });
    }

    const parsedCommunityId = currentCommunityIdSchema.safeParse(nextCommunityId);

    if (!parsedCommunityId.success) {
      return fail("VALIDATION_ERROR", {
        fieldErrors: {
          nextCommunityId: ["有効なコミュニティIDを指定してください"],
        },
        userMessage: "有効なコミュニティIDを指定してください",
      });
    }

    const supabase = await createServerActionSupabaseClient();
    const resolutionResult = await resolveCurrentCommunityContext({
      userId: user.id,
      supabase,
      requestedCommunityId: parsedCommunityId.data,
    });

    if (!resolutionResult.success) {
      return toActionResultFromAppResult(resolutionResult, {
        userMessage: "現在選択中コミュニティの更新に失敗しました",
      });
    }

    if (!resolutionResult.data) {
      return fail("INTERNAL_ERROR", {
        userMessage: "現在選択中コミュニティの更新に失敗しました",
      });
    }

    const resolution = resolutionResult.data;

    if (resolution.currentCommunity?.id !== parsedCommunityId.data) {
      logger.warn("Current community switch forbidden", {
        category: "authorization",
        action: "community.switch",
        actor_type: "user",
        outcome: "failure",
        resource_type: "community",
        resource_id: parsedCommunityId.data,
        user_id: user.id,
        requestedCommunityId: parsedCommunityId.data,
        communityId: resolution.currentCommunity?.id ?? null,
        resolvedBy: resolution.resolvedBy,
      });
      return fail("FORBIDDEN", {
        userMessage: "このコミュニティを選択する権限がありません",
      });
    }

    await setCurrentCommunityCookie(parsedCommunityId.data);
    logger.info("Current community switched", {
      category: "system",
      action: "community.switch",
      actor_type: "user",
      outcome: "success",
      resource_type: "community",
      resource_id: parsedCommunityId.data,
      user_id: user.id,
      requestedCommunityId: parsedCommunityId.data,
      communityId: parsedCommunityId.data,
      resolvedBy: resolution.resolvedBy,
    });

    return ok({
      currentCommunityId: parsedCommunityId.data,
    });
  } catch (error) {
    return failFrom(error, {
      userMessage: "現在選択中コミュニティの更新に失敗しました",
    });
  }
}
