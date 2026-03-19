"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { setCurrentCommunityCookie } from "@core/community/current-community";
import {
  fail,
  failFrom,
  ok,
  toActionResultFromAppResult,
  zodFail,
  type ActionResult,
} from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";

import { createCommunity, createCommunitySchema } from "@features/communities/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

type CreateCommunityActionResult = ActionResult<{ communityId: string }>;

function getStringFormValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

export async function createCommunityAction(
  formData: FormData
): Promise<CreateCommunityActionResult> {
  ensureFeaturesRegistered();

  try {
    const user = await getCurrentUserForServerAction();

    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const parsedInput = createCommunitySchema.safeParse({
      description: getStringFormValue(formData, "description"),
      name: getStringFormValue(formData, "name"),
    });

    if (!parsedInput.success) {
      return zodFail(parsedInput.error, { userMessage: "入力内容を確認してください" });
    }

    const supabase = await createServerActionSupabaseClient();
    const result = await createCommunity(supabase, user.id, parsedInput.data);

    if (!result.success || !result.data) {
      return result.success
        ? fail("INTERNAL_ERROR", { userMessage: "コミュニティの作成に失敗しました" })
        : toActionResultFromAppResult(result);
    }

    await setCurrentCommunityCookie(result.data.communityId);
    revalidatePath("/(app)", "layout");

    return ok(
      {
        communityId: result.data.communityId,
      },
      {
        message: "コミュニティを作成しました",
        redirectUrl: "/dashboard",
      }
    );
  } catch (error) {
    return failFrom(error, {
      userMessage: "コミュニティの作成に失敗しました",
    });
  }
}
