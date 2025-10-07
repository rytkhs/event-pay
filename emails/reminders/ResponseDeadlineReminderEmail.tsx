import * as React from "react";

import { Heading, Text, Link } from "@react-email/components";

import { Button } from "../_components/Button";
import { Section } from "../_components/Section";
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
    <EmailLayout preheader={`${eventTitle}の参加期限が明日までとなっています。`}>
      <Heading
        style={{
          color: "#1f2937",
          fontSize: "24px",
          lineHeight: "32px",
          margin: "0 0 20px 0",
        }}
      >
        参加期限のリマインダー
      </Heading>

      <Text
        style={{
          margin: "0 0 16px 0",
          fontSize: "16px",
          lineHeight: "24px",
        }}
      >
        {nickname} 様
      </Text>

      <Section variant="warning">
        <Text
          style={{
            margin: "0 0 12px 0",
            fontSize: "16px",
            lineHeight: "24px",
            fontWeight: "600",
          }}
        >
          ⏰ 参加申込期限が明日までとなっています
        </Text>
        <Text
          style={{
            margin: "0",
            fontSize: "14px",
            lineHeight: "20px",
          }}
        >
          以下のイベントへの参加意思表明の期限が近づいています。
          <br />
          ご都合をご確認の上、参加ステータスを更新してください。
        </Text>
      </Section>

      <Section variant="default">
        <Heading
          as="h3"
          style={{
            fontSize: "18px",
            lineHeight: "28px",
            margin: "0 0 12px 0",
            color: "#1f2937",
          }}
        >
          📅 イベント情報
        </Heading>
        <Text
          style={{
            margin: "0 0 8px 0",
            fontSize: "16px",
            lineHeight: "24px",
            fontWeight: "600",
          }}
        >
          {eventTitle}
        </Text>
        <Text
          style={{
            margin: "0 0 4px 0",
            fontSize: "14px",
            lineHeight: "20px",
            color: "#6b7280",
          }}
        >
          📍 日時: {eventDate}
        </Text>
        {eventLocation && (
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "14px",
              lineHeight: "20px",
              color: "#6b7280",
            }}
          >
            📍 場所: {eventLocation}
          </Text>
        )}
        <Text
          style={{
            margin: "0",
            fontSize: "14px",
            lineHeight: "20px",
            color: "#ef4444",
            fontWeight: "600",
          }}
        >
          ⏱️ 参加期限: {responseDeadline}
        </Text>
      </Section>

      <Text
        style={{
          margin: "20px 0 16px 0",
          fontSize: "16px",
          lineHeight: "24px",
        }}
      >
        以下のボタンから参加ステータスを更新できます。
      </Text>

      <Button href={guestUrl} variant="primary" fullWidth>
        参加ステータスを更新する
      </Button>

      <Text
        style={{
          margin: "16px 0 0 0",
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
            color: "#667eea",
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

export default ResponseDeadlineReminderEmail;
