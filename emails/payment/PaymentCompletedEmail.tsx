import * as React from "react";

import { Heading, Text, Hr } from "@react-email/components";

import { Button } from "../_components/Button";
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
    <EmailLayout preheader={`${eventTitle}のお支払いが完了しました`}>
      {/* ヘッダー部分 */}
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

      {/* メインタイトル */}
      <Heading
        as="h1"
        style={{
          margin: "0 0 32px 0",
          fontSize: "24px",
          lineHeight: "32px",
          fontWeight: "600",
          color: "#0f172a",
        }}
      >
        お支払いが完了しました
      </Heading>

      {/* 成功メッセージ */}
      <div
        style={{
          backgroundColor: "#f0fdf4",
          borderLeft: "4px solid #22c55e",
          padding: "16px 20px",
          marginBottom: "32px",
          borderRadius: "4px",
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: "15px",
            lineHeight: "22px",
            color: "#166534",
          }}
        >
          お支払いの処理が正常に完了しました。ありがとうございます。
        </Text>
      </div>

      {/* お支払い詳細 */}
      <Heading
        as="h2"
        style={{
          fontSize: "18px",
          lineHeight: "24px",
          margin: "0 0 16px 0",
          color: "#0f172a",
          fontWeight: "600",
        }}
      >
        お支払い内容
      </Heading>

      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          overflow: "hidden",
          marginBottom: "32px",
        }}
      >
        {/* イベント名 */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "13px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: "500",
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

        {/* お支払い金額 */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid #e2e8f0",
          }}
        >
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "13px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: "500",
            }}
          >
            お支払い金額
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: "20px",
              lineHeight: "28px",
              color: "#0f172a",
              fontWeight: "600",
            }}
          >
            {formattedAmount}
          </Text>
        </div>

        {/* お支払い日時 */}
        <div
          style={{
            padding: "16px 20px",
          }}
        >
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "13px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: "500",
            }}
          >
            お支払い日時
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: "15px",
              lineHeight: "22px",
              color: "#0f172a",
            }}
          >
            {formattedDate}
          </Text>
        </div>
      </div>

      {/* レシートボタン */}
      {receiptUrl && (
        <div style={{ marginBottom: "32px" }}>
          <Button href={receiptUrl}>レシートを表示</Button>
        </div>
      )}

      {/* 区切り線 */}
      <Hr
        style={{
          borderColor: "#e2e8f0",
          margin: "32px 0",
        }}
      />

      {/* フッター */}
      <Text
        style={{
          margin: 0,
          fontSize: "14px",
          lineHeight: "20px",
          color: "#64748b",
        }}
      >
        ご不明な点がございましたら、イベント主催者までお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default PaymentCompletedEmail;
