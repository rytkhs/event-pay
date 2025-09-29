"use server";

import { headers } from "next/headers";

import { verifyEventAccess } from "@core/auth/event-authorization";
import { logger } from "@core/logging/app-logger";
import { enforceRateLimit, buildKey, POLICIES } from "@core/rate-limit";
import { SecureSupabaseClientFactory } from "@core/security/secure-client-factory.impl";
import { AdminReason } from "@core/security/secure-client-factory.types";
import { createClient } from "@core/supabase/server";
import {
  type SimplePaymentStatus,
  getPaymentStatusesFromSimple,
} from "@core/utils/payment-status-mapper";
import { formatUtcToJstSafe } from "@core/utils/timezone";
import { ExportParticipantsCsvParamsSchema } from "@core/validation/participant-management";

/**
 * 参加者データCSVエクスポート
 * MANAGE-004: 参加者データ CSV エクスポート（UTF-8 BOM）
 *
 * attendancesとpaymentsを結合してCSVファイルを生成
 */
export async function exportParticipantsCsvAction(params: unknown): Promise<{
  success: boolean;
  csvContent?: string;
  filename?: string;
  /** 取得件数が上限(1000件)に達し切り捨てが発生した場合 true */
  truncated?: boolean;
  error?: string;
}> {
  try {
    // パラメータバリデーション
    const validatedParams = ExportParticipantsCsvParamsSchema.parse(params);
    const { eventId, filters, columns } = validatedParams;

    // IP アドレス取得（情報ログ用）
    const headersList = headers();
    const ip = headersList.get("x-forwarded-for") || "unknown";

    // 共通の認証・権限確認処理
    const { user, eventId: validatedEventId } = await verifyEventAccess(eventId);

    // レート制限チェック (ユーザー単位)
    const key = buildKey({ scope: "export.participantsCsv", userId: user.id });
    const rateLimitResult = await enforceRateLimit({
      keys: Array.isArray(key) ? key : [key],
      policy: POLICIES["export.participantsCsv"],
    });

    if (!rateLimitResult.allowed) {
      return {
        success: false,
        error:
          "レート制限: CSVエクスポートの実行回数が上限に達しました。しばらく待ってから再度お試しください。",
      };
    }

    const supabase = createClient();
    const factory = SecureSupabaseClientFactory.getInstance();
    const admin = await factory.createAuditedAdminClient(
      AdminReason.CSV_EXPORT,
      "app/events/actions/export-participants-csv"
    );

    // CSVデータ取得用クエリの構築
    let query = supabase
      .from("attendances")
      .select(
        `
        id,
        nickname,
        email,
        status,
        created_at,
        updated_at,
        payments!left (
          id,
          method,
          status,
          amount,
          paid_at,
          created_at,
          updated_at
        )
      `
      )
      .eq("event_id", validatedEventId)
      // 最新の決済 1 件に絞る
      // 優先順位: 1) paid_at DESC (NULL は後ろ) 2) created_at DESC 3) updated_at DESC
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order("paid_at", {
        foreignTable: "payments",
        ascending: false,
        nullsFirst: false,
      } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order("created_at", { foreignTable: "payments", ascending: false } as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .order("updated_at", { foreignTable: "payments", ascending: false } as any)
      .limit(1, { foreignTable: "payments" });

    // フィルター適用
    if (filters?.search) {
      const pattern = `%${filters.search}%`;
      query = query.or(`nickname.ilike.${pattern},email.ilike.${pattern}`);
    }

    if (filters?.attendanceStatus) {
      query = query.eq("status", filters.attendanceStatus);
    }

    // 決済方法フィルター（payments.method）
    if (filters?.paymentMethod) {
      query = query.eq("payments.method", filters.paymentMethod);
    }

    // 決済ステータスフィルター（payments.status）- SimplePaymentStatusから詳細ステータスに変換
    if (filters?.paymentStatus) {
      const detailedStatuses = getPaymentStatusesFromSimple(
        filters.paymentStatus as SimplePaymentStatus
      );

      if (detailedStatuses.length === 1) {
        query = query.eq("payments.status", detailedStatuses[0]);
      } else {
        query = query.in("payments.status", detailedStatuses);
      }
    }

    // データ取得（ページネーションなし - 全件取得）
    // ただし、大量データ対策として上限を設定
    // 1,001 件まで取得して "上限超過を厳密判定" する
    query = query.limit(1001); // 最大1,001件 (+1 行オーバーフェッチ)

    const { data: participants, error: queryError } = await query;

    if (queryError) {
      logger.error("Failed to fetch participants for CSV export", {
        eventId: validatedEventId,
        userId: user.id,
        error: queryError,
      });

      return {
        success: false,
        error: "参加者データの取得に失敗しました。",
      };
    }

    if (!participants || participants.length === 0) {
      // 0 件でも正常終了とし、ヘッダーのみの空 CSV を返却する

      // ファイル名生成（participants-<eventId>-<yyyymmdd>.csv）
      const now = new Date();
      const dateStr =
        now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, "0") +
        now.getDate().toString().padStart(2, "0");
      const filename = `participants-${validatedEventId}-${dateStr}.csv`;

      // ヘッダーのみの CSV 文字列を生成
      const csvContent = generateCsvContent([], columns);

      return {
        success: true,
        csvContent,
        filename,
      };
    }

    // 切り捨て判定 (+1 行オーバーフェッチ方式)
    const truncated = participants.length > 1000;

    // CSV に含めるデータ (最大 1,000 行)
    const csvSource = truncated ? (participants as any[]).slice(0, 1000) : (participants as any[]);

    // CSV生成
    const csvContent = generateCsvContent(csvSource, columns);

    // ファイル名生成（participants-<eventId>-<yyyymmdd>.csv）
    const now = new Date();
    const dateStr =
      now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, "0") +
      now.getDate().toString().padStart(2, "0");
    const filename = `participants-${validatedEventId}-${dateStr}.csv`;

    // 監査ログ記録
    await admin.from("system_logs").insert({
      operation_type: "participants_csv_export",
      details: {
        event_id: validatedEventId,
        user_id: user.id,
        participant_count: csvSource.length,
        filters: filters || {},
        columns,
        filename,
        ip_address: ip,
      },
    });

    logger.info("Participants CSV export completed", {
      eventId: validatedEventId,
      userId: user.id,
      participantCount: csvSource.length,
      filename,
    });

    return {
      success: true,
      csvContent,
      filename,
      truncated,
    };
  } catch (error) {
    logger.error("Participants CSV export failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      params,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "CSVエクスポートに失敗しました。",
    };
  }
}

/**
 * CSV文字列を生成
 * UTF-8 BOM付きで生成
 */
interface CsvParticipant {
  id: string;
  nickname: string;
  email: string;
  status: string;
  created_at: string;
  updated_at: string;
  payments?: Array<{
    id: string;
    method: string;
    status: string;
    amount: number;
    paid_at: string | null;
    created_at: string;
    updated_at: string;
  }> | null;
}

function generateCsvContent(participants: CsvParticipant[], columns: string[]): string {
  // CSV ヘッダー行の生成
  const headerMap: Record<string, string> = {
    nickname: "ニックネーム",
    status: "参加ステータス",
    payment_method: "決済方法",
    payment_status: "決済ステータス",
    amount: "金額",
    paid_at: "決済日時",
    created_at: "登録日時",
    updated_at: "更新日時",
  };

  const headers = columns.map((col) => headerMap[col] || col);

  // CSV行の生成
  const rows = participants.map((participant) => {
    const latestPayment = (participant.payments as { [key: string]: any }[])?.[0] || null;

    return columns.map((column) => {
      let value: string | number = "";

      switch (column) {
        case "nickname":
          value = participant.nickname;
          break;
        case "status":
          // 参加ステータスの日本語化
          const statusMap: Record<string, string> = {
            attending: "参加",
            not_attending: "不参加",
            maybe: "未定",
          };
          value = statusMap[participant.status] || participant.status;
          break;
        case "payment_method":
          if (latestPayment?.method) {
            const methodMap: Record<string, string> = {
              stripe: "オンライン決済",
              cash: "現金決済",
            };
            value = methodMap[latestPayment.method] || latestPayment.method;
          }
          break;
        case "payment_status":
          if (latestPayment?.status) {
            const statusMap: Record<string, string> = {
              pending: "未決済",
              paid: "決済済",
              failed: "決済失敗",
              received: "受領済",
              refunded: "返金済み",
              waived: "免除",
              completed: "完了",
            };
            value = statusMap[latestPayment.status] || latestPayment.status;
          }
          break;
        case "amount":
          value = latestPayment?.amount || "";
          break;
        case "paid_at":
          value = latestPayment?.paid_at
            ? formatUtcToJstSafe(latestPayment.paid_at, "yyyy/MM/dd HH:mm")
            : "";
          break;
        case "created_at":
          value = formatUtcToJstSafe(participant.created_at, "yyyy/MM/dd HH:mm");
          break;
        case "updated_at":
          value = formatUtcToJstSafe(participant.updated_at, "yyyy/MM/dd HH:mm");
          break;
        default:
          value = "";
      }

      // CSV形式用にエスケープ（ダブルクォートで囲み、内部のダブルクォートはエスケープ）
      const strValue = sanitizeCsvValue(String(value ?? ""));
      return `"${strValue.replace(/"/g, '""')}"`;
    });
  });

  // CSV文字列の組み立て
  const csvLines = [headers.map((h) => `"${h}"`).join(","), ...rows.map((row) => row.join(","))];
  const csvString = csvLines.join("\n");

  // UTF-8 BOMを付与
  return `\uFEFF${csvString}`;
}

/**
 * Excel CSV Injection 対策
 * セルの先頭が = + - @ \t などの場合、単一引用符 (') を付与して数式評価を防止する。
 */
function sanitizeCsvValue(raw: string): string {
  // Excel CSV Injection 対策
  // 1. 既に先頭が単一引用符（'）で始まる場合でも、一部環境では式と解釈される既知バグがある。
  //    → 追加でもう 1 文字の単一引用符を付与し、"''=FORMULA" の形に変換してリテラル扱いを強制する。
  // 2. 先頭に空白/制御文字が続いた後に = + - @ \t が来る場合も数式評価されるため、従来どおり ' を付与。
  //    \s は U+0009–U+000D, U+0020, U+00A0 などを含む。追加で制御文字(0x00-0x1F)を広くカバー。

  // ケース 1: 先頭が ' で始まる
  if (/^'/u.test(raw)) {
    return `''${raw}`;
  }

  // ケース 2: 空白/制御文字 + リスク文字
  if (/^[\s\x00-\x1F]*[=+\-@\t]/u.test(raw)) {
    return `'${raw}`;
  }

  return raw;
}
