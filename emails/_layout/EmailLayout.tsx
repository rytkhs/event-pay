import "server-only";
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

interface EmailLayoutProps {
  preheader?: string;
  children: React.ReactNode;
}

export const EmailLayout = ({ preheader, children }: EmailLayoutProps) => {
  const year = new Date().getFullYear();

  return (
    <Html lang="ja">
      <Head>
        {/* Dark Mode 基本対応 */}
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
      </Head>

      {preheader && <Preview>{preheader}</Preview>}

      <Body
        style={{
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif',
          backgroundColor: "#f8fafc",
          margin: 0,
          padding: 0,
        }}
      >
        {/* スペーサー（外側余白） */}
        <div style={{ height: "32px" }} />

        <Container
          style={{
            width: "100%",
            maxWidth: "600px",
            margin: "0 auto",
            backgroundColor: "#ffffff",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
            overflow: "hidden",
          }}
        >
          {/* ヘッダー */}
          <Section
            style={{
              padding: "24px 24px 0 24px",
              textAlign: "center",
            }}
          >
            <Heading
              as="h2"
              style={{
                color: "#24A6B5",
                fontSize: "20px",
                fontWeight: 600,
                margin: 0,
                letterSpacing: "0.2px",
              }}
            >
              みんなの集金
            </Heading>
          </Section>

          {/* メインコンテンツ */}
          <Section style={{ padding: "24px" }}>{children}</Section>

          {/* フッター（実用リンクを集約） */}
          <Section
            style={{
              backgroundColor: "#f9fafb",
              padding: "20px 24px",
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <Text
              style={{
                color: "#6b7280",
                fontSize: "13px",
                lineHeight: "20px",
                margin: 0,
                textAlign: "center",
              }}
            >
              © {year} みんなの集金
            </Text>
          </Section>
        </Container>

        {/* スペーサー（外側余白） */}
        <div style={{ height: "32px" }} />
      </Body>
    </Html>
  );
};
