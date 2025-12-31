"use server";

import { redirect } from "next/navigation";

import { z } from "zod";

import { getCurrentUser } from "@core/auth/auth-utils";
import { logger } from "@core/logging/app-logger";
import { createClient } from "@core/supabase/server";
import { handleServerError } from "@core/utils/error-handler.server";

import { SettlementReportService } from "../services/service";

export type ExportSettlementReportsSuccess = {
  success: true;
  csvContent: string;
  filename: string;
  truncated: boolean;
};

export type ExportSettlementReportsFailure = {
  success: false;
  error: string;
};

export type ExportSettlementReportsResponse =
  | ExportSettlementReportsSuccess
  | ExportSettlementReportsFailure;

export type GenerateSettlementReportSuccess = {
  success: true;
  reportId?: string;
  alreadyExists?: boolean;
  reportData?: any; // TODO: 適切な型定義が必要
};

export type GenerateSettlementReportFailure = {
  success: false;
  error: string;
};

export type GenerateSettlementReportResponse =
  | GenerateSettlementReportSuccess
  | GenerateSettlementReportFailure;

// バリデーションスキーマ
const generateReportSchema = z.object({
  eventId: z.string().uuid(),
});

const getReportsSchema = z.object({
  eventIds: z.array(z.string().uuid()).optional(),
  // UI からは YYYY-MM-DD 形式で送信されるため、日付のみの文字列を許可
  fromDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  toDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
  offset: z.number().int().min(0).optional().default(0),
});

/**
 * イベント清算レポートを生成
 */
export async function generateSettlementReportAction(
  formData: FormData
): Promise<GenerateSettlementReportResponse> {
  // 認証確認
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  try {
    // 入力値検証
    const rawData = {
      eventId: formData.get("eventId")?.toString() || "",
    };

    const validatedData = generateReportSchema.parse(rawData);

    // サービス実行
    const supabase = createClient();
    const service = new SettlementReportService(supabase);

    const result = await service.generateSettlementReport({
      eventId: validatedData.eventId,
      createdBy: user.id,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || "レポート生成に失敗しました",
      };
    }

    logger.info("Settlement report generated via action", {
      category: "settlement",
      action: "generate_report",
      actor_type: "user",
      user_id: user.id,
      event_id: validatedData.eventId,
      report_id: result.reportId,
      already_exists: result.alreadyExists,
      outcome: "success",
    });

    return {
      success: true,
      reportId: result.reportId,
      alreadyExists: result.alreadyExists,
      reportData: result.reportData,
    };
  } catch (error) {
    handleServerError(error, {
      category: "settlement",
      action: "generate_report_failed",
      userId: user.id,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "予期しないエラーが発生しました",
    };
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
}) {
  // 認証確認
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  try {
    // 入力値検証
    const validatedParams = getReportsSchema.parse(params);

    // サービス実行
    const supabase = createClient();
    const service = new SettlementReportService(supabase);

    const reports = await service.getSettlementReports({
      createdBy: user.id,
      eventIds: validatedParams.eventIds,
      fromDate: validatedParams.fromDate ? new Date(validatedParams.fromDate) : undefined,
      toDate: validatedParams.toDate ? new Date(validatedParams.toDate) : undefined,
      limit: validatedParams.limit,
      offset: validatedParams.offset,
    });

    return {
      success: true,
      reports,
    };
  } catch (error) {
    handleServerError(error, {
      category: "settlement",
      action: "get_reports_failed",
      userId: user.id,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "予期しないエラーが発生しました",
      reports: [],
    };
  }
}

/**
 * CSV エクスポート
 */
export async function exportSettlementReportsAction(params: {
  eventIds?: string[];
  fromDate?: string;
  toDate?: string;
}): Promise<ExportSettlementReportsResponse> {
  // 認証確認
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  try {
    // 入力値検証
    const validatedParams = getReportsSchema.parse({ ...params, limit: 1000 }); // CSVは最大1000件

    // サービス実行
    const supabase = createClient();
    const service = new SettlementReportService(supabase);

    const result = await service.exportToCsv({
      createdBy: user.id,
      eventIds: validatedParams.eventIds,
      fromDate: validatedParams.fromDate ? new Date(validatedParams.fromDate) : undefined,
      toDate: validatedParams.toDate ? new Date(validatedParams.toDate) : undefined,
      limit: 1000,
    });

    if (!result.success) {
      return {
        success: false,
        error: result.error || "CSV エクスポートに失敗しました",
      };
    }

    logger.info("Settlement reports CSV export completed", {
      category: "settlement",
      action: "export_csv",
      actor_type: "user",
      user_id: user.id,
      filename: result.filename,
      outcome: "success",
    });

    if (!result.csvContent || !result.filename) {
      return {
        success: false,
        error: "CSVの生成に失敗しました",
      };
    }

    return {
      success: true,
      csvContent: result.csvContent,
      filename: result.filename,
      truncated: !!result.truncated,
    };
  } catch (error) {
    handleServerError(error, {
      category: "settlement",
      action: "export_csv_failed",
      userId: user.id,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "予期しないエラーが発生しました",
    };
  }
}

/**
 * 返金・Dispute時の再集計
 */
export async function regenerateAfterRefundAction(formData: FormData) {
  // 認証確認
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  try {
    // 入力値検証
    const rawData = {
      eventId: formData.get("eventId")?.toString() || "",
    };

    const validatedData = generateReportSchema.parse({ ...rawData, forceRegenerate: true });

    // サービス実行
    const supabase = createClient();
    const service = new SettlementReportService(supabase);

    const result = await service.regenerateAfterRefundOrDispute(validatedData.eventId, user.id);

    if (!result.success) {
      return {
        success: false,
        error: result.error || "再集計に失敗しました",
      };
    }

    logger.info("Settlement report regenerated after refund/dispute", {
      category: "settlement",
      action: "regenerate_after_refund",
      actor_type: "user",
      user_id: user.id,
      event_id: validatedData.eventId,
      report_id: result.reportId,
      outcome: "success",
    });

    return {
      success: true,
      reportId: result.reportId,
      reportData: result.reportData,
    };
  } catch (error) {
    handleServerError(error, {
      category: "settlement",
      action: "regenerate_after_refund_failed",
      userId: user.id,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "予期しないエラーが発生しました",
    };
  }
}
