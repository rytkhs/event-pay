import * as React from "react";

import { Heading, Text, Link } from "@react-email/components";

import { Button } from "../_components/Button";
import { Section } from "../_components/Section";
import { EmailLayout } from "../_layout/EmailLayout";

export interface PaymentDeadlineReminderEmailProps {
  nickname: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string | null;
  participationFee: number;
  paymentDeadline: string;
  paymentUrl: string;
}

export const PaymentDeadlineReminderEmail = ({
  nickname,
  eventTitle,
  eventDate,
  eventLocation,
  participationFee,
  paymentDeadline,
  paymentUrl,
}: PaymentDeadlineReminderEmailProps) => {
  return (
    <EmailLayout preheader={`${eventTitle}の決済期限が明日までとなっています。`}>
      <Heading
        style={{
          color: "#1f2937",
          fontSize: "24px",
          lineHeight: "32px",
          margin: "0 0 20px 0",
        }}
      >
        決済期限のリマインダー
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

      <Section variant="danger">
        <Text
          style={{
            margin: "0 0 12px 0",
            fontSize: "16px",
            lineHeight: "24px",
            fontWeight: "600",
          }}
        >
          🔔 決済期限が明日までとなっています
        </Text>
        <Text
          style={{
            margin: "0",
            fontSize: "14px",
            lineHeight: "20px",
          }}
        >
          以下のイベントへの参加費のお支払い期限が近づいています。
          <br />
          お早めに決済をお済ませください。
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
            margin: "0 0 12px 0",
            fontSize: "18px",
            lineHeight: "28px",
            color: "#1f2937",
            fontWeight: "700",
          }}
        >
          💰 参加費: ¥{(participationFee || 0).toLocaleString()}
        </Text>
        <Text
          style={{
            margin: "0",
            fontSize: "14px",
            lineHeight: "20px",
            color: "#ef4444",
            fontWeight: "600",
          }}
        >
          ⏱️ 決済期限: {paymentDeadline}
        </Text>
      </Section>

      <Text
        style={{
          margin: "20px 0 16px 0",
          fontSize: "16px",
          lineHeight: "24px",
        }}
      >
        以下のボタンから決済を完了できます。
      </Text>

      <Button href={paymentUrl} variant="primary" fullWidth>
        決済を完了する
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
          href={paymentUrl}
          style={{
            color: "#667eea",
            textDecoration: "underline",
            wordBreak: "break-all",
          }}
        >
          {paymentUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
};

export default PaymentDeadlineReminderEmail;
