"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import {
  resolveCurrentCommunityForServerAction,
  setCurrentCommunityCookie,
} from "@core/community/current-community";
import {
  fail,
  failFrom,
  ok,
  toActionResultFromAppResult,
  zodFail,
  type ActionResult,
} from "@core/errors/adapters/server-actions";
import { createServerActionSupabaseClient } from "@core/supabase/factory";

import {
  createCommunity,
  createCommunitySchema,
  updateCommunity,
  updateCommunitySchema,
} from "@features/communities/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export type CreateCommunityActionResult = ActionResult<{ communityId: string }>;
export type UpdateCommunityActionResult = ActionResult<{
  communityId: string;
  description: string | null;
  name: string;
}>;

function getStringFormValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function resolveActionFormData(
  stateOrFormData: ActionResult<unknown> | FormData,
  maybeFormData?: FormData
): FormData {
  if (stateOrFormData instanceof FormData) {
    return stateOrFormData;
  }

  if (maybeFormData instanceof FormData) {
    return maybeFormData;
  }

  throw new TypeError("FormData is required");
}

export async function createCommunityAction(
  formData: FormData
): Promise<CreateCommunityActionResult>;
export async function createCommunityAction(
  _state: CreateCommunityActionResult,
  formData: FormData
): Promise<CreateCommunityActionResult>;
export async function createCommunityAction(
  stateOrFormData: CreateCommunityActionResult | FormData,
  maybeFormData?: FormData
): Promise<CreateCommunityActionResult> {
  ensureFeaturesRegistered();

  try {
    const formData = resolveActionFormData(stateOrFormData, maybeFormData);
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

export async function updateCommunityAction(
  formData: FormData
): Promise<UpdateCommunityActionResult>;
export async function updateCommunityAction(
  _state: UpdateCommunityActionResult,
  formData: FormData
): Promise<UpdateCommunityActionResult>;
export async function updateCommunityAction(
  stateOrFormData: UpdateCommunityActionResult | FormData,
  maybeFormData?: FormData
): Promise<UpdateCommunityActionResult> {
  ensureFeaturesRegistered();

  try {
    const formData = resolveActionFormData(stateOrFormData, maybeFormData);
    const user = await getCurrentUserForServerAction();

    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const parsedInput = updateCommunitySchema.safeParse({
      description: getStringFormValue(formData, "description"),
      name: getStringFormValue(formData, "name"),
    });

    if (!parsedInput.success) {
      return zodFail(parsedInput.error, { userMessage: "入力内容を確認してください" });
    }

    const resolution = await resolveCurrentCommunityForServerAction();
    const currentCommunity = resolution.currentCommunity;

    if (!currentCommunity) {
      return fail("NOT_FOUND", { userMessage: "更新対象のコミュニティが見つかりません" });
    }

    const supabase = await createServerActionSupabaseClient();
    const result = await updateCommunity(supabase, user.id, currentCommunity.id, parsedInput.data);

    if (!result.success || !result.data) {
      return result.success
        ? fail("INTERNAL_ERROR", { userMessage: "コミュニティの更新に失敗しました" })
        : toActionResultFromAppResult(result);
    }

    revalidatePath("/(app)", "layout");

    return ok(
      {
        communityId: result.data.communityId,
        description: result.data.description,
        name: result.data.name,
      },
      {
        message: "コミュニティを更新しました",
      }
    );
  } catch (error) {
    return failFrom(error, {
      userMessage: "コミュニティの更新に失敗しました",
    });
  }
}
