import * as React from "react";

import { Heading, Text } from "@react-email/components";

import { Button } from "../_components/Button";
import { Section } from "../_components/Section";
import { EmailLayout } from "../_layout/EmailLayout";

export interface AccountRestrictedEmailProps {
  userName: string;
  restrictionReason?: string;
  requiredActions?: string[];
  dashboardUrl?: string;
}

export const AccountRestrictedEmail = ({
  userName,
  restrictionReason,
  requiredActions,
  dashboardUrl,
}: AccountRestrictedEmailProps) => {
  return (
    <EmailLayout preheader="Stripeアカウントに制限が設定されました">
      <Heading
        style={{
          color: "#dc2626",
          fontSize: "24px",
          lineHeight: "32px",
          margin: "0 0 20px 0",
        }}
      >
        アカウント制限通知
      </Heading>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        {userName} 様
      </Text>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        みんなの集金をご利用いただき、ありがとうございます。
      </Text>

      <Section variant="danger">
        <Text
          style={{
            margin: 0,
            fontWeight: "bold",
            color: "#dc2626",
            fontSize: "16px",
            lineHeight: "24px",
          }}
        >
          ⚠️ Stripeアカウントに制限が設定されました
        </Text>
        {restrictionReason && (
          <Text
            style={{
              margin: "10px 0 0 0",
              fontSize: "14px",
              lineHeight: "20px",
              color: "#374151",
            }}
          >
            制限理由: {restrictionReason}
          </Text>
        )}
      </Section>

      {requiredActions && requiredActions.length > 0 && (
        <>
          <Heading
            as="h3"
            style={{
              fontSize: "18px",
              lineHeight: "28px",
              margin: "20px 0 10px 0",
              color: "#1f2937",
            }}
          >
            必要なアクション:
          </Heading>
          <ul
            style={{
              margin: "0 0 16px 0",
              paddingLeft: "20px",
              fontSize: "16px",
              lineHeight: "24px",
            }}
          >
            {requiredActions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ul>
        </>
      )}

      {dashboardUrl && (
        <div style={{ margin: "20px 0", textAlign: "center" }}>
          <Button href={dashboardUrl} variant="primary">
            Stripeダッシュボードを開く
          </Button>
        </div>
      )}

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        制限を解除するには、上記のアクションを完了してください。
      </Text>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default AccountRestrictedEmail;
