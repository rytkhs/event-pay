import * as React from "react";

import { Heading, Text, Link } from "@react-email/components";

import { Button } from "../_components/Button";
import { Section } from "../_components/Section";
import { EmailLayout } from "../_layout/EmailLayout";

export interface EventStartReminderEmailProps {
  nickname: string;
  eventTitle: string;
  eventDate: string;
  eventLocation: string | null;
  eventDescription: string | null;
  participationFee: number;
  paymentStatus: "paid" | "cash" | "unpaid";
  guestUrl: string;
}

export const EventStartReminderEmail = ({
  nickname,
  eventTitle,
  eventDate,
  eventLocation,
  eventDescription,
  participationFee,
  paymentStatus,
  guestUrl,
}: EventStartReminderEmailProps) => {
  return (
    <EmailLayout preheader={`${eventTitle}の開催が明日に迫っています。`}>
      <Heading
        style={{
          color: "#1f2937",
          fontSize: "24px",
          lineHeight: "32px",
          margin: "0 0 20px 0",
        }}
      >
        イベント開催のリマインダー
      </Heading>

      <Text
        style={{
          margin: "0 0 16px 0",
          fontSize: "16px",
          lineHeight: "24px",
        }}
      >
        {nickname} 様
      </Text>

      <Section variant="info">
        <Text
          style={{
            margin: "0 0 12px 0",
            fontSize: "16px",
            lineHeight: "24px",
            fontWeight: "600",
          }}
        >
          🎉 イベント開催が明日に迫っています！
        </Text>
        <Text
          style={{
            margin: "0",
            fontSize: "14px",
            lineHeight: "20px",
          }}
        >
          ご参加を心よりお待ちしております。
        </Text>
      </Section>

      <Section variant="default">
        <Heading
          as="h3"
          style={{
            fontSize: "18px",
            lineHeight: "28px",
            margin: "0 0 12px 0",
            color: "#1f2937",
          }}
        >
          📅 イベント詳細
        </Heading>
        <Text
          style={{
            margin: "0 0 8px 0",
            fontSize: "16px",
            lineHeight: "24px",
            fontWeight: "600",
          }}
        >
          {eventTitle}
        </Text>
        <Text
          style={{
            margin: "0 0 4px 0",
            fontSize: "14px",
            lineHeight: "20px",
            color: "#6b7280",
          }}
        >
          📅 日時: {eventDate}
        </Text>
        {eventLocation && (
          <Text
            style={{
              margin: "0 0 4px 0",
              fontSize: "14px",
              lineHeight: "20px",
              color: "#6b7280",
            }}
          >
            📍 場所: {eventLocation}
          </Text>
        )}
        {eventDescription && (
          <Text
            style={{
              margin: "12px 0 0 0",
              fontSize: "14px",
              lineHeight: "20px",
              color: "#4b5563",
              whiteSpace: "pre-wrap",
            }}
          >
            {eventDescription}
          </Text>
        )}
      </Section>

      <Section
        variant={
          paymentStatus === "paid" ? "success" : paymentStatus === "cash" ? "warning" : "danger"
        }
      >
        <Heading
          as="h3"
          style={{
            fontSize: "16px",
            lineHeight: "24px",
            margin: "0 0 8px 0",
            color: "#1f2937",
          }}
        >
          💳 決済ステータス
        </Heading>
        {paymentStatus === "paid" && (
          <Text
            style={{
              margin: "0",
              fontSize: "14px",
              lineHeight: "20px",
            }}
          >
            ✅ オンライン決済完了済み
            <br />
            参加費のお支払いは完了しています。
          </Text>
        )}
        {paymentStatus === "cash" && (
          <Text
            style={{
              margin: "0",
              fontSize: "14px",
              lineHeight: "20px",
            }}
          >
            💴 現金でお支払いください
            <br />
            参加費: ¥{participationFee.toLocaleString()}
          </Text>
        )}
        {paymentStatus === "unpaid" && (
          <>
            <Text
              style={{
                margin: "0 0 8px 0",
                fontSize: "14px",
                lineHeight: "20px",
              }}
            >
              ⚠️ 決済が完了していません
              <br />
              参加費: ¥{participationFee.toLocaleString()}
            </Text>
            <Text
              style={{
                margin: "0",
                fontSize: "14px",
                lineHeight: "20px",
              }}
            >
              <Link
                href={guestUrl}
                style={{
                  color: "#667eea",
                  textDecoration: "underline",
                  fontWeight: "600",
                }}
              >
                こちらから決済を完了する
              </Link>
            </Text>
          </>
        )}
      </Section>

      <Text
        style={{
          margin: "20px 0 16px 0",
          fontSize: "16px",
          lineHeight: "24px",
        }}
      >
        イベントの詳細を確認できます。
      </Text>

      <Button href={guestUrl} variant="primary" fullWidth>
        イベント詳細を確認する
      </Button>

      <Text
        style={{
          margin: "16px 0 0 0",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#6b7280",
        }}
      >
        ボタンが機能しない場合は、以下のURLをブラウザにコピーしてください:
        <br />
        <Link
          href={guestUrl}
          style={{
            color: "#667eea",
            textDecoration: "underline",
            wordBreak: "break-all",
          }}
        >
          {guestUrl}
        </Link>
      </Text>

      <Text
        style={{
          margin: "24px 0 0 0",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#6b7280",
          textAlign: "center",
        }}
      >
        当日お会いできることを楽しみにしています！
      </Text>
    </EmailLayout>
  );
};

export default EventStartReminderEmail;
