/**
 * CSP (Content Security Policy) レポートエンドポイント
 * ブラウザから送信されるCSP違反レポートを受け取り、ログに記録します
 */

export const dynamic = "force-dynamic";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import * as Sentry from "@sentry/cloudflare";

import { logger } from "@core/logging/app-logger";
import { enforceRateLimit, buildKey } from "@core/rate-limit";
import { generateSecureUuid } from "@core/security/crypto";
import type {
  CSPViolationReport,
  CSPViolationReportDetails,
  ReportingAPICSPBody,
} from "@core/security/csp-report-types";
import { logSecurityEvent } from "@core/security/security-logger";
import { handleServerError } from "@core/utils/error-handler.server";
import { getClientIP } from "@core/utils/ip-detection";
import { getStringProp } from "@core/utils/type-guards";

// CSPレポート用のレート制限ポリシー（1分間に200リクエスト）
const CSP_REPORT_RATE_LIMIT_POLICY = {
  scope: "csp.report",
  limit: 200,
  window: "1 m",
  blockMs: 60 * 1000, // 1分間ブロック
} as const;

// 最大ペイロードサイズ（10KB）
const MAX_PAYLOAD_SIZE = 10 * 1024;

/**
 * CSPレポートエンドポイント
 * POSTリクエストでCSP違反レポートを受け取り、ログに記録します
 */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") || generateSecureUuid();
  const clientIP = getClientIP(request);

  try {
    // レート制限チェック
    const rateLimitKey = buildKey({
      scope: "csp.report",
      ip: clientIP,
    });
    const rateLimitKeys = Array.isArray(rateLimitKey) ? rateLimitKey : [rateLimitKey];
    const rateLimitResult = await enforceRateLimit({
      keys: rateLimitKeys,
      policy: CSP_REPORT_RATE_LIMIT_POLICY,
    });

    if (!rateLimitResult.allowed) {
      logger.warn("CSP report rate limited", {
        category: "security",
        action: "cspReportRateLimited",
        request_id: requestId,
        ip: clientIP,
        retry_after: rateLimitResult.retryAfter,
      });
      return new NextResponse(null, {
        status: 429,
        headers: {
          "Retry-After": String(rateLimitResult.retryAfter || 60),
          "Cache-Control": "no-store",
        },
      });
    }

    // Content-Type検証
    const contentType = request.headers.get("content-type") || "";
    const isCSPReportType =
      contentType.includes("application/csp-report") ||
      contentType.includes("application/json") ||
      contentType.includes("application/reports");

    if (!isCSPReportType && contentType !== "") {
      logger.warn("CSP report invalid content-type", {
        category: "security",
        action: "cspReportInvalidContentType",
        request_id: requestId,
        content_type: contentType,
        ip: clientIP,
      });
      // Content-Typeが違っても処理は続行（ブラウザの実装差異に対応）
    }

    // ペイロードサイズチェック
    const contentLength = request.headers.get("content-length");
    if (contentLength && Number.parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
      logger.warn("CSP report payload too large", {
        category: "security",
        action: "cspReportPayloadTooLarge",
        request_id: requestId,
        content_length: contentLength,
        max_size: MAX_PAYLOAD_SIZE,
        ip: clientIP,
      });
      return new NextResponse(null, {
        status: 413,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    // リクエストボディを取得
    const rawBody = await request.text();

    // ペイロードサイズの再確認（実際のサイズ）
    if (rawBody.length > MAX_PAYLOAD_SIZE) {
      logger.warn("CSP report payload too large (actual size)", {
        category: "security",
        action: "cspReportPayloadTooLarge",
        request_id: requestId,
        actual_size: rawBody.length,
        max_size: MAX_PAYLOAD_SIZE,
        ip: clientIP,
      });
      return new NextResponse(null, {
        status: 413,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    // JSONパース
    let rawData: unknown;
    try {
      rawData = JSON.parse(rawBody);
    } catch (parseError) {
      logger.warn("CSP report JSON parse error", {
        category: "security",
        action: "cspReportParseError",
        request_id: requestId,
        error: parseError instanceof Error ? parseError.message : String(parseError),
        ip: clientIP,
        body_preview: rawBody.substring(0, 200),
      });
      return new NextResponse(null, {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    // レポートの抽出と正規化
    const violations: CSPViolationReportDetails[] = [];

    if (Array.isArray(rawData)) {
      // Reporting API v3 format (array)
      for (const item of rawData) {
        // CSP違反レポートのみを対象とする
        if (item.type === "csp-violation" && item.body) {
          const body = item.body as ReportingAPICSPBody;
          violations.push({
            "blocked-uri": body.blockedURL,
            "document-uri": body.documentURL,
            "effective-directive": body.effectiveDirective,
            "original-policy": body.originalPolicy,
            referrer: body.referrer,
            "line-number": body.lineNumber,
            "column-number": body.columnNumber,
            "source-file": body.sourceFile,
            "status-code": body.statusCode,
            sample: body.sample,
            disposition: body.disposition,
            // Reporting APIではviolated-directiveは通常effectiveDirectiveと同じかマッピングされる
            "violated-directive": body.effectiveDirective,
          });
        }
      }

      // 配列だが有効なCSPレポートが含まれていない場合
      if (violations.length === 0 && rawData.length > 0) {
        logger.info("CSP report array received but no csp-violation types found", {
          category: "security",
          action: "cspReportIgnoredTypes",
          request_id: requestId,
          types: rawData.map((d) => getStringProp(d, "type") ?? "unknown"),
          ip: clientIP,
        });
        // エラーにはせず正常終了
      }
    } else if (rawData && typeof rawData === "object" && "csp-report" in rawData) {
      // Legacy format (csp-report property)
      const report = rawData as CSPViolationReport;
      violations.push(report["csp-report"]);
    } else {
      // 無効なフォーマット
      logger.warn("CSP report missing csp-report field or invalid format", {
        category: "security",
        action: "cspReportInvalidFormat",
        request_id: requestId,
        ip: clientIP,
        body_preview: rawBody.substring(0, 500),
      });
      return new NextResponse(null, {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      });
    }

    // 各違反をセキュリティログに記録
    for (const violation of violations) {
      logSecurityEvent({
        type: "CSP_VIOLATION",
        severity: "MEDIUM",
        message: "CSP violation detected",
        details: {
          blocked_uri: violation["blocked-uri"],
          violated_directive: violation["violated-directive"],
          effective_directive: violation["effective-directive"],
          document_uri: violation["document-uri"],
          referrer: violation["referrer"],
          line_number: violation["line-number"],
          column_number: violation["column-number"],
          source_file: violation["source-file"],
          status_code: violation["status-code"],
          sample: violation["sample"],
          original_policy: violation["original-policy"],
          disposition: violation.disposition,
          request_id: requestId,
        },
        userAgent: request.headers.get("user-agent") || undefined,
        ip: clientIP,
        timestamp: new Date(),
      });

      // SentryにもCSP違反を送信
      try {
        Sentry.captureMessage("CSP Violation", {
          level: "warning",
          tags: {
            security_event: "CSP_VIOLATION",
            violated_directive: violation["violated-directive"] || "unknown",
            effective_directive: violation["effective-directive"] || "unknown",
          },
          extra: {
            blocked_uri: violation["blocked-uri"],
            document_uri: violation["document-uri"],
            referrer: violation["referrer"],
            line_number: violation["line-number"],
            column_number: violation["column-number"],
            source_file: violation["source-file"],
            status_code: violation["status-code"],
            sample: violation["sample"],
            original_policy: violation["original-policy"],
            disposition: violation.disposition,
            request_id: requestId,
            user_agent: request.headers.get("user-agent") || undefined,
            ip_address: clientIP,
          },
          fingerprint: [
            "csp-violation",
            violation["violated-directive"] || "unknown",
            violation["blocked-uri"] || "unknown",
          ],
        });
      } catch (sentryError) {
        // Sentry送信エラーは処理に影響させない
        logger.warn("Failed to send CSP violation to Sentry", {
          category: "security",
          action: "cspReportSentryError",
          request_id: requestId,
          error: sentryError instanceof Error ? sentryError.message : String(sentryError),
          ip: clientIP,
        });
      }
    }

    // 204 No Content で返答（軽量）
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": requestId,
      },
    });
  } catch (error) {
    // 予期しないエラーを正規化・通知
    handleServerError(error, {
      category: "security",
      action: "cspReportEndpointError",
      additionalData: {
        request_id: requestId,
        ip: clientIP,
      },
    });

    // エラー時も204を返す（ブラウザ側のリトライを避けるため）
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": requestId,
      },
    });
  }
}
