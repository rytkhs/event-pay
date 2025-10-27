import * as React from "react";

import { Heading, Text, Link, Hr } from "@react-email/components";

import { Button } from "../_components/Button";
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
  const formattedFee = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(participationFee || 0);

  const formattedEventDate = new Date(eventDate).toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

  const formattedDeadline = new Date(paymentDeadline).toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

  return (
    <EmailLayout preheader={`決済期限 ${formattedDeadline} まで`}>
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
          margin: "0 0 16px 0",
          fontSize: "24px",
          lineHeight: "32px",
          fontWeight: 600,
          color: "#0f172a",
        }}
      >
        決済期限が近づいています
      </Heading>

      {/* アラート（緊急度） */}
      <div
        style={{
          backgroundColor: "#fef2f2",
          borderLeft: "4px solid #ef4444",
          padding: "12px 16px",
          borderRadius: 4,
          marginBottom: 24,
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: 15,
            lineHeight: "22px",
            color: "#991b1b",
            fontWeight: 600,
          }}
        >
          決済期限が近づいています（{formattedDeadline} まで）
        </Text>
        <Text
          style={{
            margin: "4px 0 0 0",
            fontSize: 14,
            lineHeight: "20px",
            color: "#7f1d1d",
          }}
        >
          以下のイベント費の決済をお早めに完了してください。
        </Text>
      </div>

      {/* 情報カード */}
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
          <Text style={{ margin: "0 0 2px 0", fontSize: 13, color: "#64748b", fontWeight: 500 }}>
            イベント名
          </Text>
          <Text style={{ margin: 0, fontSize: 15, color: "#0f172a" }}>{eventTitle}</Text>
        </div>

        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0" }}>
          <Text style={{ margin: "0 0 2px 0", fontSize: 13, color: "#64748b", fontWeight: 500 }}>
            日時
          </Text>
          <Text style={{ margin: 0, fontSize: 15, color: "#0f172a" }}>{formattedEventDate}</Text>
        </div>

        {eventLocation && (
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0" }}>
            <Text style={{ margin: "0 0 2px 0", fontSize: 13, color: "#64748b", fontWeight: 500 }}>
              場所
            </Text>
            <Text style={{ margin: 0, fontSize: 15, color: "#0f172a" }}>{eventLocation}</Text>
          </div>
        )}

        <div style={{ padding: "14px 16px" }}>
          <Text style={{ margin: "0 0 2px 0", fontSize: 13, color: "#64748b", fontWeight: 500 }}>
            イベント費
          </Text>
          <Text style={{ margin: 0, fontSize: 18, color: "#0f172a", fontWeight: 600 }}>
            {formattedFee}
          </Text>
        </div>
      </div>

      {/* CTA */}
      <div style={{ marginBottom: 24 }}>
        <Button href={paymentUrl} variant="primary" fullWidth>
          決済を完了する
        </Button>
      </div>

      <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0" }} />

      {/* フォールバックリンク */}
      <Text
        style={{
          margin: 0,
          fontSize: 14,
          lineHeight: "20px",
          color: "#64748b",
        }}
      >
        ボタンが機能しない場合は、以下のURLをブラウザにコピーしてください。
      </Text>
      <Text
        style={{
          margin: "6px 0 0 0",
          fontSize: 14,
          lineHeight: "20px",
        }}
      >
        <Link
          href={paymentUrl}
          style={{ color: "#2563eb", textDecoration: "underline", wordBreak: "break-all" }}
        >
          {paymentUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
};

export default PaymentDeadlineReminderEmail;
