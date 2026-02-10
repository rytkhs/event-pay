import * as React from "react";

import { Heading, Text, Hr } from "@react-email/components";

import { Button } from "../_components/Button";
import { EmailLayout } from "../_layout/EmailLayout";

export interface AccountRestrictedEmailProps {
  userName: string;
  restrictionReason?: string;
  requiredActions?: string[];
  dashboardUrl?: string;
}

const AccountRestrictedEmail = ({
  userName,
  restrictionReason,
  requiredActions,
  dashboardUrl,
}: AccountRestrictedEmailProps) => {
  const hasActions = Array.isArray(requiredActions) && requiredActions.length > 0;

  const preheader = hasActions
    ? "アカウントに制限が設定されました — 対応が必要です"
    : "アカウントに制限が設定されました — 詳細をご確認ください";

  return (
    <EmailLayout preheader={preheader}>
      {/* 宛名 */}
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
          margin: "0 0 16px 0",
          fontSize: "24px",
          lineHeight: "32px",
          fontWeight: 600,
          color: "#0f172a",
        }}
      >
        アカウントに制限が設定されました
      </Heading>

      {/* アラートボックス（簡素・高コントラスト） */}
      <div
        style={{
          backgroundColor: "#fef2f2",
          borderLeft: "4px solid #dc2626",
          padding: "16px 20px",
          borderRadius: 4,
          marginBottom: 24,
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: "15px",
            lineHeight: "22px",
            color: "#7f1d1d",
          }}
        >
          アカウントに一部の機能制限が適用されています。内容をご確認のうえ、必要な対応をお願いします。
        </Text>
        {restrictionReason && (
          <Text
            style={{
              margin: "8px 0 0 0",
              fontSize: "14px",
              lineHeight: "20px",
              color: "#7f1d1d",
            }}
          >
            <strong>制限理由:</strong> {restrictionReason}
          </Text>
        )}
      </div>

      {/* 必要な対応（番号付き・スキャン可能） */}
      {hasActions && (
        <>
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
            必要な対応
          </Heading>

          <ol
            style={{
              margin: "0 0 24px 20px",
              padding: 0,
              color: "#374151",
              fontSize: "15px",
              lineHeight: "24px",
            }}
          >
            {requiredActions?.map((action, index) => (
              <li key={index} style={{ marginBottom: 8 }}>
                {action}
              </li>
            ))}
          </ol>
        </>
      )}

      {/* CTA（単一・明確） */}
      {dashboardUrl && (
        <div style={{ margin: "0 0 24px 0" }}>
          <Button href={dashboardUrl}>ダッシュボードで対応する</Button>
        </div>
      )}

      <Hr style={{ borderColor: "#e2e8f0", margin: "24px 0" }} />

      {/* 補足と連絡手段 */}
      <Text
        style={{
          margin: 0,
          fontSize: "14px",
          lineHeight: "20px",
          color: "#64748b",
        }}
      >
        ご不明な点がございましたら、サポートからお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default AccountRestrictedEmail;
