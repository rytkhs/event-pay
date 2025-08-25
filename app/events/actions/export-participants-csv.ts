"use server";

import { createClient } from "@/lib/supabase/server";
import { SecureSupabaseClientFactory } from "@/lib/security/secure-client-factory.impl";
import { AdminReason } from "@/lib/security/secure-client-factory.types";
import { verifyEventAccess } from "@/lib/auth/event-authorization";
import {
  ExportParticipantsCsvParamsSchema,
} from "@/lib/validation/participant-management";
import { checkRateLimit, createRateLimitStore } from "@/lib/rate-limit";
import { RATE_LIMIT_CONFIG } from "@/config/security";
import { formatUtcToJstSafe } from "@/lib/utils/timezone";
import { logger } from "@/lib/logging/app-logger";
import { headers } from "next/headers";

/**
 * 参加者データCSVエクスポート
 * MANAGE-004: 参加者データ CSV エクスポート（UTF-8 BOM）
 *
 * attendancesとpaymentsを結合してCSVファイルを生成
 */
export async function exportParticipantsCsvAction(
  params: unknown
): Promise<{
  success: boolean;
  csvContent?: string;
  filename?: string;
  error?: string;
}> {
  try {
    // パラメータバリデーション
    const validatedParams = ExportParticipantsCsvParamsSchema.parse(params);
    const { eventId, filters, columns: inputColumns } = validatedParams;

    const columns = inputColumns;

    // IP アドレス取得（情報ログ用）
    const headersList = headers();
    const ip = headersList.get("x-forwarded-for") || "unknown";

    // 共通の認証・権限確認処理
    const { user, eventId: validatedEventId } = await verifyEventAccess(eventId);

    // レートリミットストア生成
    const store = await createRateLimitStore();

    // レート制限チェック (ユーザー単位 + イベント単位)
    const rateLimitResult = await checkRateLimit(
      store,
      `csv_export_${user.id}_${validatedEventId}`,
      RATE_LIMIT_CONFIG.participantsCsvExport
    );

    if (!rateLimitResult.allowed) {
      return {
        success: false,
        error: "レート制限: CSVエクスポートの実行回数が上限に達しました。しばらく待ってから再度お試しください。"
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
      .select(`
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
      `)
      .eq("event_id", validatedEventId)
      // 最新の決済 1 件に絞る
      .order("updated_at", { foreignTable: "payments", ascending: false })
      .limit(1, { foreignTable: "payments" })

    // フィルター適用
    if (filters?.search) {
      const escapeForPostgrest = (value: string) => {
        return `"${value.replace(/"/g, '""')}"`;
      };
      const pattern = escapeForPostgrest(`%${filters.search}%`);
      query = query.or(`nickname.ilike.${pattern},email.ilike.${pattern}`);
    }

    if (filters?.attendanceStatus) {
      query = query.eq("status", filters.attendanceStatus);
    }

    // 決済方法フィルター（payments.method）
    if (filters?.paymentMethod) {
      query = query.eq("payments.method", filters.paymentMethod);
    }

    // 決済ステータスフィルター（payments.status）
    if (filters?.paymentStatus) {
      query = query.eq("payments.status", filters.paymentStatus);
    }

    // データ取得（ページネーションなし - 全件取得）
    // ただし、大量データ対策として上限を設定
    query = query.limit(1000); // 最大1,000件

    const { data: participants, error: queryError } = await query;

    if (queryError) {
      logger.error("Failed to fetch participants for CSV export", {
        eventId: validatedEventId,
        userId: user.id,
        error: queryError
      });

      return {
        success: false,
        error: "参加者データの取得に失敗しました。"
      };
    }

    if (!participants || participants.length === 0) {
      return {
        success: false,
        error: "エクスポート対象の参加者が見つかりません。"
      };
    }

    // CSV生成
    const csvContent = generateCsvContent(participants as any[], columns);

    // ファイル名生成（participants-<eventId>-<yyyymmdd>.csv）
    const now = new Date();
    const dateStr = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0');
    const filename = `participants-${validatedEventId}-${dateStr}.csv`;

    // 監査ログ記録
    await admin.from("system_logs").insert({
      operation_type: "participants_csv_export",
      details: {
        event_id: validatedEventId,
        user_id: user.id,
        participant_count: participants.length,
        filters: filters || {},
        columns,
        filename: filename,
        ip_address: ip
      }
    });

    logger.info("Participants CSV export completed", {
      eventId: validatedEventId,
      userId: user.id,
      participantCount: participants.length,
      filename: filename
    });

    return {
      success: true,
      csvContent,
      filename
    };

  } catch (error) {
    logger.error("Participants CSV export failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      params
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "CSVエクスポートに失敗しました。"
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

function generateCsvContent(
  participants: CsvParticipant[],
  columns: string[]
): string {
  // CSV ヘッダー行の生成
  const headerMap: Record<string, string> = {
    attendance_id: "参加ID",
    nickname: "ニックネーム",
    email: "メールアドレス",
    status: "参加ステータス",
    payment_method: "決済方法",
    payment_status: "決済ステータス",
    amount: "金額",
    paid_at: "決済日時",
    created_at: "登録日時",
    updated_at: "更新日時"
  };

  const headers = columns.map(col => headerMap[col] || col);

  // CSV行の生成
  const rows = participants.map(participant => {
    const latestPayment = (participant.payments as { [key: string]: any }[])?.[0] || null;

    return columns.map(column => {
      let value: string | number = '';

      switch (column) {
        case 'attendance_id':
          value = participant.id;
          break;
        case 'nickname':
          value = participant.nickname;
          break;
        case 'email':
          value = participant.email;
          break;
        case 'status':
          // 参加ステータスの日本語化
          const statusMap: Record<string, string> = {
            attending: "参加",
            not_attending: "不参加",
            maybe: "未定"
          };
          value = statusMap[participant.status] || participant.status;
          break;
        case 'payment_method':
          if (latestPayment?.method) {
            const methodMap: Record<string, string> = {
              stripe: "オンライン決済",
              cash: "現金"
            };
            value = methodMap[latestPayment.method] || latestPayment.method;
          }
          break;
        case 'payment_status':
          if (latestPayment?.status) {
            const statusMap: Record<string, string> = {
              pending: "未決済",
              paid: "決済完了",
              failed: "決済失敗",
              received: "現金受領",
              refunded: "返金済み",
              waived: "免除",
              completed: "完了"
            };
            value = statusMap[latestPayment.status] || latestPayment.status;
          }
          break;
        case 'amount':
          value = latestPayment?.amount || '';
          break;
        case 'paid_at':
          value = latestPayment?.paid_at ?
            formatUtcToJstSafe(latestPayment.paid_at, 'yyyy/MM/dd HH:mm') : '';
          break;
        case 'created_at':
          value = formatUtcToJstSafe(participant.created_at, 'yyyy/MM/dd HH:mm');
          break;
        case 'updated_at':
          value = formatUtcToJstSafe(participant.updated_at, 'yyyy/MM/dd HH:mm');
          break;
        default:
          value = '';
      }

      // CSV形式用にエスケープ（ダブルクォートで囲み、内部のダブルクォートはエスケープ）
      const strValue = sanitizeCsvValue(String(value ?? ''));
      return `"${strValue.replace(/"/g, '""')}"`;
    });
  });

  // CSV文字列の組み立て
  const csvLines = [headers.map(h => `"${h}"`).join(','), ...rows.map(row => row.join(','))];
  const csvString = csvLines.join('\n');

  // UTF-8 BOMを付与
  return '\uFEFF' + csvString;
}

/**
 * Excel CSV Injection 対策
 * セルの先頭が = + - @ \t などの場合、単一引用符 (') を付与して数式評価を防止する。
 */
function sanitizeCsvValue(raw: string): string {
  if (/^[=+\-@\t]/.test(raw)) {
    return `'${raw}`;
  }
  return raw;
}
