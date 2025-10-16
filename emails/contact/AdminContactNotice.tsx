import * as React from "react";

import { Heading, Text } from "@react-email/components";
import { format } from "date-fns";
import { toZonedTime } from "date-fns-tz";

import { Divider } from "../_components/Divider";
import { Section } from "../_components/Section";
import { EmailLayout } from "../_layout/EmailLayout";

export interface AdminContactNoticeProps {
  name: string;
  email: string;
  messageExcerpt: string;
  receivedAt: Date;
}

export const AdminContactNotice = ({
  name,
  email,
  messageExcerpt,
  receivedAt,
}: AdminContactNoticeProps) => {
  // JST変換
  const jstDate = toZonedTime(receivedAt, "Asia/Tokyo");
  const formattedDate = format(jstDate, "yyyy年MM月dd日 HH:mm (JST)");

  return (
    <EmailLayout preheader="新しいお問い合わせが届きました">
      <Text
        style={{
          margin: "0 0 8px 0",
          fontSize: "28px",
          lineHeight: "36px",
          fontWeight: "700",
          color: "#1e293b",
        }}
      >
        📬 新しいお問い合わせ
      </Text>

      <Text
        style={{
          margin: "0 0 24px 0",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#64748b",
        }}
      >
        みんなの集金に新しいお問い合わせが届きました。
      </Text>

      <Section variant="info">
        <Heading
          as="h2"
          style={{
            fontSize: "18px",
            lineHeight: "28px",
            margin: "0 0 16px 0",
            color: "#1e3a8a",
            fontWeight: "600",
          }}
        >
          📋 お問い合わせ内容
        </Heading>

        <div style={{ marginBottom: "12px" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "14px",
              lineHeight: "20px",
              fontWeight: "600",
              color: "#334155",
            }}
          >
            氏名
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: "16px",
              lineHeight: "24px",
              color: "#1e293b",
            }}
          >
            {name}
          </Text>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "14px",
              lineHeight: "20px",
              fontWeight: "600",
              color: "#334155",
            }}
          >
            メールアドレス
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: "16px",
              lineHeight: "24px",
              color: "#1e293b",
            }}
          >
            {email}
          </Text>
        </div>

        <div style={{ marginBottom: "12px" }}>
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "14px",
              lineHeight: "20px",
              fontWeight: "600",
              color: "#334155",
            }}
          >
            受信日時
          </Text>
          <Text
            style={{
              margin: 0,
              fontSize: "16px",
              lineHeight: "24px",
              color: "#1e293b",
            }}
          >
            {formattedDate}
          </Text>
        </div>
      </Section>

      <Divider />

      <Heading
        as="h3"
        style={{
          fontSize: "18px",
          lineHeight: "28px",
          margin: "0 0 12px 0",
          color: "#1e293b",
          fontWeight: "600",
        }}
      >
        💬 お問い合わせ本文
      </Heading>

      <div
        style={{
          backgroundColor: "#f8fafc",
          borderRadius: "8px",
          padding: "16px",
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
          margin: "24px 0 0 0",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#64748b",
        }}
      >
        ※ 本文は最大500文字まで表示されています。
      </Text>

      <Text
        style={{
          margin: "32px 0 0 0",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#64748b",
          textAlign: "center",
        }}
      >
        このメールは自動送信されています。返信が必要な場合は、上記のメールアドレスに直接ご連絡ください。
      </Text>
    </EmailLayout>
  );
};

export default AdminContactNotice;
