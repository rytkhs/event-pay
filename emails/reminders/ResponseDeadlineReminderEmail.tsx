import * as React from "react";

import { Heading, Text, Hr } from "@react-email/components";

import { Button } from "../_components/Button";
import { EmailLayout } from "../_layout/EmailLayout";

export interface ResponseDeadlineReminderEmailProps {
  nickname: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string | null;
  responseDeadline: string;
  guestUrl: string;
}

export const ResponseDeadlineReminderEmail = ({
  nickname,
  eventTitle,
  eventDate,
  eventLocation,
  responseDeadline,
  guestUrl,
}: ResponseDeadlineReminderEmailProps) => {
  return (
    <EmailLayout preheader={`${eventTitle}の参加期限が近づいています。`}>
      {/* 宛名 */}
      <Text
        style={{
          margin: "0 0 8px 0",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#475569",
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
        参加期限が近づいています
      </Heading>

      {/* 注意喚起（シンプルなアラートスタイル） */}
      <div
        style={{
          backgroundColor: "#fff7ed",
          borderLeft: "4px solid #f97316",
          padding: "12px 16px",
          borderRadius: 4,
          margin: "0 0 24px 0",
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: "15px",
            lineHeight: "22px",
            color: "#7c2d12",
            fontWeight: 600,
          }}
        >
          参加申込期限が近づいています
        </Text>
        <Text
          style={{
            margin: "6px 0 0 0",
            fontSize: "14px",
            lineHeight: "20px",
            color: "#7c2d12",
          }}
        >
          ご都合をご確認のうえ、参加ステータスの更新をお願いします。
        </Text>
      </div>

      {/* イベント情報 */}
      <Heading
        as="h2"
        style={{
          color: "#0f172a",
          fontSize: "18px",
          lineHeight: "24px",
          margin: "0 0 12px 0",
          fontWeight: 600,
        }}
      >
        イベント情報
      </Heading>

      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "12px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
              letterSpacing: "0.2px",
            }}
          >
            イベント名
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: "15px",
              lineHeight: "22px",
              color: "#0f172a",
            }}
          >
            {eventTitle}
          </Text>
        </div>

        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "12px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
              letterSpacing: "0.2px",
            }}
          >
            日時
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: "15px",
              lineHeight: "22px",
              color: "#0f172a",
            }}
          >
            {eventDate}
          </Text>
        </div>

        {eventLocation && (
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0" }}>
            <Text
              style={{
                margin: "0 0 4px 0",
                fontSize: "12px",
                lineHeight: "18px",
                color: "#64748b",
                fontWeight: 500,
                letterSpacing: "0.2px",
              }}
            >
              場所
            </Text>
            <Text
              style={{
                margin: 0,
                fontSize: "15px",
                lineHeight: "22px",
                color: "#0f172a",
              }}
            >
              {eventLocation}
            </Text>
          </div>
        )}

        <div style={{ padding: "14px 16px" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "12px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
              letterSpacing: "0.2px",
            }}
          >
            参加期限
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: "16px",
              lineHeight: "24px",
              color: "#0f172a",
              fontWeight: 600,
            }}
          >
            {responseDeadline}
          </Text>
        </div>
      </div>

      {/* CTA */}
      <Text
        style={{
          margin: "0 0 12px 0",
          fontSize: "15px",
          lineHeight: "22px",
          color: "#334155",
        }}
      >
        下のボタンから参加ステータスを更新できます。
      </Text>

      <div style={{ marginBottom: 24 }}>
        <Button href={guestUrl} variant="primary" fullWidth>
          参加ステータスを更新する
        </Button>
      </div>

      <Hr style={{ borderColor: "#e2e8f0", margin: "16px 0" }} />

      {/* フォールバックリンク（説明的なリンクテキスト＋URL表示） */}
      <Text
        style={{
          margin: "0 0 6px 0",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#64748b",
        }}
      >
        ボタンが機能しない場合は、次のリンクからアクセスしてください。
      </Text>
      <Text
        style={{
          margin: "6px 0 0 0",
          fontSize: "12px",
          lineHeight: "18px",
          color: "#94a3b8",
        }}
      >
        URL: {guestUrl}
      </Text>
    </EmailLayout>
  );
};

export default ResponseDeadlineReminderEmail;
