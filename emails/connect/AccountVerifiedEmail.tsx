import * as React from "react";

import { Heading, Text } from "@react-email/components";

import { Section } from "../_components/Section";
import { EmailLayout } from "../_layout/EmailLayout";

export interface AccountVerifiedEmailProps {
  userName: string;
}

export const AccountVerifiedEmail = ({ userName }: AccountVerifiedEmailProps) => {
  return (
    <EmailLayout preheader="Stripeアカウントの認証が完了しました">
      <Heading
        style={{
          color: "#2563eb",
          fontSize: "24px",
          lineHeight: "32px",
          margin: "0 0 20px 0",
        }}
      >
        アカウント認証完了
      </Heading>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        {userName} 様
      </Text>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        みんなの集金をご利用いただき、ありがとうございます。
      </Text>

      <Section variant="info">
        <Text
          style={{
            margin: 0,
            fontWeight: "bold",
            color: "#0ea5e9",
            fontSize: "16px",
            lineHeight: "24px",
          }}
        >
          ✅ Stripeアカウントの認証が完了しました
        </Text>
      </Section>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        これで、イベントの売上を自動的に受け取ることができるようになりました。
      </Text>

      <ul
        style={{ margin: "0 0 16px 0", paddingLeft: "20px", fontSize: "16px", lineHeight: "24px" }}
      >
        <li>イベント終了後に自動的に売上が送金されます</li>
        <li>送金状況はダッシュボードからご確認いただけます</li>
      </ul>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default AccountVerifiedEmail;
