import * as React from "react";

import { Heading, Text, Hr } from "@react-email/components";

import { EmailLayout } from "../_layout/EmailLayout";

export interface AdminAlertEmailProps {
  subject: string;
  message: string;
  details?: Record<string, any>;
}

export const AdminAlertEmail = ({ subject, message, details }: AdminAlertEmailProps) => {
  // 値を安全に文字列化
  const toDisplay = (v: any) => {
    if (v === null || v === undefined) return "-";
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };

  return (
    <EmailLayout preheader={`[EventPay Alert] ${subject}`}>
      {/* タイトル */}
      <Heading
        as="h1"
        style={{
          margin: "0 0 16px 0",
          fontSize: "22px",
          lineHeight: "30px",
          fontWeight: 600,
          color: "#0f172a",
        }}
      >
        システムアラート
      </Heading>

      {/* 警告ブロック（簡素・高コントラスト） */}
      <div
        style={{
          backgroundColor: "#fef2f2",
          borderLeft: "4px solid #ef4444",
          padding: "14px 16px",
          borderRadius: 4,
          margin: "0 0 24px 0",
        }}
      >
        <Heading
          as="h2"
          style={{
            margin: "0 0 8px 0",
            fontSize: "18px",
            lineHeight: "24px",
            color: "#7f1d1d",
            fontWeight: 600,
          }}
        >
          {subject}
        </Heading>
        <Text
          style={{
            margin: 0,
            fontSize: "14px",
            lineHeight: "20px",
            color: "#7f1d1d",
            whiteSpace: "pre-wrap",
          }}
        >
          {message}
        </Text>
      </div>

      {/* 詳細情報 */}
      {details && (
        <>
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
            詳細情報
          </Heading>

          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: 8,
              overflow: "hidden",
              marginBottom: 24,
            }}
          >
            {Object.entries(details).map(([k, v], idx) => (
              <div
                key={k + idx}
                style={{
                  padding: "12px 14px",
                  borderBottom: "1px solid #e2e8f0",
                  backgroundColor: idx % 2 === 0 ? "#ffffff" : "#f8fafc",
                }}
              >
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
                  {k}
                </Text>
                {typeof v === "object" && v !== null ? (
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "12px",
                      lineHeight: "18px",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily:
                        'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
                      color: "#0f172a",
                    }}
                  >
                    {toDisplay(v)}
                  </pre>
                ) : (
                  <Text
                    style={{
                      margin: 0,
                      fontSize: "14px",
                      lineHeight: "20px",
                      color: "#0f172a",
                      wordBreak: "break-word",
                    }}
                  >
                    {toDisplay(v)}
                  </Text>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Hr style={{ borderColor: "#e2e8f0", margin: "16px 0" }} />

      <Text
        style={{
          margin: 0,
          fontSize: "12px",
          lineHeight: "18px",
          color: "#94a3b8",
          textAlign: "center",
        }}
      >
        このメールは自動送信されています。
      </Text>
    </EmailLayout>
  );
};

export default AdminAlertEmail;
