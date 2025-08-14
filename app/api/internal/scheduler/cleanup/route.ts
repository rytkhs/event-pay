/**
 * 期限切れスケジューラーロック削除API
 *
 * Cronジョブや定期実行タスクから呼び出される内部API
 * HMAC認証またはサービスロール認証で保護する
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(request: NextRequest) {
  try {
    // シンプルなBearer token認証（環境変数のトークンと照合）
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.INTERNAL_API_TOKEN;

    if (!expectedToken) {
      console.error("INTERNAL_API_TOKEN is not configured");
      return NextResponse.json(
        { error: "Internal API not configured" },
        { status: 500 }
      );
    }

    if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== expectedToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // サービスロールクライアントで期限切れロック削除を実行
    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data, error } = await supabase
      .rpc("cleanup_expired_scheduler_locks")
      .single();

    if (error) {
      console.error("Failed to cleanup expired scheduler locks:", error);
      return NextResponse.json(
        {
          error: "Cleanup failed",
          details: error.message
        },
        { status: 500 }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { deleted_count, expired_locks } = data as {
      deleted_count: number;
      expired_locks: Array<{
        lock_name: string;
        acquired_at: string;
        expires_at: string;
        process_id: string;
      }>;
    };

    console.info(`Scheduler lock cleanup completed: ${deleted_count} expired locks removed`, {
      deletedCount: deleted_count,
      expiredLocks: expired_locks,
    });

    return NextResponse.json({
      success: true,
      deletedCount: deleted_count,
      expiredLocks: expired_locks,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Unexpected error in scheduler lock cleanup:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}

// GET メソッドでロック状態確認も提供
export async function GET(request: NextRequest) {
  try {
    // 同様の認証チェック
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.INTERNAL_API_TOKEN;

    if (!expectedToken) {
      return NextResponse.json(
        { error: "Internal API not configured" },
        { status: 500 }
      );
    }

    if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== expectedToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createServiceClient();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data, error } = await supabase
      .rpc("get_scheduler_lock_status");

    if (error) {
      console.error("Failed to get scheduler lock status:", error);
      return NextResponse.json(
        {
          error: "Status check failed",
          details: error.message
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      locks: data || [],
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Unexpected error in scheduler lock status check:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
