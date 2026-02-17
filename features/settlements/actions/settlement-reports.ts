import { getCurrentUser } from "@core/auth/auth-utils";
import { type ActionResult, fail, ok, zodFail } from "@core/errors/adapters/server-actions";
import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";
import { handleServerError } from "@core/utils/error-handler.server";

import { SettlementReportService } from "../services/service";
import type {
  ExportSettlementReportsPayload,
  GenerateSettlementReportPayload,
  GetSettlementReportsPayload,
  RegenerateSettlementReportPayload,
} from "../types";
import {
  generateSettlementReportInputSchema,
  getSettlementReportsParamsSchema,
} from "../validation";

/**
 * イベント清算レポートを生成
 */
export async function generateSettlementReportAction(
  formData: FormData
): Promise<ActionResult<GenerateSettlementReportPayload>> {
  // 認証確認
  const user = await getCurrentUser();
  if (!user?.id) {
    return fail("UNAUTHORIZED", { userMessage: "ログインが必要です" });
  }

  try {
    // 入力値検証
    const rawData = {
      eventId: formData.get("eventId")?.toString() || "",
    };

    const validatedData = generateSettlementReportInputSchema.safeParse(rawData);
    if (!validatedData.success) {
      return zodFail(validatedData.error, {
        userMessage: "入力データが無効です",
      });
    }

    // サービス実行
    const supabase = createClient();
    const service = new SettlementReportService(supabase);

    const result = await service.generateSettlementReport({
      eventId: validatedData.data.eventId,
      createdBy: user.id,
    });

    if (!result.success) {
      return fail("INTERNAL_ERROR", {
        userMessage: result.error.userMessage || "レポート生成に失敗しました",
      });
    }

    const payload = result.data;
    if (!payload) {
      return fail("INTERNAL_ERROR", {
        userMessage: "レポート生成結果が不正です",
      });
    }

    logger.info("Settlement report generated via action", {
      category: "settlement",
      action: "generate_report",
      actor_type: "user",
      user_id: user.id,
      event_id: validatedData.data.eventId,
      report_id: payload.reportId,
      already_exists: payload.alreadyExists,
      outcome: "success",
    });

    return ok({
      reportId: payload.reportId,
      alreadyExists: payload.alreadyExists,
      reportData: payload.reportData,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    handleServerError(error, {
      category: "settlement",
      action: "generate_report_failed",
      userId: user.id,
    });

    return fail("INTERNAL_ERROR", {
      userMessage: "予期しないエラーが発生しました",
    });
  }
}

/**
 * 清算レポート一覧を取得
 */
export async function getSettlementReportsAction(params: {
  eventIds?: string[];
  fromDate?: string;
  toDate?: string;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<GetSettlementReportsPayload>> {
  // 認証確認
  const user = await getCurrentUser();
  if (!user?.id) {
    return fail("UNAUTHORIZED", { userMessage: "ログインが必要です" });
  }

  try {
    // 入力値検証
    const validatedParams = getSettlementReportsParamsSchema.safeParse(params);
    if (!validatedParams.success) {
      return zodFail(validatedParams.error, {
        userMessage: "入力データが無効です",
      });
    }

    // サービス実行
    const supabase = createClient();
    const service = new SettlementReportService(supabase);

    const reports = await service.getSettlementReports({
      createdBy: user.id,
      eventIds: validatedParams.data.eventIds,
      fromDate: validatedParams.data.fromDate ? new Date(validatedParams.data.fromDate) : undefined,
      toDate: validatedParams.data.toDate ? new Date(validatedParams.data.toDate) : undefined,
      limit: validatedParams.data.limit,
      offset: validatedParams.data.offset,
    });

    return ok({
      reports,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    handleServerError(error, {
      category: "settlement",
      action: "get_reports_failed",
      userId: user.id,
    });

    return fail("INTERNAL_ERROR", {
      userMessage: "予期しないエラーが発生しました",
    });
  }
}

/**
 * CSV エクスポート
 */
export async function exportSettlementReportsAction(params: {
  eventIds?: string[];
  fromDate?: string;
  toDate?: string;
}): Promise<ActionResult<ExportSettlementReportsPayload>> {
  // 認証確認
  const user = await getCurrentUser();
  if (!user?.id) {
    return fail("UNAUTHORIZED", { userMessage: "ログインが必要です" });
  }

  try {
    // 入力値検証
    const validatedParams = getSettlementReportsParamsSchema.safeParse({ ...params, limit: 1000 }); // CSVは最大1000件
    if (!validatedParams.success) {
      return zodFail(validatedParams.error, {
        userMessage: "入力データが無効です",
      });
    }

    // サービス実行
    const supabase = createClient();
    const service = new SettlementReportService(supabase);

    const result = await service.exportToCsv({
      createdBy: user.id,
      eventIds: validatedParams.data.eventIds,
      fromDate: validatedParams.data.fromDate ? new Date(validatedParams.data.fromDate) : undefined,
      toDate: validatedParams.data.toDate ? new Date(validatedParams.data.toDate) : undefined,
      limit: 1000,
    });

    if (!result.success) {
      return fail("INTERNAL_ERROR", {
        userMessage: result.error.userMessage || "CSV エクスポートに失敗しました",
      });
    }

    const payload = result.data;
    if (!payload) {
      return fail("INTERNAL_ERROR", {
        userMessage: "CSV生成結果が不正です",
      });
    }

    logger.info("Settlement reports CSV export completed", {
      category: "settlement",
      action: "export_csv",
      actor_type: "user",
      user_id: user.id,
      filename: payload.filename,
      outcome: "success",
    });

    if (payload.csvContent === undefined || !payload.filename) {
      return fail("INTERNAL_ERROR", {
        userMessage: "CSVの生成に失敗しました",
      });
    }

    return ok({
      csvContent: payload.csvContent,
      filename: payload.filename,
      truncated: !!payload.truncated,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    handleServerError(error, {
      category: "settlement",
      action: "export_csv_failed",
      userId: user.id,
    });

    return fail("INTERNAL_ERROR", {
      userMessage: "予期しないエラーが発生しました",
    });
  }
}

/**
 * 返金・Dispute時の再集計
 */
export async function regenerateAfterRefundAction(
  formData: FormData
): Promise<ActionResult<RegenerateSettlementReportPayload>> {
  // 認証確認
  const user = await getCurrentUser();
  if (!user?.id) {
    return fail("UNAUTHORIZED", { userMessage: "ログインが必要です" });
  }

  try {
    // 入力値検証
    const rawData = {
      eventId: formData.get("eventId")?.toString() || "",
    };

    const validatedData = generateSettlementReportInputSchema.safeParse(rawData);
    if (!validatedData.success) {
      return zodFail(validatedData.error, {
        userMessage: "入力データが無効です",
      });
    }

    // サービス実行
    const supabase = createClient();
    const service = new SettlementReportService(supabase);

    const result = await service.regenerateAfterRefundOrDispute(
      validatedData.data.eventId,
      user.id
    );

    if (!result.success) {
      return fail("INTERNAL_ERROR", {
        userMessage: result.error.userMessage || "再集計に失敗しました",
      });
    }

    const payload = result.data;
    if (!payload) {
      return fail("INTERNAL_ERROR", {
        userMessage: "再集計結果が不正です",
      });
    }

    logger.info("Settlement report regenerated after refund/dispute", {
      category: "settlement",
      action: "regenerate_after_refund",
      actor_type: "user",
      user_id: user.id,
      event_id: validatedData.data.eventId,
      report_id: payload.reportId,
      outcome: "success",
    });

    return ok({
      reportId: payload.reportId,
      reportData: payload.reportData,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("NEXT_REDIRECT")) {
      throw error;
    }
    handleServerError(error, {
      category: "settlement",
      action: "regenerate_after_refund_failed",
      userId: user.id,
    });

    return fail("INTERNAL_ERROR", {
      userMessage: "予期しないエラーが発生しました",
    });
  }
}
