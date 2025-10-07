import * as React from "react";

import { Heading, Text } from "@react-email/components";

import { Button } from "../_components/Button";
import { Divider } from "../_components/Divider";
import { InfoCard } from "../_components/InfoCard";
import { Section } from "../_components/Section";
import { EmailLayout } from "../_layout/EmailLayout";

export interface PaymentCompletedEmailProps {
  nickname: string;
  eventTitle: string;
  amount: number;
  paidAt: string;
  receiptUrl?: string;
}

export const PaymentCompletedEmail = ({
  nickname,
  eventTitle,
  amount,
  paidAt,
  receiptUrl,
}: PaymentCompletedEmailProps) => {
  const formattedAmount = new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
  }).format(amount);

  const formattedDate = new Date(paidAt).toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

  return (
    <EmailLayout preheader="お支払いが完了しました">
      <Text
        style={{
          margin: "0 0 8px 0",
          fontSize: "28px",
          lineHeight: "36px",
          fontWeight: "700",
          color: "#1e293b",
        }}
      >
        💳 お支払い完了
      </Text>

      <Text
        style={{
          margin: "0 0 32px 0",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#64748b",
        }}
      >
        {nickname} 様
      </Text>

      <Section variant="success">
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              backgroundColor: "#22c55e",
              borderRadius: "50%",
              width: "64px",
              height: "64px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "32px",
              margin: "0 0 16px 0",
            }}
          >
            ✓
          </div>
          <Text
            style={{
              margin: 0,
              fontWeight: "700",
              color: "#166534",
              fontSize: "20px",
              lineHeight: "28px",
            }}
          >
            お支払いが完了しました
          </Text>
          <Text
            style={{
              margin: "8px 0 0 0",
              fontSize: "15px",
              lineHeight: "22px",
              color: "#15803d",
            }}
          >
            ありがとうございます!
          </Text>
        </div>
      </Section>

      <Divider />

      <Heading
        as="h2"
        style={{
          fontSize: "20px",
          lineHeight: "28px",
          margin: "0 0 16px 0",
          color: "#1e293b",
          fontWeight: "600",
        }}
      >
        📋 お支払い内容
      </Heading>

      <div
        style={{
          backgroundColor: "#f8fafc",
          borderRadius: "12px",
          padding: "24px",
          border: "1px solid #e2e8f0",
        }}
      >
        <InfoCard label="イベント名" value={eventTitle} icon="🎉" />
        <InfoCard label="お支払い金額" value={formattedAmount} icon="💰" />
        <InfoCard label="お支払い日時" value={formattedDate} icon="📅" />
      </div>

      {receiptUrl && (
        <>
          <Divider />
          <Text
            style={{
              margin: "0 0 16px 0",
              fontSize: "16px",
              lineHeight: "24px",
              color: "#475569",
              textAlign: "center",
            }}
          >
            レシートは以下のボタンからご確認いただけます。
          </Text>
          <Button href={receiptUrl}>レシートを表示</Button>
        </>
      )}

      <Text
        style={{
          margin: "32px 0 0 0",
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

export default PaymentCompletedEmail;
