import * as React from "react";

import { Heading, Text, Hr } from "@react-email/components";

import { Button } from "../_components/Button";
import { EmailLayout } from "../_layout/EmailLayout";

export interface ParticipationRegisteredEmailProps {
  nickname: string;
  eventTitle: string;
  eventDate: string;
  attendanceStatus: "attending" | "maybe" | "not_attending";
  guestUrl: string;
}

const STATUS_TEXT: Record<"attending" | "maybe" | "not_attending", string> = {
  attending: "参加",
  maybe: "未定",
  not_attending: "不参加",
};

const statusTheme = (status: "attending" | "maybe" | "not_attending") => {
  switch (status) {
    case "attending":
      return { border: "#22c55e", text: "#166534", bg: "#f0fdf4" };
    case "maybe":
      return { border: "#f59e0b", text: "#92400e", bg: "#fffbeb" };
    default:
      return { border: "#e5e7eb", text: "#374151", bg: "#f9fafb" };
  }
};

const ParticipationRegisteredEmail = ({
  nickname,
  eventTitle,
  eventDate,
  attendanceStatus,
  guestUrl,
}: ParticipationRegisteredEmailProps) => {
  const formattedDate = new Date(eventDate).toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

  const theme = statusTheme(attendanceStatus);
  const statusText = STATUS_TEXT[attendanceStatus];

  return (
    <EmailLayout preheader={`${eventTitle}の参加登録が完了しました（${statusText}）`}>
      {/* 宛名 */}
      <Text
        style={{
          margin: "0 0 8px 0",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#64748b",
        }}
      >
        {nickname} 様
      </Text>

      {/* 見出し */}
      <Heading
        as="h1"
        style={{
          margin: "0 0 24px 0",
          fontSize: "24px",
          lineHeight: "32px",
          fontWeight: "600",
          color: "#0f172a",
        }}
      >
        参加登録が完了しました
      </Heading>

      {/* ステータス通知 */}
      <div
        style={{
          backgroundColor: theme.bg,
          borderLeft: `4px solid ${theme.border}`,
          padding: "12px 16px",
          borderRadius: "4px",
          marginBottom: "24px",
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: "15px",
            lineHeight: "22px",
            color: theme.text,
          }}
        >
          現在の参加状況：{statusText}
        </Text>
      </div>

      {/* イベント情報 */}
      <Heading
        as="h2"
        style={{
          fontSize: "18px",
          lineHeight: "24px",
          margin: "0 0 12px 0",
          color: "#0f172a",
          fontWeight: "600",
        }}
      >
        イベント情報
      </Heading>

      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          overflow: "hidden",
          marginBottom: "24px",
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "13px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
            }}
          >
            イベント名
          </Text>
          <Text style={{ margin: 0, fontSize: "15px", lineHeight: "22px", color: "#0f172a" }}>
            {eventTitle}
          </Text>
        </div>

        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "13px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
            }}
          >
            開催日時
          </Text>
          <Text style={{ margin: 0, fontSize: "15px", lineHeight: "22px", color: "#0f172a" }}>
            {formattedDate}
          </Text>
        </div>

        <div style={{ padding: "14px 16px" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "13px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
            }}
          >
            参加状況
          </Text>
          <Text style={{ margin: 0, fontSize: "15px", lineHeight: "22px", color: "#0f172a" }}>
            {statusText}
          </Text>
        </div>
      </div>

      {/* CTA */}
      <div style={{ marginBottom: "24px" }}>
        <Button href={guestUrl}>参加状況を確認・変更する</Button>
        <Text
          style={{
            margin: "8px 0 0 0",
            fontSize: "14px",
            lineHeight: "20px",
            color: "#64748b",
            wordBreak: "break-all",
          }}
        >
          または、次のURLにアクセスしてください：
          <br />
          <a
            href={guestUrl}
            style={{
              color: "#3b82f6",
              textDecoration: "underline",
            }}
          >
            {guestUrl}
          </a>
        </Text>
      </div>

      <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0" }} />

      {/* 個別リンクの注意 */}
      <div
        style={{
          backgroundColor: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          padding: "12px 16px",
          marginBottom: "12px",
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: "13px",
            lineHeight: "20px",
            color: "#475569",
            textAlign: "center",
          }}
        >
          このリンクは個人用です。第三者と共有しないでください。
        </Text>
      </div>

      {/* お問い合わせ */}
      <Text
        style={{
          margin: 0,
          fontSize: "14px",
          lineHeight: "20px",
          color: "#64748b",
          textAlign: "center",
        }}
      >
        ご不明な点がございましたら、主催者にお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default ParticipationRegisteredEmail;
