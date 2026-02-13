import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { validateCronSecret, logCronActivity } from "@core/cron-auth";
import { respondWithCode, respondWithProblem } from "@core/errors/server";
import { EmailNotificationService } from "@core/notification/email-service";
import { getStripe } from "@core/stripe/client";
import { getEnv } from "@core/utils/cloudflare-env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * プラットフォーム残高の健全性を監視し、閾値を下回った場合に管理者へ通知する。
 * - 閾値は env PLATFORM_BALANCE_MIN_JPY（デフォルト: 0）
 * - `connect_reserved`（負残高リスクのためのリザーブ）も併記
 */
export async function GET(request: NextRequest) {
  const auth = validateCronSecret(request);
  if (!auth.isValid) {
    return respondWithCode("UNAUTHORIZED", {
      instance: "/api/cron/monitor-platform-balance",
      detail: auth.error || "Unauthorized",
      logContext: {
        category: "system",
        actorType: "system",
        action: "monitor_platform_balance_auth_fail",
      },
    });
  }

  const minThreshold = Number.parseInt(getEnv().PLATFORM_BALANCE_MIN_JPY || "0", 10);

  try {
    const bal = await getStripe().balance.retrieve();

    const sum = (items?: Array<{ amount: number; currency: string }>) =>
      (items || [])
        .filter((i) => i.currency?.toLowerCase() === "jpy")
        .reduce((acc, cur) => acc + (cur.amount || 0), 0);

    const availableJpy = sum(bal.available ?? []);
    const pendingJpy = sum(bal.pending ?? []);
    const connectReservedJpy = sum(
      (bal as unknown as { connect_reserved?: Array<{ amount: number; currency: string }> })
        .connect_reserved || []
    );

    const details = {
      available_jpy: availableJpy,
      pending_jpy: pendingJpy,
      connect_reserved_jpy: connectReservedJpy,
      threshold_jpy: minThreshold,
    };

    logCronActivity("info", "Platform balance fetched", details);

    const isBelowThreshold = availableJpy < minThreshold;
    if (isBelowThreshold) {
      try {
        const email = new EmailNotificationService();
        await email.sendAdminAlert({
          subject: "Platform balance below threshold",
          message: "プラットフォーム残高が閾値を下回りました。迅速なTop-upをご検討ください。",
          details,
        });
        logCronActivity("warning", "Platform balance alert sent", details);
      } catch (e) {
        logCronActivity("error", "Failed to send platform balance alert", {
          error: e instanceof Error ? e.message : String(e),
          ...details,
        });
      }
    }

    return NextResponse.json({ belowThreshold: isBelowThreshold, ...details });
  } catch (e) {
    const errorName = e instanceof Error ? e.name : "Unknown";
    const errorMessage = e instanceof Error ? e.message : String(e);
    logCronActivity("error", "Failed to retrieve platform balance", {
      error: e instanceof Error ? e.message : String(e),
    });
    return respondWithProblem(e, {
      instance: "/api/cron/monitor-platform-balance",
      detail: "Failed to retrieve platform balance",
      logContext: {
        category: "system",
        actorType: "system",
        action: "monitor_platform_balance_failed",
        additionalData: {
          error_name: errorName,
          error_message: errorMessage,
        },
      },
    });
  }
}
