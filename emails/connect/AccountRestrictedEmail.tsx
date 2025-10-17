import * as React from "react";

import { Heading, Text } from "@react-email/components";

import { Button } from "../_components/Button";
import { Divider } from "../_components/Divider";
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
      <Text
        style={{
          margin: "0 0 8px 0",
          fontSize: "28px",
          lineHeight: "36px",
          fontWeight: "700",
          color: "#1e293b",
        }}
      >
        ⚠️ アカウント制限通知
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

      <Section variant="danger">
        <Text
          style={{
            margin: 0,
            fontWeight: "700",
            color: "#991b1b",
            fontSize: "18px",
            lineHeight: "28px",
          }}
        >
          🚨 Stripeアカウントに制限が設定されました
        </Text>
        {restrictionReason && (
          <Text
            style={{
              margin: "12px 0 0 0",
              fontSize: "15px",
              lineHeight: "22px",
              color: "#7f1d1d",
              backgroundColor: "#fef2f2",
              padding: "12px",
              borderRadius: "6px",
              border: "1px solid #fca5a5",
            }}
          >
            <strong>制限理由:</strong> {restrictionReason}
          </Text>
        )}
      </Section>

      {requiredActions && requiredActions.length > 0 && (
        <>
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
            📋 必要なアクション
          </Heading>
          <div
            style={{
              backgroundColor: "#fffbeb",
              borderRadius: "12px",
              padding: "20px",
              border: "2px solid #fde047",
              borderLeft: "6px solid #eab308",
            }}
          >
            {requiredActions.map((action, index) => (
              <div
                key={index}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  marginBottom: index < requiredActions.length - 1 ? "12px" : "0",
                }}
              >
                <span
                  style={{
                    backgroundColor: "#eab308",
                    color: "#ffffff",
                    borderRadius: "50%",
                    width: "24px",
                    height: "24px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: "12px",
                    fontSize: "12px",
                    fontWeight: "600",
                    flexShrink: 0,
                  }}
                >
                  {index + 1}
                </span>
                <Text
                  style={{
                    margin: 0,
                    fontSize: "15px",
                    lineHeight: "24px",
                    color: "#713f12",
                  }}
                >
                  {action}
                </Text>
              </div>
            ))}
          </div>
        </>
      )}

      {dashboardUrl && <Button href={dashboardUrl}>Stripeダッシュボードを開く</Button>}

      <Text
        style={{
          margin: "32px 0 0 0",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#64748b",
          textAlign: "center",
        }}
      >
        制限を解除するには、上記のアクションを完了してください。
        <br />
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default AccountRestrictedEmail;
