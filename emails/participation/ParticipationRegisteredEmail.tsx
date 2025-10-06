import * as React from "react";

import { Heading, Text } from "@react-email/components";

import { Button } from "../_components/Button";
import { Section } from "../_components/Section";
import { EmailLayout } from "../_layout/EmailLayout";

export interface ParticipationRegisteredEmailProps {
  nickname: string;
  eventTitle: string;
  eventDate: string;
  attendanceStatus: "attending" | "maybe" | "not_attending";
  guestUrl: string;
}

const getStatusText = (status: "attending" | "maybe" | "not_attending"): string => {
  switch (status) {
    case "attending":
      return "参加する";
    case "maybe":
      return "検討中";
    case "not_attending":
      return "欠席";
  }
};

const getStatusEmoji = (status: "attending" | "maybe" | "not_attending"): string => {
  switch (status) {
    case "attending":
      return "✅";
    case "maybe":
      return "🤔";
    case "not_attending":
      return "❌";
  }
};

export const ParticipationRegisteredEmail = ({
  nickname,
  eventTitle,
  eventDate,
  attendanceStatus,
  guestUrl,
}: ParticipationRegisteredEmailProps) => {
  const formattedDate = new Date(eventDate).toLocaleString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
  });

  return (
    <EmailLayout preheader="イベント参加登録が完了しました">
      <Heading
        style={{
          color: "#2563eb",
          fontSize: "24px",
          lineHeight: "32px",
          margin: "0 0 20px 0",
        }}
      >
        参加登録完了
      </Heading>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        {nickname} 様
      </Text>

      <Text style={{ margin: "0 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        みんなの集金をご利用いただき、ありがとうございます。
        <br />
        イベントへの参加登録が完了しました。
      </Text>

      <Section variant="info">
        <Text
          style={{
            margin: "0 0 8px 0",
            fontWeight: "bold",
            fontSize: "18px",
            lineHeight: "24px",
            color: "#1e40af",
          }}
        >
          {eventTitle}
        </Text>
        <Text
          style={{
            margin: "0 0 8px 0",
            fontSize: "16px",
            lineHeight: "24px",
          }}
        >
          📅 {formattedDate}
        </Text>
        <Text
          style={{
            margin: 0,
            fontSize: "16px",
            lineHeight: "24px",
            fontWeight: "bold",
          }}
        >
          {getStatusEmoji(attendanceStatus)} 回答: {getStatusText(attendanceStatus)}
        </Text>
      </Section>

      <Text style={{ margin: "20px 0 16px 0", fontSize: "16px", lineHeight: "24px" }}>
        以下のURLから、いつでも参加状況の確認や変更ができます。
      </Text>

      <Button href={guestUrl}>参加状況を確認する</Button>

      <Text
        style={{
          margin: "20px 0 0 0",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#6b7280",
        }}
      >
        このリンクは他の人と共有しないでください。
        <br />
        ご不明な点がございましたら、主催者にお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default ParticipationRegisteredEmail;
