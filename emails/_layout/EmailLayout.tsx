import * as React from "react";

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import { Tailwind } from "@react-email/tailwind";

interface EmailLayoutProps {
  preheader?: string;
  children: React.ReactNode;
}

export const EmailLayout = ({ preheader, children }: EmailLayoutProps) => {
  return (
    <Html lang="ja">
      <Head />
      {preheader && <Preview>{preheader}</Preview>}
      <Tailwind>
        <Body
          style={{
            fontFamily:
              '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif',
            backgroundColor: "#f8fafc",
            margin: 0,
            padding: 0,
          }}
        >
          {/* スペーサー */}
          <div style={{ height: "40px" }} />

          <Container
            style={{
              maxWidth: "600px",
              margin: "0 auto",
              backgroundColor: "#ffffff",
              borderRadius: "16px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
              overflow: "hidden",
            }}
          >
            {/* ヘッダー */}
            <Section
              style={{
                background: "#24A6B5",
                padding: "32px 40px",
                textAlign: "center",
              }}
            >
              <Heading
                style={{
                  color: "#ffffff",
                  fontSize: "28px",
                  fontWeight: "700",
                  margin: 0,
                  letterSpacing: "0.5px",
                }}
              >
                みんなの集金
              </Heading>
            </Section>

            {/* メインコンテンツ */}
            <Section style={{ padding: "40px" }}>{children}</Section>

            {/* フッター */}
            <Section
              style={{
                backgroundColor: "#f9fafb",
                padding: "32px 40px",
                borderTop: "1px solid #e5e7eb",
              }}
            >
              <Text
                style={{
                  color: "#6b7280",
                  fontSize: "14px",
                  lineHeight: "20px",
                  margin: "0 0 12px 0",
                  textAlign: "center",
                }}
              >
                © 2025 みんなの集金 - イベント出欠管理・集金ツール
              </Text>
              <Text
                style={{
                  color: "#9ca3af",
                  fontSize: "12px",
                  lineHeight: "16px",
                  margin: 0,
                  textAlign: "center",
                }}
              >
                このメールに心当たりがない場合は、破棄していただいて構いません。
              </Text>
            </Section>
          </Container>

          {/* スペーサー */}
          <div style={{ height: "40px" }} />
        </Body>
      </Tailwind>
    </Html>
  );
};
