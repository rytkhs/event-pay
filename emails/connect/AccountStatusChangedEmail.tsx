import * as React from "react";

import { Heading, Text } from "@react-email/components";

import { Divider } from "../_components/Divider";
import { Section } from "../_components/Section";
import { StatusBadge } from "../_components/StatusBadge";
import { EmailLayout } from "../_layout/EmailLayout";

export interface AccountStatusChangedEmailProps {
  userName: string;
  oldStatus: string;
  newStatus: string;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}

const statusMap: Record<string, string> = {
  unverified: "未認証",
  onboarding: "認証中",
  verified: "認証済み",
  restricted: "制限中",
};

const statusEmoji: Record<string, string> = {
  unverified: "⏳",
  onboarding: "🔄",
  verified: "✅",
  restricted: "⚠️",
};

export const AccountStatusChangedEmail = ({
  userName,
  oldStatus,
  newStatus,
  chargesEnabled,
  payoutsEnabled,
}: AccountStatusChangedEmailProps) => {
  const isVerified = newStatus === "verified";
  const isRestricted = newStatus === "restricted";

  return (
    <EmailLayout preheader="Stripeアカウントの状態が更新されました">
      <Text
        style={{
          margin: "0 0 8px 0",
          fontSize: "28px",
          lineHeight: "36px",
          fontWeight: "700",
          color: "#1e293b",
        }}
      >
        {statusEmoji[newStatus] || "📢"} アカウント状態更新
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

      <Section variant="info">
        <Heading
          as="h2"
          style={{
            fontSize: "18px",
            lineHeight: "28px",
            margin: "0 0 16px 0",
            color: "#1e40af",
            fontWeight: "600",
          }}
        >
          📊 変更内容
        </Heading>
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: "8px",
            padding: "16px",
            marginBottom: "12px",
          }}
        >
          <Text
            style={{
              margin: "0 0 8px 0",
              fontSize: "14px",
              lineHeight: "20px",
              color: "#64748b",
              fontWeight: "500",
            }}
          >
            アカウント状態
          </Text>
          <Text style={{ margin: 0, fontSize: "16px", lineHeight: "24px", color: "#1e293b" }}>
            {statusMap[oldStatus] || oldStatus} →{" "}
            <strong>{statusMap[newStatus] || newStatus}</strong>
          </Text>
        </div>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ flex: "1", minWidth: "140px" }}>
            <Text
              style={{
                margin: "0 0 8px 0",
                fontSize: "14px",
                lineHeight: "20px",
                color: "#64748b",
              }}
            >
              決済受取
            </Text>
            <StatusBadge
              status={chargesEnabled ? "enabled" : "disabled"}
              label={chargesEnabled ? "有効" : "無効"}
            />
          </div>
          <div style={{ flex: "1", minWidth: "140px" }}>
            <Text
              style={{
                margin: "0 0 8px 0",
                fontSize: "14px",
                lineHeight: "20px",
                color: "#64748b",
              }}
            >
              送金
            </Text>
            <StatusBadge
              status={payoutsEnabled ? "enabled" : "disabled"}
              label={payoutsEnabled ? "有効" : "無効"}
            />
          </div>
        </div>
      </Section>

      {isVerified && (
        <>
          <Divider />
          <Section variant="success">
            <Text
              style={{
                margin: 0,
                color: "#166534",
                fontWeight: "600",
                fontSize: "16px",
                lineHeight: "24px",
              }}
            >
              🎉 イベントの売上を自動的に受け取ることができるようになりました。
            </Text>
          </Section>
        </>
      )}

      {isRestricted && (
        <>
          <Divider />
          <Section variant="warning">
            <Text
              style={{
                margin: 0,
                color: "#854d0e",
                fontWeight: "600",
                fontSize: "16px",
                lineHeight: "24px",
              }}
            >
              ⚠️ アカウントに制限が設定されています。詳細をご確認ください。
            </Text>
          </Section>
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
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default AccountStatusChangedEmail;
