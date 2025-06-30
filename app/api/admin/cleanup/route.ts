import { NextRequest, NextResponse } from "next/server";
import { UserCleanupService } from "@/lib/services/cleanup";

/**
 * 孤立ユーザークリーンアップAPI
 * クロンジョブやヘルスチェックから定期実行される
 */
export async function POST(request: NextRequest) {
  try {
    // 簡易認証（本格的な管理者認証は後で実装）
    const authHeader = request.headers.get("authorization");
    const expectedToken = process.env.CLEANUP_API_TOKEN;

    if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action || "health-check";

    switch (action) {
      case "health-check": {
        const result = await UserCleanupService.healthCheck();
        return NextResponse.json({
          success: true,
          action: "health-check",
          result,
        });
      }

      case "detect": {
        const orphanedUsers = await UserCleanupService.detectOrphanedUsers();
        return NextResponse.json({
          success: true,
          action: "detect",
          result: {
            count: orphanedUsers.length,
            users: orphanedUsers,
          },
        });
      }

      case "cleanup": {
        const result = await UserCleanupService.cleanupAllOrphanedUsers();
        return NextResponse.json({
          success: true,
          action: "cleanup",
          result,
        });
      }

      case "stats": {
        const stats = await UserCleanupService.getCleanupStats();
        return NextResponse.json({
          success: true,
          action: "stats",
          result: stats,
        });
      }

      default:
        return NextResponse.json(
          { error: "Invalid action. Use: health-check, detect, cleanup, or stats" },
          { status: 400 }
        );
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Cleanup API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * ヘルスチェック用GET
 */
export async function GET() {
  try {
    const result = await UserCleanupService.healthCheck();
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
