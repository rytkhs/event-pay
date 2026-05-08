"use server";

import { revalidatePath } from "next/cache";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import {
  clearCurrentCommunityCookie,
  listOwnedCommunities,
  resolveCurrentCommunityContext,
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
import { logger } from "@core/logging/app-logger";
import { createServerActionSupabaseClient } from "@core/supabase/factory";

import {
  createCommunity,
  createCommunitySchema,
  deleteCommunity,
  updateCommunityBasicInfo,
  updateCommunityBasicInfoSchema,
  updateCommunityProfileVisibility,
  updateCommunityProfileVisibilitySchema,
} from "@features/communities/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

export type CreateCommunityActionResult = ActionResult<{ communityId: string }>;
export type UpdateCommunityBasicInfoActionResult = ActionResult<{
  communityId: string;
  description: string | null;
  name: string;
}>;
export type UpdateCommunityProfileVisibilityActionResult = ActionResult<{
  communityId: string;
  showCommunityLink: boolean;
}>;
export type DeleteCommunityActionResult = ActionResult<{
  deletedCommunityId: string;
  nextCurrentCommunityId: string | null;
}>;

function getStringFormValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function getBooleanFormValue(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "true" || value === "on";
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
      logger.warn("Unauthenticated community create attempt", {
        category: "authentication",
        action: "community.create",
        actor_type: "anonymous",
        outcome: "failure",
      });
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
    const ownedCommunitiesResult = await listOwnedCommunities(supabase, user.id);
    if (!ownedCommunitiesResult.success) {
      return toActionResultFromAppResult(ownedCommunitiesResult, {
        userMessage: "コミュニティの作成に失敗しました",
      });
    }

    const isInitialCommunity = (ownedCommunitiesResult.data ?? []).length === 0;
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
        redirectUrl: isInitialCommunity ? "/onboarding/payments" : "/dashboard",
      }
    );
  } catch (error) {
    return failFrom(error, {
      userMessage: "コミュニティの作成に失敗しました",
    });
  }
}

export async function updateCommunityBasicInfoAction(
  formData: FormData
): Promise<UpdateCommunityBasicInfoActionResult>;
export async function updateCommunityBasicInfoAction(
  _state: UpdateCommunityBasicInfoActionResult,
  formData: FormData
): Promise<UpdateCommunityBasicInfoActionResult>;
export async function updateCommunityBasicInfoAction(
  stateOrFormData: UpdateCommunityBasicInfoActionResult | FormData,
  maybeFormData?: FormData
): Promise<UpdateCommunityBasicInfoActionResult> {
  ensureFeaturesRegistered();

  try {
    const formData = resolveActionFormData(stateOrFormData, maybeFormData);
    const user = await getCurrentUserForServerAction();

    if (!user) {
      logger.warn("Unauthenticated community basic info update attempt", {
        category: "authentication",
        action: "community.update_basic_info",
        actor_type: "anonymous",
        outcome: "failure",
      });
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const parsedInput = updateCommunityBasicInfoSchema.safeParse({
      description: getStringFormValue(formData, "description"),
      name: getStringFormValue(formData, "name"),
    });

    if (!parsedInput.success) {
      return zodFail(parsedInput.error, { userMessage: "入力内容を確認してください" });
    }

    const resolutionResult = await resolveCurrentCommunityForServerAction();

    if (!resolutionResult.success) {
      return toActionResultFromAppResult(resolutionResult, {
        userMessage: "コミュニティの更新に失敗しました",
      });
    }

    if (!resolutionResult.data) {
      return fail("INTERNAL_ERROR", { userMessage: "コミュニティの更新に失敗しました" });
    }

    const currentCommunity = resolutionResult.data.currentCommunity;

    if (!currentCommunity) {
      return fail("NOT_FOUND", { userMessage: "更新対象のコミュニティが見つかりません" });
    }

    const supabase = await createServerActionSupabaseClient();
    const result = await updateCommunityBasicInfo(
      supabase,
      user.id,
      currentCommunity.id,
      parsedInput.data
    );

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

export async function updateCommunityProfileVisibilityAction(
  formData: FormData
): Promise<UpdateCommunityProfileVisibilityActionResult>;
export async function updateCommunityProfileVisibilityAction(
  _state: UpdateCommunityProfileVisibilityActionResult,
  formData: FormData
): Promise<UpdateCommunityProfileVisibilityActionResult>;
export async function updateCommunityProfileVisibilityAction(
  stateOrFormData: UpdateCommunityProfileVisibilityActionResult | FormData,
  maybeFormData?: FormData
): Promise<UpdateCommunityProfileVisibilityActionResult> {
  ensureFeaturesRegistered();

  try {
    const formData = resolveActionFormData(stateOrFormData, maybeFormData);
    const user = await getCurrentUserForServerAction();

    if (!user) {
      logger.warn("Unauthenticated community profile visibility update attempt", {
        category: "authentication",
        action: "community.update_profile_visibility",
        actor_type: "anonymous",
        outcome: "failure",
      });
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const parsedInput = updateCommunityProfileVisibilitySchema.safeParse({
      showCommunityLink: getBooleanFormValue(formData, "showCommunityLink"),
    });

    if (!parsedInput.success) {
      return zodFail(parsedInput.error, { userMessage: "入力内容を確認してください" });
    }

    const resolutionResult = await resolveCurrentCommunityForServerAction();

    if (!resolutionResult.success) {
      return toActionResultFromAppResult(resolutionResult, {
        userMessage: "コミュニティプロフィールの表示設定の更新に失敗しました",
      });
    }

    if (!resolutionResult.data) {
      return fail("INTERNAL_ERROR", {
        userMessage: "コミュニティプロフィールの表示設定の更新に失敗しました",
      });
    }

    const currentCommunity = resolutionResult.data.currentCommunity;

    if (!currentCommunity) {
      return fail("NOT_FOUND", { userMessage: "更新対象のコミュニティが見つかりません" });
    }

    const supabase = await createServerActionSupabaseClient();
    const result = await updateCommunityProfileVisibility(
      supabase,
      user.id,
      currentCommunity.id,
      parsedInput.data
    );

    if (!result.success || !result.data) {
      return result.success
        ? fail("INTERNAL_ERROR", {
            userMessage: "コミュニティプロフィールの表示設定の更新に失敗しました",
          })
        : toActionResultFromAppResult(result);
    }

    revalidatePath("/(app)", "layout");

    return ok(
      {
        communityId: result.data.communityId,
        showCommunityLink: result.data.showCommunityLink,
      },
      {
        message: "コミュニティプロフィールの表示設定を更新しました",
      }
    );
  } catch (error) {
    return failFrom(error, {
      userMessage: "コミュニティプロフィールの表示設定の更新に失敗しました",
    });
  }
}

export async function deleteCommunityAction(
  formData: FormData
): Promise<DeleteCommunityActionResult>;
export async function deleteCommunityAction(
  _state: DeleteCommunityActionResult,
  formData: FormData
): Promise<DeleteCommunityActionResult>;
export async function deleteCommunityAction(
  stateOrFormData: DeleteCommunityActionResult | FormData,
  maybeFormData?: FormData
): Promise<DeleteCommunityActionResult> {
  ensureFeaturesRegistered();

  try {
    resolveActionFormData(stateOrFormData, maybeFormData);
    const user = await getCurrentUserForServerAction();

    if (!user) {
      logger.warn("Unauthenticated community delete attempt", {
        category: "authentication",
        action: "community.delete",
        actor_type: "anonymous",
        outcome: "failure",
      });
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const resolutionResult = await resolveCurrentCommunityForServerAction();

    if (!resolutionResult.success) {
      return toActionResultFromAppResult(resolutionResult, {
        userMessage: "コミュニティの削除に失敗しました",
      });
    }

    if (!resolutionResult.data) {
      return fail("INTERNAL_ERROR", { userMessage: "コミュニティの削除に失敗しました" });
    }

    const currentCommunity = resolutionResult.data.currentCommunity;

    if (!currentCommunity) {
      return fail("NOT_FOUND", { userMessage: "削除対象のコミュニティが見つかりません" });
    }

    const supabase = await createServerActionSupabaseClient();
    const result = await deleteCommunity(supabase, user.id, currentCommunity.id);

    if (!result.success || !result.data) {
      return result.success
        ? fail("INTERNAL_ERROR", { userMessage: "コミュニティの削除に失敗しました" })
        : toActionResultFromAppResult(result);
    }

    const nextResolutionResult = await resolveCurrentCommunityContext({
      userId: user.id,
      supabase,
      requestedCommunityId: null,
    });

    let nextCurrentCommunityId: string | null = null;

    if (nextResolutionResult.success && nextResolutionResult.data?.currentCommunity?.id) {
      nextCurrentCommunityId = nextResolutionResult.data.currentCommunity.id;
      await setCurrentCommunityCookie(nextCurrentCommunityId);
      logger.info("Current community switched after community deletion", {
        category: "system",
        action: "community.delete.current_context_resolved",
        actor_type: "user",
        outcome: "success",
        resource_type: "community",
        resource_id: result.data.communityId,
        user_id: user.id,
        deletedCommunityId: result.data.communityId,
        communityId: nextCurrentCommunityId,
        resolvedBy: nextResolutionResult.data.resolvedBy,
      });
    } else {
      await clearCurrentCommunityCookie();
      if (nextResolutionResult.success) {
        logger.info("Current community cleared after community deletion", {
          category: "system",
          action: "community.delete.current_context_cleared",
          actor_type: "user",
          outcome: "success",
          resource_type: "community",
          resource_id: result.data.communityId,
          user_id: user.id,
          deletedCommunityId: result.data.communityId,
          communityId: null,
          resolvedBy: nextResolutionResult.data?.resolvedBy ?? "empty",
        });
      }
    }

    revalidatePath("/(app)", "layout");

    return ok(
      {
        deletedCommunityId: result.data.communityId,
        nextCurrentCommunityId,
      },
      {
        message: "コミュニティを削除しました",
        redirectUrl: "/dashboard",
      }
    );
  } catch (error) {
    return failFrom(error, {
      userMessage: "コミュニティの削除に失敗しました",
    });
  }
}
