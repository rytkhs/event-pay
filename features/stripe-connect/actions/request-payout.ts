import { revalidatePath, revalidateTag } from "next/cache";

import { getCurrentUserForServerAction } from "@core/auth/auth-utils";
import { resolveCurrentCommunityForServerComponent } from "@core/community/current-community";
import {
  fail,
  failFrom,
  toActionResultFromAppResult,
  type ActionResult,
} from "@core/errors/adapters/server-actions";
import { createAuditedAdminClient } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import type { AppSupabaseClient } from "@core/types/supabase";
import { handleServerError } from "@core/utils/error-handler.server";

import { PayoutRequestService } from "../services/payout-request-service";
import type { RequestPayoutPayload } from "../types/payout-request";

export type { RequestPayoutPayload } from "../types/payout-request";

export async function requestPayoutAction(): Promise<ActionResult<RequestPayoutPayload>> {
  try {
    const user = await getCurrentUserForServerAction();
    if (!user) {
      return fail("UNAUTHORIZED", { userMessage: "認証が必要です" });
    }

    const currentCommunityResult = await resolveCurrentCommunityForServerComponent();
    const currentCommunity = currentCommunityResult.currentCommunity;
    if (!currentCommunity) {
      return fail("NOT_FOUND", { userMessage: "コミュニティが見つかりません。" });
    }

    const supabase = (await createAuditedAdminClient(
      AdminReason.PAYMENT_PROCESSING,
      "User requested connected account payout"
    )) as AppSupabaseClient;
    const service = new PayoutRequestService(supabase);
    const result = await service.requestPayout({
      userId: user.id,
      communityId: currentCommunity.id,
    });

    if (!result.success) {
      return toActionResultFromAppResult(result);
    }
    const payout = result.data;
    if (!payout) {
      return fail("STRIPE_CONNECT_SERVICE_ERROR", {
        userMessage: "振込リクエストの作成に失敗しました。",
      });
    }

    revalidateTag("stripe-balance");
    revalidateTag(`stripe-balance-${payout.stripeAccountId}`);
    revalidatePath("/settings/payments");
    revalidatePath("/dashboard");

    return toActionResultFromAppResult(result, {
      userMessage: "振込リクエストを作成しました。",
    });
  } catch (error) {
    handleServerError(error, {
      category: "stripe_connect",
      action: "request_payout_failed",
    });
    return failFrom(error, {
      defaultCode: "INTERNAL_ERROR",
      userMessage: "振込リクエストの作成に失敗しました。",
    });
  }
}
