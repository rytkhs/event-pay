"use server";

import { z } from "zod";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import {
  clearCurrentCommunityCookie,
  resolveCurrentCommunityContext,
  setCurrentCommunityCookie,
} from "@core/community/current-community";
import { fail, failFrom, ok, type ActionResult } from "@core/errors/adapters/server-actions";
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
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    if (nextCommunityId === null) {
      await clearCurrentCommunityCookie();
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
    const resolution = await resolveCurrentCommunityContext({
      userId: user.id,
      supabase,
      requestedCommunityId: parsedCommunityId.data,
    });

    if (resolution.currentCommunity?.id !== parsedCommunityId.data) {
      return fail("FORBIDDEN", {
        userMessage: "このコミュニティを選択する権限がありません",
      });
    }

    await setCurrentCommunityCookie(parsedCommunityId.data);

    return ok({
      currentCommunityId: parsedCommunityId.data,
    });
  } catch (error) {
    return failFrom(error, {
      userMessage: "現在選択中コミュニティの更新に失敗しました",
    });
  }
}
