import * as React from "react";

import { Heading, Text } from "@react-email/components";

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

export const AccountStatusChangedEmail = ({
  userName,
  oldStatus,
  newStatus,
  chargesEnabled,
  payoutsEnabled,
}: AccountStatusChangedEmailProps) => {
  const statusColor =
    newStatus === "verified" ? "#059669" : newStatus === "restricted" ? "#dc2626" : "#2563eb";

  const isVerified = newStatus === "verified";

  return (
    <EmailLayout preheader="Stripeアカウントの状態が更新されました">
      <Heading
        style={{
          color: statusColor,
          fontSize: "24px",
          lineHeight: "32px",
          margin: "0 0 20px 0",
        }}
      >
        アカウント状態更新
      </Heading>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        {userName} 様
      </Text>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        みんなの集金をご利用いただき、ありがとうございます。
      </Text>

      <Section variant="default">
        <Heading
          as="h3"
          style={{
            fontSize: "18px",
            lineHeight: "28px",
            margin: "0 0 10px 0",
            color: "#1f2937",
          }}
        >
          変更内容:
        </Heading>
        <ul
          style={{
            margin: 0,
            paddingLeft: "20px",
            fontSize: "16px",
            lineHeight: "24px",
          }}
        >
          <li>
            状態: {statusMap[oldStatus] || oldStatus} →{" "}
            <strong style={{ color: statusColor }}>{statusMap[newStatus] || newStatus}</strong>
          </li>
          <li>
            決済受取:{" "}
            <StatusBadge
              status={chargesEnabled ? "enabled" : "disabled"}
              label={chargesEnabled ? "有効" : "無効"}
            />
          </li>
          <li>
            送金:{" "}
            <StatusBadge
              status={payoutsEnabled ? "enabled" : "disabled"}
              label={payoutsEnabled ? "有効" : "無効"}
            />
          </li>
        </ul>
      </Section>

      {isVerified && (
        <Section variant="success">
          <Text
            style={{
              margin: 0,
              color: "#059669",
              fontWeight: "bold",
              fontSize: "16px",
              lineHeight: "24px",
            }}
          >
            ✅ これで、イベントの売上を自動的に受け取ることができるようになりました。
          </Text>
        </Section>
      )}

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        ご不明な点がございましたら、お気軽にお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default AccountStatusChangedEmail;
