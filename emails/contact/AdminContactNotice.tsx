import * as React from "react";

import { Heading, Text, Link, Hr } from "@react-email/components";

import { EmailLayout } from "../_layout/EmailLayout";

export interface AdminContactNoticeProps {
  name: string;
  email: string;
  messageExcerpt: string;
  receivedAt: Date;
}

const AdminContactNotice = ({
  name,
  email,
  messageExcerpt,
  receivedAt,
}: AdminContactNoticeProps) => {
  const isValidDate = receivedAt instanceof Date && !isNaN(receivedAt.getTime());
  const formattedDate = isValidDate
    ? new Date(receivedAt).toLocaleString("ja-JP", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Tokyo",
      }) + " (JST)"
    : "日付が無効です";

  return (
    <EmailLayout preheader={`${name} 様から新しいお問い合わせが届きました`}>
      {/* タイトル */}
      <Heading
        as="h1"
        style={{
          margin: "0 0 12px 0",
          fontSize: "24px",
          lineHeight: "32px",
          fontWeight: 600,
          color: "#0f172a",
        }}
      >
        新しいお問い合わせ
      </Heading>

      <Text
        style={{
          margin: "0 0 20px 0",
          fontSize: "15px",
          lineHeight: "22px",
          color: "#334155",
        }}
      >
        下記の内容をご確認のうえ、必要に応じてご対応ください。
      </Text>

      {/* メタ情報カード */}
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
              margin: "0 0 4px 0",
              fontSize: "12px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
              letterSpacing: "0.2px",
            }}
          >
            氏名
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: "15px",
              lineHeight: "22px",
              color: "#0f172a",
            }}
          >
            {name}
          </Text>
        </div>

        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "12px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
              letterSpacing: "0.2px",
            }}
          >
            メールアドレス
          </Text>
          <Link
            href={`mailto:${email}`}
            aria-label="送信者にメールで返信"
            style={{
              color: "#2563eb",
              textDecoration: "underline",
              fontSize: "15px",
              lineHeight: "22px",
              wordBreak: "break-all",
            }}
          >
            {email}
          </Link>
        </div>

        <div style={{ padding: "14px 16px" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "12px",
              lineHeight: "18px",
              color: "#64748b",
              fontWeight: 500,
              letterSpacing: "0.2px",
            }}
          >
            受信日時
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

      <Hr style={{ borderColor: "#e2e8f0", margin: "16px 0" }} />

      {/* お問い合わせ本文 */}
      <Heading
        as="h2"
        style={{
          margin: "0 0 12px 0",
          fontSize: "18px",
          lineHeight: "24px",
          color: "#0f172a",
          fontWeight: 600,
        }}
      >
        お問い合わせ本文
      </Heading>

      <div
        style={{
          backgroundColor: "#f8fafc",
          borderRadius: 8,
          padding: 16,
          border: "1px solid #e2e8f0",
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: "15px",
            lineHeight: "24px",
            whiteSpace: "pre-wrap",
            color: "#334155",
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          {messageExcerpt}
        </Text>
      </div>

      <Text
        style={{
          margin: "12px 0 0 0",
          fontSize: "12px",
          lineHeight: "18px",
          color: "#64748b",
        }}
      >
        ※ 本文は最大500文字まで表示されています。
      </Text>

      <Text
        style={{
          margin: "24px 0 0 0",
          fontSize: "12px",
          lineHeight: "18px",
          color: "#94a3b8",
          textAlign: "center",
        }}
      >
        このメールは自動送信されています。返信が必要な場合は上記のメールアドレス宛にご連絡ください。
      </Text>
    </EmailLayout>
  );
};

export default AdminContactNotice;
