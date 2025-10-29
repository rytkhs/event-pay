import * as React from "react";

import { Heading, Text, Hr } from "@react-email/components";

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
  const oldLabel = statusMap[oldStatus] || oldStatus;
  const newLabel = statusMap[newStatus] || newStatus;

  const isVerified = newStatus === "verified";
  const isRestricted = newStatus === "restricted";

  return (
    <EmailLayout preheader={`Stripeアカウントの状態が「${newLabel}」に更新されました`}>
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
          margin: "0 0 24px 0",
          fontSize: "24px",
          lineHeight: "32px",
          fontWeight: 600,
          color: "#0f172a",
        }}
      >
        アカウント状態が更新されました
      </Heading>

      {/* 変更内容サマリー */}
      <div
        style={{
          backgroundColor: "#eff6ff",
          borderLeft: "4px solid #3b82f6",
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
            color: "#0f172a",
          }}
        >
          状態: {oldLabel} → <span style={{ fontWeight: 600 }}>{newLabel}</span>
        </Text>
      </div>

      {/* 機能の可用性 */}
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
        現在の利用可否
      </Heading>

      <div
        style={{
          backgroundColor: "#ffffff",
          border: "1px solid #e2e8f0",
          borderRadius: 8,
          overflow: "hidden",
          marginBottom: 24,
        }}
      >
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0" }}>
          <Text
            style={{
              margin: "0 0 6px 0",
              fontSize: "13px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
            }}
          >
            決済受取
          </Text>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusBadge
              status={chargesEnabled ? "enabled" : "disabled"}
              label={chargesEnabled ? "有効" : "無効"}
            />
            <Text style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "#0f172a" }}>
              {chargesEnabled ? "決済の受け取りが可能です" : "決済の受け取りは無効です"}
            </Text>
          </div>
        </div>

        <div style={{ padding: "14px 16px" }}>
          <Text
            style={{
              margin: "0 0 6px 0",
              fontSize: "13px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
            }}
          >
            送金
          </Text>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <StatusBadge
              status={payoutsEnabled ? "enabled" : "disabled"}
              label={payoutsEnabled ? "有効" : "無効"}
            />
            <Text style={{ margin: 0, fontSize: 14, lineHeight: "20px", color: "#0f172a" }}>
              {payoutsEnabled ? "送金が可能です" : "送金は無効です"}
            </Text>
          </div>
        </div>
      </div>

      {/* 状態別の控えめな通知 */}
      {isVerified && (
        <div
          style={{
            backgroundColor: "#f0fdf4",
            borderLeft: "4px solid #22c55e",
            padding: "14px 16px",
            borderRadius: 4,
            marginBottom: 24,
          }}
        >
          <Text
            style={{
              margin: 0,
              color: "#166534",
              fontWeight: 600,
              fontSize: 15,
              lineHeight: "22px",
            }}
          >
            イベントの売上を自動的に受け取ることができるようになりました。
          </Text>
        </div>
      )}

      {isRestricted && (
        <div
          style={{
            backgroundColor: "#fffbeb",
            borderLeft: "4px solid #f59e0b",
            padding: "14px 16px",
            borderRadius: 4,
            marginBottom: 24,
          }}
        >
          <Text
            style={{
              margin: 0,
              color: "#854d0e",
              fontWeight: 600,
              fontSize: 15,
              lineHeight: "22px",
            }}
          >
            アカウントに制限が設定されています。詳細をご確認ください。
          </Text>
        </div>
      )}

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
        ご不明な点がございましたら、お問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default AccountStatusChangedEmail;
