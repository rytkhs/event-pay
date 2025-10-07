import * as React from "react";

import { Heading, Text } from "@react-email/components";

import { Divider } from "../_components/Divider";
import { Section } from "../_components/Section";
import { EmailLayout } from "../_layout/EmailLayout";

export interface AccountVerifiedEmailProps {
  userName: string;
}

export const AccountVerifiedEmail = ({ userName }: AccountVerifiedEmailProps) => {
  return (
    <EmailLayout preheader="Stripeアカウントの認証が完了しました">
      <Text
        style={{
          margin: "0 0 8px 0",
          fontSize: "28px",
          lineHeight: "36px",
          fontWeight: "700",
          color: "#1e293b",
        }}
      >
        🎉 アカウント認証完了
      </Text>

      <Text
        style={{
          margin: "0 0 32px 0",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#64748b",
        }}
      >
        {userName} 様
      </Text>

      <Section variant="success">
        <Text
          style={{
            margin: 0,
            fontWeight: "600",
            color: "#166534",
            fontSize: "18px",
            lineHeight: "28px",
          }}
        >
          ✅ Stripeアカウントの認証が完了しました
        </Text>
        <Text
          style={{
            margin: "8px 0 0 0",
            fontSize: "15px",
            lineHeight: "22px",
            color: "#15803d",
          }}
        >
          イベントの売上を自動的に受け取ることができるようになりました。
        </Text>
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
        ご利用いただける機能
      </Heading>

      <div
        style={{
          backgroundColor: "#f8fafc",
          borderRadius: "12px",
          padding: "20px",
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", marginBottom: "16px" }}>
          <div
            style={{
              backgroundColor: "#667eea",
              borderRadius: "8px",
              width: "40px",
              height: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "16px",
              fontSize: "20px",
            }}
          >
            💰
          </div>
          <div>
            <Text
              style={{
                margin: "0 0 4px 0",
                fontSize: "16px",
                lineHeight: "24px",
                fontWeight: "600",
                color: "#1e293b",
              }}
            >
              自動送金
            </Text>
            <Text style={{ margin: 0, fontSize: "14px", lineHeight: "20px", color: "#64748b" }}>
              イベント終了後に自動的に売上が送金されます
            </Text>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start" }}>
          <div
            style={{
              backgroundColor: "#667eea",
              borderRadius: "8px",
              width: "40px",
              height: "40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "16px",
              fontSize: "20px",
            }}
          >
            📊
          </div>
          <div>
            <Text
              style={{
                margin: "0 0 4px 0",
                fontSize: "16px",
                lineHeight: "24px",
                fontWeight: "600",
                color: "#1e293b",
              }}
            >
              送金状況の確認
            </Text>
            <Text style={{ margin: 0, fontSize: "14px", lineHeight: "20px", color: "#64748b" }}>
              ダッシュボードからいつでも確認できます
            </Text>
          </div>
        </div>
      </div>

      <Text
        style={{
          margin: "32px 0 0 0",
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
