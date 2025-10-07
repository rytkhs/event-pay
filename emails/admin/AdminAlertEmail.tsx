import * as React from "react";

import { Heading, Text } from "@react-email/components";

import { Divider } from "../_components/Divider";
import { Section } from "../_components/Section";
import { EmailLayout } from "../_layout/EmailLayout";

export interface AdminAlertEmailProps {
  subject: string;
  message: string;
  details?: Record<string, any>;
}

export const AdminAlertEmail = ({ subject, message, details }: AdminAlertEmailProps) => {
  return (
    <EmailLayout preheader={`[EventPay Alert] ${subject}`}>
      <Text
        style={{
          margin: "0 0 8px 0",
          fontSize: "28px",
          lineHeight: "36px",
          fontWeight: "700",
          color: "#1e293b",
        }}
      >
        🚨 システムアラート
      </Text>

      <Section variant="danger">
        <Heading
          as="h2"
          style={{
            fontSize: "20px",
            lineHeight: "28px",
            margin: "0 0 12px 0",
            color: "#991b1b",
            fontWeight: "600",
          }}
        >
          {subject}
        </Heading>
        <Text
          style={{
            margin: 0,
            fontSize: "16px",
            lineHeight: "24px",
            whiteSpace: "pre-wrap",
            color: "#7f1d1d",
          }}
        >
          {message}
        </Text>
      </Section>

      {details && (
        <>
          <Divider />
          <Heading
            as="h3"
            style={{
              fontSize: "18px",
              lineHeight: "28px",
              margin: "0 0 16px 0",
              color: "#1e293b",
              fontWeight: "600",
            }}
          >
            📊 詳細情報
          </Heading>
          <div
            style={{
              backgroundColor: "#1e293b",
              borderRadius: "12px",
              padding: "20px",
              border: "2px solid #334155",
            }}
          >
            <pre
              style={{
                margin: 0,
                fontSize: "13px",
                lineHeight: "20px",
                overflow: "auto",
                fontFamily:
                  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                color: "#e2e8f0",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
              }}
            >
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
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
        このメールは自動送信されています。
      </Text>
    </EmailLayout>
  );
};

export default AdminAlertEmail;
