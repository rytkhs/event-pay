"use server";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { sendSlackText } from "@core/notification/slack";
import { waitUntil } from "@core/utils/cloudflare-ctx";
import { handleServerError } from "@core/utils/error-handler.server";
import { formatUtcToJst } from "@core/utils/timezone";
import { registerAction as registerActionImpl } from "@features/auth/server";

import { ensureFeaturesRegistered } from "@/app/_init/feature-registrations";

import { getRequestIp } from "./_shared/request-context";
import { projectAuthCommandResult } from "./_shared/result-projection";
import { trackAuthEvent } from "./_shared/auth-telemetry";
import { formDataToObject } from "./_shared/form-data";

/**
 * ユーザー登録
 */
export async function registerAction(formData: FormData): Promise<ActionResult<{ user: unknown }>> {
  ensureFeaturesRegistered();

  const result = await registerActionImpl({
    rawData: formDataToObject(formData),
    requestContext: {
      ip: await getRequestIp(),
    },
  });

  const { actionResult, sideEffects } = projectAuthCommandResult(result);

  if (sideEffects?.telemetry) {
    trackAuthEvent(sideEffects.telemetry);
  }

  const accountCreatedSlack = sideEffects?.accountCreatedSlack;

  if (accountCreatedSlack) {
    waitUntil(
      (async () => {
        try {
          const timestamp = new Date().toISOString();
          const jstStr = formatUtcToJst(new Date(), "yyyy-MM-dd HH:mm 'JST'");

          const slackText = `[Account Created]
ユーザー: ${accountCreatedSlack.userName}
登録時刻: ${jstStr} (${timestamp})`;

          const slackResult = await sendSlackText(slackText);

          if (!slackResult.success) {
            logger.warn("Account creation Slack notification failed", {
              category: "system",
              action: "accountCreationSlackFailed",
              error_message: slackResult.error.message,
              error_code: slackResult.error.code,
              retryable: slackResult.error.retryable,
              error_details: slackResult.error.details,
            });
          }
        } catch (error) {
          handleServerError("ADMIN_ALERT_FAILED", {
            category: "system",
            action: "accountCreationSlackException",
            actorType: "system",
            additionalData: {
              error_message: error instanceof Error ? error.message : String(error),
            },
          });
        }
      })()
    );
  }

  return actionResult;
}
