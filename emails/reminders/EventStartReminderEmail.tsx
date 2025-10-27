import * as React from "react";

import { Heading, Text, Link } from "@react-email/components";

import { Button } from "../_components/Button";
import { EmailLayout } from "../_layout/EmailLayout";

export interface EventStartReminderEmailProps {
  nickname: string;
  eventTitle: string;
  eventDate: string; // ISO推奨
  eventLocation: string | null;
  eventDescription: string | null;
  guestUrl: string;
}

export const EventStartReminderEmail = ({
  nickname,
  eventTitle,
  eventDate,
  eventLocation,
  eventDescription,
  guestUrl,
}: EventStartReminderEmailProps) => {
  const formattedDate = new Date(eventDate).toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

  return (
    <EmailLayout preheader={`${eventTitle}の開始が近づいています`}>
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

      {/* タイトル */}
      <Heading
        as="h1"
        style={{
          color: "#0f172a",
          fontSize: "24px",
          lineHeight: "32px",
          margin: "0 0 20px 0",
          fontWeight: 600,
        }}
      >
        開始が近づいています
      </Heading>

      {/* イベント詳細カード */}
      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          overflow: "hidden",
          margin: "0 0 24px 0",
        }}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
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
          <Text style={{ margin: 0, fontSize: "16px", lineHeight: "24px", color: "#0f172a" }}>
            {eventTitle}
          </Text>
        </div>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "13px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
            }}
          >
            日時
          </Text>
          <Text style={{ margin: 0, fontSize: "15px", lineHeight: "22px", color: "#0f172a" }}>
            {formattedDate}
          </Text>
        </div>
        {eventLocation && (
          <div style={{ padding: "16px 20px" }}>
            <Text
              style={{
                margin: "0 0 4px 0",
                fontSize: "13px",
                lineHeight: "18px",
                color: "#64748b",
                fontWeight: 500,
              }}
            >
              会場
            </Text>
            <Text style={{ margin: 0, fontSize: "15px", lineHeight: "22px", color: "#0f172a" }}>
              {eventLocation}
            </Text>
          </div>
        )}
      </div>

      {/* 説明文（任意） */}
      {eventDescription && (
        <Text
          style={{
            margin: "0 0 24px 0",
            fontSize: "14px",
            lineHeight: "20px",
            color: "#334155",
            whiteSpace: "pre-wrap",
          }}
        >
          {eventDescription}
        </Text>
      )}

      {/* 主要CTA（状況で出し分け） */}
      <div style={{ margin: "24px 0 8px 0" }}>
        <Button href={guestUrl} variant="primary" fullWidth>
          詳細を確認する
        </Button>
      </div>

      {/* テキストリンクのフォールバック */}
      <Text
        style={{
          margin: "8px 0 0 0",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#6b7280",
        }}
      >
        ボタンが機能しない場合は、以下のURLをブラウザにコピーしてください:
        <br />
        <Link
          href={guestUrl}
          style={{
            color: "#2563eb",
            textDecoration: "underline",
            wordBreak: "break-all",
          }}
        >
          {guestUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
};

export default EventStartReminderEmail;
