import * as React from "react";

import { Heading, Text } from "@react-email/components";

import { Section } from "../_components/Section";
import { EmailLayout } from "../_layout/EmailLayout";

export interface PaymentCompletedEmailProps {
  nickname: string;
  eventTitle: string;
  amount: number;
  paidAt: string;
}

export const PaymentCompletedEmail = ({
  nickname,
  eventTitle,
  amount,
  paidAt,
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
      <Heading
        style={{
          color: "#2563eb",
          fontSize: "24px",
          lineHeight: "32px",
          margin: "0 0 20px 0",
        }}
      >
        お支払い完了
      </Heading>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        {nickname} 様
      </Text>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        みんなの集金をご利用いただき、ありがとうございます。
      </Text>

      <Section variant="success">
        <Text
          style={{
            margin: 0,
            fontWeight: "bold",
            color: "#059669",
            fontSize: "16px",
            lineHeight: "24px",
          }}
        >
          ✅ お支払いが完了しました
        </Text>
      </Section>

      <Text
        style={{
          margin: "20px 0 8px 0",
          fontSize: "16px",
          lineHeight: "24px",
          fontWeight: "bold",
        }}
      >
        お支払い内容
      </Text>

      <div
        style={{
          backgroundColor: "#f9fafb",
          padding: "16px",
          borderRadius: "8px",
          margin: "0 0 20px 0",
        }}
      >
        <Text style={{ margin: "0 0 8px 0", fontSize: "16px", lineHeight: "24px" }}>
          <strong>イベント名:</strong> {eventTitle}
        </Text>
        <Text style={{ margin: "0 0 8px 0", fontSize: "16px", lineHeight: "24px" }}>
          <strong>お支払い金額:</strong> {formattedAmount}
        </Text>
        <Text style={{ margin: 0, fontSize: "14px", lineHeight: "20px", color: "#6b7280" }}>
          お支払い日時: {formattedDate}
        </Text>
      </div>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        イベント当日をお楽しみください。
      </Text>

      <Text
        style={{
          margin: "20px 0 0 0",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#6b7280",
        }}
      >
        ご不明な点がございましたら、イベント主催者にお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default PaymentCompletedEmail;
