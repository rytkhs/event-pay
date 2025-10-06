import * as React from "react";

import { Heading, Text } from "@react-email/components";

import { EmailLayout } from "../_layout/EmailLayout";

export interface AdminAlertEmailProps {
  subject: string;
  message: string;
  details?: Record<string, any>;
}

export const AdminAlertEmail = ({ subject, message, details }: AdminAlertEmailProps) => {
  return (
    <EmailLayout preheader={`[EventPay Alert] ${subject}`}>
      <Heading
        style={{
          color: "#dc2626",
          fontSize: "24px",
          lineHeight: "32px",
          margin: "0 0 20px 0",
        }}
      >
        [EventPay Alert] {subject}
      </Heading>

      <Text
        style={{
          margin: "0 0 16px 0",
          fontSize: "16px",
          lineHeight: "24px",
          whiteSpace: "pre-wrap",
        }}
      >
        {message}
      </Text>

      {details && (
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
            詳細情報:
          </Heading>
          <pre
            style={{
              backgroundColor: "#f3f4f6",
              padding: "16px",
              borderRadius: "6px",
              fontSize: "14px",
              lineHeight: "20px",
              overflow: "auto",
              fontFamily: "monospace",
            }}
          >
            {JSON.stringify(details, null, 2)}
          </pre>
        </>
      )}
    </EmailLayout>
  );
};

export default AdminAlertEmail;
