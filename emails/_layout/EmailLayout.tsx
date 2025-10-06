import * as React from "react";

import { Body, Container, Head, Html, Preview, Text } from "@react-email/components";
import { Tailwind } from "@react-email/tailwind";

import { Divider } from "../_components/Divider";

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
              'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
            backgroundColor: "#ffffff",
            margin: 0,
            padding: 0,
          }}
        >
          <Container
            style={{
              maxWidth: "600px",
              margin: "0 auto",
              padding: "20px",
            }}
          >
            {children}

            <Divider />
            <Text
              style={{
                color: "#6b7280",
                fontSize: "14px",
                lineHeight: "20px",
                margin: 0,
              }}
            >
              みんなの集金
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
};
