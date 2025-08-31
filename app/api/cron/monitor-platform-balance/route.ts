import { NextRequest, NextResponse } from "next/server";
import { createProblemResponse } from "@core/api/problem-details";
import { stripe as sharedStripe } from "@core/stripe/client";
import { validateCronSecret, logCronActivity } from "@core/cron-auth";
import { EmailNotificationService } from "@core/notification/email-service";

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
    return createProblemResponse("UNAUTHORIZED", {
      instance: "/api/cron/monitor-platform-balance",
      detail: auth.error || "Unauthorized",
    });
  }

  const minThreshold = Number.parseInt(process.env.PLATFORM_BALANCE_MIN_JPY || "0", 10);

  try {
    const bal = await sharedStripe.balance.retrieve();

    const sum = (items?: Array<{ amount: number; currency: string }>) =>
      (items || [])
        .filter((i) => i.currency?.toLowerCase() === "jpy")
        .reduce((acc, cur) => acc + (cur.amount || 0), 0);

    const availableJpy = sum((bal.available as any) || []);
    const pendingJpy = sum((bal.pending as any) || []);
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

    return NextResponse.json({ ok: true, belowThreshold: isBelowThreshold, ...details });
  } catch (e) {
    logCronActivity("error", "Failed to retrieve platform balance", {
      error: e instanceof Error ? e.message : String(e),
    });
    return createProblemResponse("INTERNAL_ERROR", {
      instance: "/api/cron/monitor-platform-balance",
      detail: "Failed to retrieve platform balance",
    });
  }
}
