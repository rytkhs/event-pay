/**
 * 通知メールのHTML/TEXTテンプレート生成
 */

import { ja } from "date-fns/locale";

import { formatUtcToJst } from "@core/utils/timezone";

import type {
  AccountRestrictedNotification,
  AccountStatusChangeNotification,
  EmailTemplate,
  PaymentCompletedNotification,
  ParticipationRegisteredNotification,
} from "./types";

const APP_NAME = "みんなの集金";

const STATUS_TEXT: Record<ParticipationRegisteredNotification["attendanceStatus"], string> = {
  attending: "参加",
  maybe: "未定",
  not_attending: "不参加",
};

const ACCOUNT_STATUS_MAP: Record<string, string> = {
  unverified: "未認証",
  onboarding: "認証中",
  verified: "認証済み",
  restricted: "制限中",
};

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(input: string): string {
  return escapeHtml(input).replaceAll("`", "&#96;");
}

function nl2br(input: string): string {
  return escapeHtml(input).replace(/\r?\n/g, "<br>");
}

function formatJstDate(
  value: string | Date,
  formatType: "default" | "withWeekday" = "default"
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === "string" ? value : "-";
  }
  const formatString =
    formatType === "withWeekday" ? "yyyy年M月d日(EEE) HH:mm" : "yyyy年M月d日 HH:mm";

  return formatUtcToJst(date, formatString, { locale: ja });
}

function formatYen(amount: number): string {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);
}

function renderKeyValueRows(rows: Array<{ label: string; value: string }>): string {
  return rows
    .map(
      (row) => `
        <tr>
          <th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:140px;color:#475569;font-size:13px;font-weight:600;">${escapeHtml(row.label)}</th>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;line-height:1.6;">${row.value}</td>
        </tr>
      `
    )
    .join("\n");
}

function renderLayout(params: { preheader?: string; contentHtml: string }): string {
  const year = new Date().getFullYear();
  const preheader = params.preheader ? escapeHtml(params.preheader) : "";

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <title>${APP_NAME}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans','Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;color:#0f172a;">
    <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${preheader}</div>
    <div style="padding:32px 16px;">
      <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="padding:20px 24px 0;text-align:center;">
          <h2 style="margin:0;color:#24A6B5;font-size:20px;font-weight:700;">${APP_NAME}</h2>
        </div>
        <div style="padding:24px;">
          ${params.contentHtml}
        </div>
        <div style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e5e7eb;text-align:center;color:#6b7280;font-size:13px;line-height:1.6;">
          © ${year} ${APP_NAME}
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function toSafeString(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function buildAccountVerifiedTemplate(params: { userName: string }): EmailTemplate {
  const userName = escapeHtml(params.userName);
  const subject = "Stripeアカウントの認証が完了しました";

  const html = renderLayout({
    preheader: subject,
    contentHtml: `
      <p style="margin:0 0 8px;font-size:16px;color:#64748b;">${userName} 様</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;">アカウント認証が完了しました</h1>
      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:14px 16px;border-radius:4px;margin-bottom:20px;color:#166534;line-height:1.7;">
        Stripeアカウントの認証が正常に完了しました。イベントの売上を自動的に受け取れる状態です。
      </div>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;overflow:hidden;">
        ${renderKeyValueRows([
          { label: "オンライン決済", value: "オンライン決済が選択可能になりました。" },
          {
            label: "送金状況の確認",
            value: "ダッシュボードから送金履歴やステータスを確認できます。",
          },
        ])}
      </table>
    `,
  });

  const text = [
    `${params.userName} 様`,
    "",
    "アカウント認証が完了しました",
    "Stripeアカウントの認証が正常に完了しました。",
    "イベントの売上を自動的に受け取れる状態です。",
    "",
    "ご利用いただける機能:",
    "- オンライン決済が選択可能になりました。",
    "- ダッシュボードから送金履歴やステータスを確認できます。",
  ].join("\n");

  return { subject, html, text };
}

export function buildAccountRestrictedTemplate(
  params: Pick<
    AccountRestrictedNotification,
    "restrictionReason" | "requiredActions" | "dashboardUrl"
  > & { userName: string }
): EmailTemplate {
  const subject = "Stripeアカウントに制限が設定されました";
  const preheader = params.requiredActions?.length
    ? "アカウントに制限が設定されました — 対応が必要です"
    : "アカウントに制限が設定されました — 詳細をご確認ください";

  const actionsHtml = (params.requiredActions || [])
    .map((action) => `<li style="margin-bottom:6px;">${escapeHtml(action)}</li>`)
    .join("\n");

  const html = renderLayout({
    preheader,
    contentHtml: `
      <p style="margin:0 0 8px;font-size:16px;color:#64748b;">${escapeHtml(params.userName)} 様</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;">アカウントに制限が設定されました</h1>
      <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 16px;border-radius:4px;margin-bottom:20px;color:#7f1d1d;line-height:1.7;">
        アカウントに一部の機能制限が適用されています。内容をご確認のうえ、必要な対応をお願いします。
        ${
          params.restrictionReason
            ? `<br><strong>制限理由:</strong> ${escapeHtml(params.restrictionReason)}`
            : ""
        }
      </div>
      ${
        actionsHtml
          ? `<h2 style="margin:0 0 10px;font-size:18px;">必要な対応</h2><ol style="margin:0 0 20px 20px;padding:0;color:#374151;line-height:1.7;">${actionsHtml}</ol>`
          : ""
      }
      ${
        params.dashboardUrl
          ? `<p style="margin:0 0 16px;"><a href="${escapeAttr(params.dashboardUrl)}" style="display:inline-block;background:#24A6B5;color:#ffffff;text-decoration:none;font-weight:600;border-radius:6px;padding:10px 16px;">ダッシュボードで対応する</a></p>`
          : ""
      }
    `,
  });

  const textLines = [
    `${params.userName} 様`,
    "",
    "アカウントに制限が設定されました。",
    "内容をご確認のうえ、必要な対応をお願いします。",
  ];
  if (params.restrictionReason) {
    textLines.push(`制限理由: ${params.restrictionReason}`);
  }
  if (params.requiredActions?.length) {
    textLines.push("", "必要な対応:");
    params.requiredActions.forEach((action, index) => {
      textLines.push(`${index + 1}. ${action}`);
    });
  }
  if (params.dashboardUrl) {
    textLines.push("", `ダッシュボード: ${params.dashboardUrl}`);
  }

  return { subject, html, text: textLines.join("\n") };
}

export function buildAccountStatusChangedTemplate(
  params: Pick<
    AccountStatusChangeNotification,
    "oldStatus" | "newStatus" | "chargesEnabled" | "payoutsEnabled"
  > & { userName: string }
): EmailTemplate {
  const oldLabel = ACCOUNT_STATUS_MAP[params.oldStatus] || params.oldStatus;
  const newLabel = ACCOUNT_STATUS_MAP[params.newStatus] || params.newStatus;
  const subject = "Stripeアカウントの状態が更新されました";

  const html = renderLayout({
    preheader: `Stripeアカウントの状態が「${newLabel}」に更新されました`,
    contentHtml: `
      <p style="margin:0 0 8px;font-size:16px;color:#64748b;">${escapeHtml(params.userName)} 様</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;">アカウント状態が更新されました</h1>
      <div style="background:#eff6ff;border-left:4px solid #3b82f6;padding:14px 16px;border-radius:4px;margin-bottom:20px;color:#0f172a;line-height:1.7;">
        状態: ${escapeHtml(oldLabel)} → <strong>${escapeHtml(newLabel)}</strong>
      </div>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;overflow:hidden;">
        ${renderKeyValueRows([
          {
            label: "決済受取",
            value: params.chargesEnabled
              ? "有効（決済の受け取りが可能です）"
              : "無効（決済の受け取りは無効です）",
          },
          {
            label: "送金",
            value: params.payoutsEnabled ? "有効（送金が可能です）" : "無効（送金は無効です）",
          },
        ])}
      </table>
    `,
  });

  const text = [
    `${params.userName} 様`,
    "",
    "アカウント状態が更新されました",
    `状態: ${oldLabel} → ${newLabel}`,
    `決済受取: ${params.chargesEnabled ? "有効" : "無効"}`,
    `送金: ${params.payoutsEnabled ? "有効" : "無効"}`,
  ].join("\n");

  return { subject, html, text };
}

export function buildParticipationRegisteredTemplate(
  params: Pick<
    ParticipationRegisteredNotification,
    "nickname" | "eventTitle" | "eventDate" | "attendanceStatus"
  > & { guestUrl: string }
): EmailTemplate {
  const statusText = STATUS_TEXT[params.attendanceStatus];
  const formattedDate = formatJstDate(params.eventDate);
  const subject = `【${APP_NAME}】${params.eventTitle} - 参加登録完了`;

  const html = renderLayout({
    preheader: `${params.eventTitle}の参加登録が完了しました（${statusText}）`,
    contentHtml: `
      <p style="margin:0 0 8px;font-size:16px;color:#64748b;">${escapeHtml(params.nickname)} 様</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;">参加登録が完了しました</h1>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;overflow:hidden;margin-bottom:20px;">
        ${renderKeyValueRows([
          { label: "イベント名", value: escapeHtml(params.eventTitle) },
          { label: "開催日時", value: escapeHtml(formattedDate) },
          { label: "参加状況", value: escapeHtml(statusText) },
        ])}
      </table>
      <p style="margin:0 0 8px;"><a href="${escapeAttr(params.guestUrl)}" style="display:inline-block;background:#24A6B5;color:#ffffff;text-decoration:none;font-weight:600;border-radius:6px;padding:10px 16px;">参加状況を確認・変更する</a></p>
      <p style="margin:6px 0 0;color:#64748b;font-size:13px;line-height:1.6;word-break:break-all;">URL: ${escapeHtml(params.guestUrl)}</p>
    `,
  });

  const text = [
    `${params.nickname} 様`,
    "",
    "参加登録が完了しました",
    `イベント名: ${params.eventTitle}`,
    `開催日時: ${formattedDate}`,
    `参加状況: ${statusText}`,
    "",
    `参加状況の確認・変更: ${params.guestUrl}`,
    "このリンクは個人用です。第三者と共有しないでください。",
  ].join("\n");

  return { subject, html, text };
}

export function buildPaymentCompletedTemplate(
  params: Pick<
    PaymentCompletedNotification,
    "nickname" | "eventTitle" | "amount" | "paidAt" | "receiptUrl"
  >
): EmailTemplate {
  const subject = `【${APP_NAME}】${params.eventTitle} - お支払い完了`;
  const amount = formatYen(params.amount);
  const paidAt = formatJstDate(params.paidAt);

  const html = renderLayout({
    preheader: `${params.eventTitle}のお支払いが完了しました`,
    contentHtml: `
      <p style="margin:0 0 8px;font-size:16px;color:#64748b;">${escapeHtml(params.nickname)} 様</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;">お支払いが完了しました</h1>
      <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:14px 16px;border-radius:4px;margin-bottom:20px;color:#166534;line-height:1.7;">
        お支払いの処理が正常に完了しました。ありがとうございます。
      </div>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;overflow:hidden;margin-bottom:20px;">
        ${renderKeyValueRows([
          { label: "イベント名", value: escapeHtml(params.eventTitle) },
          { label: "お支払い金額", value: `<strong>${escapeHtml(amount)}</strong>` },
          { label: "お支払い日時", value: escapeHtml(paidAt) },
        ])}
      </table>
      ${
        params.receiptUrl
          ? `<p style="margin:0 0 12px;"><a href="${escapeAttr(params.receiptUrl)}" style="display:inline-block;background:#24A6B5;color:#ffffff;text-decoration:none;font-weight:600;border-radius:6px;padding:10px 16px;">レシートを表示</a></p>`
          : ""
      }
    `,
  });

  const textLines = [
    `${params.nickname} 様`,
    "",
    "お支払いが完了しました",
    `イベント名: ${params.eventTitle}`,
    `お支払い金額: ${amount}`,
    `お支払い日時: ${paidAt}`,
  ];
  if (params.receiptUrl) {
    textLines.push(`レシート: ${params.receiptUrl}`);
  }

  return { subject, html, text: textLines.join("\n") };
}

export function buildResponseDeadlineReminderTemplate(params: {
  nickname: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string | null;
  responseDeadline: string;
  guestUrl: string;
}): EmailTemplate {
  const subject = `【${APP_NAME}】${params.eventTitle} 参加期限のリマインダー`;

  const rows = [
    { label: "イベント名", value: escapeHtml(params.eventTitle) },
    { label: "日時", value: escapeHtml(params.eventDate) },
    ...(params.eventLocation ? [{ label: "場所", value: escapeHtml(params.eventLocation) }] : []),
    { label: "参加期限", value: `<strong>${escapeHtml(params.responseDeadline)}</strong>` },
  ];

  const html = renderLayout({
    preheader: `${params.eventTitle}の参加期限が近づいています。`,
    contentHtml: `
      <p style="margin:0 0 8px;font-size:16px;color:#475569;">${escapeHtml(params.nickname)} 様</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;">参加期限が近づいています</h1>
      <div style="background:#fff7ed;border-left:4px solid #f97316;padding:12px 16px;border-radius:4px;margin-bottom:20px;color:#7c2d12;line-height:1.7;">
        参加申込期限が近づいています。ご都合をご確認のうえ、参加ステータスの更新をお願いします。
      </div>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;overflow:hidden;margin-bottom:20px;">
        ${renderKeyValueRows(rows)}
      </table>
      <p style="margin:0 0 8px;"><a href="${escapeAttr(params.guestUrl)}" style="display:inline-block;background:#24A6B5;color:#ffffff;text-decoration:none;font-weight:600;border-radius:6px;padding:10px 16px;">参加ステータスを更新する</a></p>
      <p style="margin:6px 0 0;color:#64748b;font-size:13px;line-height:1.6;word-break:break-all;">URL: ${escapeHtml(params.guestUrl)}</p>
    `,
  });

  const text = [
    `${params.nickname} 様`,
    "",
    "参加期限が近づいています",
    `イベント名: ${params.eventTitle}`,
    `日時: ${params.eventDate}`,
    ...(params.eventLocation ? [`場所: ${params.eventLocation}`] : []),
    `参加期限: ${params.responseDeadline}`,
    "",
    `参加ステータス更新: ${params.guestUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export function buildPaymentDeadlineReminderTemplate(params: {
  nickname: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string | null;
  participationFee: number;
  paymentDeadline: string;
  paymentUrl: string;
}): EmailTemplate {
  const subject = `【${APP_NAME}】${params.eventTitle} 決済期限のリマインダー`;
  const eventDate = formatJstDate(params.eventDate);
  const deadline = formatJstDate(params.paymentDeadline);
  const fee = formatYen(params.participationFee || 0);

  const html = renderLayout({
    preheader: `決済期限 ${deadline} まで`,
    contentHtml: `
      <p style="margin:0 0 8px;font-size:16px;color:#64748b;">${escapeHtml(params.nickname)} 様</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;">決済期限が近づいています</h1>
      <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;border-radius:4px;margin-bottom:20px;color:#7f1d1d;line-height:1.7;">
        決済期限が近づいています（${escapeHtml(deadline)} まで）。以下の参加費の決済をお早めに完了してください。
      </div>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;overflow:hidden;margin-bottom:20px;">
        ${renderKeyValueRows([
          { label: "イベント名", value: escapeHtml(params.eventTitle) },
          { label: "日時", value: escapeHtml(eventDate) },
          ...(params.eventLocation
            ? [{ label: "場所", value: escapeHtml(params.eventLocation) }]
            : []),
          { label: "参加費", value: `<strong>${escapeHtml(fee)}</strong>` },
          { label: "決済期限", value: `<strong>${escapeHtml(deadline)}</strong>` },
        ])}
      </table>
      <p style="margin:0 0 8px;"><a href="${escapeAttr(params.paymentUrl)}" style="display:inline-block;background:#24A6B5;color:#ffffff;text-decoration:none;font-weight:600;border-radius:6px;padding:10px 16px;">決済を完了する</a></p>
      <p style="margin:6px 0 0;color:#64748b;font-size:13px;line-height:1.6;word-break:break-all;">URL: ${escapeHtml(params.paymentUrl)}</p>
    `,
  });

  const text = [
    `${params.nickname} 様`,
    "",
    "決済期限が近づいています",
    `イベント名: ${params.eventTitle}`,
    `日時: ${eventDate}`,
    ...(params.eventLocation ? [`場所: ${params.eventLocation}`] : []),
    `参加費: ${fee}`,
    `決済期限: ${deadline}`,
    "",
    `決済URL: ${params.paymentUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export function buildEventStartReminderTemplate(params: {
  nickname: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string | null;
  eventDescription: string | null;
  guestUrl: string;
}): EmailTemplate {
  const subject = `【${APP_NAME}】${params.eventTitle} 開催のリマインダー`;
  const eventDate = formatJstDate(params.eventDate, "withWeekday");

  const html = renderLayout({
    preheader: `${params.eventTitle}の開始が近づいています`,
    contentHtml: `
      <p style="margin:0 0 8px;font-size:16px;color:#64748b;">${escapeHtml(params.nickname)} 様</p>
      <h1 style="margin:0 0 16px;font-size:24px;line-height:1.4;">開始が近づいています</h1>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;overflow:hidden;margin-bottom:20px;">
        ${renderKeyValueRows([
          { label: "イベント名", value: escapeHtml(params.eventTitle) },
          { label: "日時", value: escapeHtml(eventDate) },
          ...(params.eventLocation
            ? [{ label: "会場", value: escapeHtml(params.eventLocation) }]
            : []),
        ])}
      </table>
      ${
        params.eventDescription
          ? `<div style="margin:0 0 20px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;color:#334155;line-height:1.8;">${nl2br(params.eventDescription)}</div>`
          : ""
      }
      <p style="margin:0 0 8px;"><a href="${escapeAttr(params.guestUrl)}" style="display:inline-block;background:#24A6B5;color:#ffffff;text-decoration:none;font-weight:600;border-radius:6px;padding:10px 16px;">詳細を確認する</a></p>
      <p style="margin:6px 0 0;color:#64748b;font-size:13px;line-height:1.6;word-break:break-all;">URL: ${escapeHtml(params.guestUrl)}</p>
    `,
  });

  const text = [
    `${params.nickname} 様`,
    "",
    "開始が近づいています",
    `イベント名: ${params.eventTitle}`,
    `日時: ${eventDate}`,
    ...(params.eventLocation ? [`会場: ${params.eventLocation}`] : []),
    ...(params.eventDescription ? ["", params.eventDescription] : []),
    "",
    `詳細: ${params.guestUrl}`,
  ].join("\n");

  return { subject, html, text };
}

export function buildAdminAlertTemplate(params: {
  subject: string;
  message: string;
  details?: Record<string, unknown>;
}): EmailTemplate {
  const subject = `[EventPay Alert] ${params.subject}`;

  const detailsRows = params.details
    ? Object.entries(params.details)
        .map(
          ([key, value]) => `
            <tr>
              <th style="padding:10px 12px;text-align:left;background:#f8fafc;border-bottom:1px solid #e2e8f0;width:160px;color:#475569;font-size:13px;font-weight:600;">${escapeHtml(key)}</th>
              <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;line-height:1.7;"><pre style="margin:0;white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:12px;line-height:1.6;color:#0f172a;">${escapeHtml(
                toSafeString(value)
              )}</pre></td>
            </tr>
          `
        )
        .join("\n")
    : "";

  const html = renderLayout({
    preheader: subject,
    contentHtml: `
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.4;">システムアラート</h1>
      <div style="background:#fef2f2;border-left:4px solid #ef4444;padding:14px 16px;border-radius:4px;margin-bottom:20px;color:#7f1d1d;line-height:1.7;">
        <h2 style="margin:0 0 8px;font-size:18px;line-height:1.4;">${escapeHtml(params.subject)}</h2>
        <div>${nl2br(params.message)}</div>
      </div>
      ${
        detailsRows
          ? `<h2 style="margin:0 0 10px;font-size:18px;line-height:1.4;">詳細情報</h2><table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;overflow:hidden;margin-bottom:20px;">${detailsRows}</table>`
          : ""
      }
      <p style="margin:0;text-align:center;font-size:12px;color:#94a3b8;">このメールは自動送信されています。</p>
    `,
  });

  const lines = [`[EventPay Alert] ${params.subject}`, "", params.message];
  if (params.details) {
    lines.push("", "詳細情報:");
    for (const [key, value] of Object.entries(params.details)) {
      lines.push(`- ${key}: ${toSafeString(value)}`);
    }
  }

  return { subject, html, text: lines.join("\n") };
}

export function buildAdminContactNoticeTemplate(params: {
  name: string;
  email: string;
  messageExcerpt: string;
  receivedAt: Date;
}): EmailTemplate {
  const subject = `【${APP_NAME}】新しいお問い合わせが届きました`;
  const receivedAt = formatJstDate(params.receivedAt) + " (JST)";

  const html = renderLayout({
    preheader: `${params.name} 様から新しいお問い合わせが届きました`,
    contentHtml: `
      <h1 style="margin:0 0 12px;font-size:24px;line-height:1.4;">新しいお問い合わせ</h1>
      <p style="margin:0 0 18px;color:#334155;line-height:1.7;">下記の内容をご確認のうえ、必要に応じてご対応ください。</p>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;overflow:hidden;margin-bottom:20px;">
        ${renderKeyValueRows([
          { label: "氏名", value: escapeHtml(params.name) },
          {
            label: "メールアドレス",
            value: `<a href="mailto:${escapeAttr(params.email)}" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${escapeHtml(params.email)}</a>`,
          },
          { label: "受信日時", value: escapeHtml(receivedAt) },
        ])}
      </table>
      <h2 style="margin:0 0 10px;font-size:18px;line-height:1.4;">お問い合わせ本文</h2>
      <div style="padding:14px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;color:#334155;line-height:1.8;">${nl2br(
        params.messageExcerpt
      )}</div>
      <p style="margin:10px 0 0;font-size:12px;color:#64748b;">※ 本文は最大500文字まで表示されています。</p>
    `,
  });

  const text = [
    "新しいお問い合わせ",
    "",
    `氏名: ${params.name}`,
    `メールアドレス: ${params.email}`,
    `受信日時: ${receivedAt}`,
    "",
    "お問い合わせ本文:",
    params.messageExcerpt,
    "",
    "※ 本文は最大500文字まで表示されています。",
  ].join("\n");

  return { subject, html, text };
}
