/**
 * 送金データ整合性チェック・修復 Edge Function
 * 定期実行（cron）で呼び出され、Stripe APIとDB状態を照合・修復する
 */

/* eslint-disable no-console */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (req: Request) => Promise<Response> | Response): void;
};

const INTERNAL_API_URL = Deno.env.get("NEXT_PUBLIC_SITE_URL") + "/api/internal/payouts/reconcile";
const INTERNAL_API_KEY = Deno.env.get("INTERNAL_API_KEY");

interface ReconciliationConfig {
  daysBack: number;
  dryRun: boolean;
  limit: number;
}

Deno.serve(async (req: Request) => {
  try {
    // POST以外は拒否
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    // リクエストボディから設定を取得
    const body = await req.json().catch(() => ({}));
    const config: ReconciliationConfig = {
      daysBack: body.daysBack || 7,
      dryRun: body.dryRun || false,
      limit: body.limit || 100,
    };

    console.log("Starting payout reconciliation job", config);

    // 内部APIを呼び出し
    const response = await fetch(INTERNAL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": INTERNAL_API_KEY || "",
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Internal API failed: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    console.log("Reconciliation completed", {
      checkedTransfers: result.reconciliation?.checkedTransfers,
      inconsistentPayouts: result.reconciliation?.inconsistentPayouts,
      fixedPayouts: result.reconciliation?.fixedPayouts,
      errors: result.reconciliation?.errors?.length || 0,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Reconciliation job completed",
        result,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }
    );

  } catch (error) {
    console.error("Reconciliation job failed:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: "Reconciliation job failed",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});
