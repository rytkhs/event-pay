import * as React from "react";

import { Heading, Text, Hr } from "@react-email/components";

import { EmailLayout } from "../_layout/EmailLayout";

export interface AccountVerifiedEmailProps {
  userName: string;
}

export const AccountVerifiedEmail = ({ userName }: AccountVerifiedEmailProps) => {
  return (
    <EmailLayout preheader="Stripeアカウントの認証が完了しました">
      {/* 挨拶 */}
      <Text
        style={{
          margin: "0 0 8px 0",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#64748b",
        }}
      >
        {userName} 様
      </Text>

      {/* タイトル */}
      <Heading
        as="h1"
        style={{
          margin: "0 0 24px 0",
          fontSize: "24px",
          lineHeight: "32px",
          fontWeight: 600,
          color: "#0f172a",
        }}
      >
        アカウント認証が完了しました
      </Heading>

      {/* 成功通知（シンプルアラート） */}
      <div
        style={{
          backgroundColor: "#f0fdf4",
          borderLeft: "4px solid #22c55e",
          padding: "16px 20px",
          marginBottom: "24px",
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
          Stripeアカウントの認証が正常に完了しました。イベントの売上を自動的に受け取れる状態です。
        </Text>
      </div>

      {/* 機能セクション */}
      <Heading
        as="h2"
        style={{
          fontSize: "18px",
          lineHeight: "24px",
          margin: "0 0 12px 0",
          color: "#0f172a",
          fontWeight: 600,
        }}
      >
        ご利用いただける機能
      </Heading>

      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        {/* 自動送金 */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "14px",
              lineHeight: "20px",
              color: "#0f172a",
              fontWeight: 600,
            }}
          >
            オンライン決済
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: "14px",
              lineHeight: "20px",
              color: "#64748b",
            }}
          >
            オンライン決済が選択可能になりました。
          </Text>
        </div>

        {/* 送金状況の確認 */}
        <div style={{ padding: "16px 20px" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "14px",
              lineHeight: "20px",
              color: "#0f172a",
              fontWeight: 600,
            }}
          >
            送金状況の確認
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: "14px",
              lineHeight: "20px",
              color: "#64748b",
            }}
          >
            ダッシュボードからいつでも送金履歴やステータスを確認できます。
          </Text>
        </div>
      </div>

      {/* 区切り */}
      <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0" }} />

      {/* フッター */}
      <Text
        style={{
          margin: 0,
          fontSize: "14px",
          lineHeight: "20px",
          color: "#64748b",
          textAlign: "center",
        }}
      >
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default AccountVerifiedEmail;
