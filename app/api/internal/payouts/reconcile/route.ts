/**
 * 送金データ整合性チェック・修復API
 * 内部用途（cron job等）でのみ使用
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Database } from "@/types/database";
import { PayoutReconciliationService } from "@/lib/services/payout/reconciliation";
import { verifyInternalRequest } from "@/lib/security/internal-auth";
import { logger } from "@/lib/logging/app-logger";

export async function POST(request: NextRequest) {
  try {
    // リクエストボディを先に読み取り
    const bodyText = await request.text().catch(() => "");
    const body = bodyText ? JSON.parse(bodyText) : {};

    // 内部リクエスト認証（ボディテキストを渡す）
    const authResult = await verifyInternalRequest(request, bodyText);
    if (!authResult.success) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    const {
      daysBack = 7,
      dryRun = false,
      limit = 100,
    } = body;

    // Service Role クライアントを作成
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Reconciliation サービス実行
    const reconciliationService = new PayoutReconciliationService(supabase);
    const result = await reconciliationService.reconcilePayouts({
      daysBack,
      dryRun,
      limit,
    });

    // 統計情報も取得
    const stats = await reconciliationService.getConsistencyStats();

    return NextResponse.json({
      success: true,
      reconciliation: result,
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Reconciliation job failed', {
      tag: 'reconciliationJobFailed',
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      {
        error: "Reconciliation failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // 内部リクエスト認証
    const authResult = await verifyInternalRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Service Role クライアントを作成
    const supabase = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // 統計情報のみ取得
    const reconciliationService = new PayoutReconciliationService(supabase);
    const stats = await reconciliationService.getConsistencyStats();

    return NextResponse.json({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    logger.error('Reconciliation stats failed', {
      tag: 'reconciliationStatsFailed',
      error_name: error instanceof Error ? error.name : 'Unknown',
      error_message: error instanceof Error ? error.message : String(error)
    });

    return NextResponse.json(
      {
        error: "Failed to get reconciliation stats",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
