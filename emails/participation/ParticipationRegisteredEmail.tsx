import * as React from "react";

import { Heading, Text } from "@react-email/components";

import { Button } from "../_components/Button";
import { Divider } from "../_components/Divider";
import { InfoCard } from "../_components/InfoCard";
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

  const statusVariant =
    attendanceStatus === "attending"
      ? "success"
      : attendanceStatus === "not_attending"
        ? "danger"
        : "warning";

  return (
    <EmailLayout preheader="イベント参加登録が完了しました">
      <Text
        style={{
          margin: "0 0 8px 0",
          fontSize: "28px",
          lineHeight: "36px",
          fontWeight: "700",
          color: "#1e293b",
        }}
      >
        {getStatusEmoji(attendanceStatus)} 参加登録完了
      </Text>

      <Text
        style={{
          margin: "0 0 32px 0",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#64748b",
        }}
      >
        {nickname} 様
      </Text>

      <Text
        style={{
          margin: "0 0 24px 0",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#475569",
        }}
      >
        イベントへの参加登録が完了しました。
      </Text>

      <Section variant={statusVariant}>
        <Heading
          as="h2"
          style={{
            fontSize: "20px",
            lineHeight: "28px",
            margin: "0 0 16px 0",
            color: "#1e293b",
            fontWeight: "600",
          }}
        >
          📅 イベント情報
        </Heading>
        <InfoCard label="イベント名" value={eventTitle} icon="🎉" />
        <InfoCard label="開催日時" value={formattedDate} icon="📆" />
        <InfoCard
          label="参加状況"
          value={`${getStatusEmoji(attendanceStatus)} ${getStatusText(attendanceStatus)}`}
          icon="👤"
        />
      </Section>

      <Divider />

      <Text
        style={{
          margin: "0 0 20px 0",
          fontSize: "16px",
          lineHeight: "24px",
          color: "#475569",
          textAlign: "center",
        }}
      >
        以下のボタンから、いつでも参加状況の確認や変更ができます。
      </Text>

      <Button href={guestUrl}>参加状況を確認する</Button>

      <div
        style={{
          backgroundColor: "#fef3c7",
          borderRadius: "8px",
          padding: "16px",
          border: "1px solid #fbbf24",
          margin: "24px 0 0 0",
        }}
      >
        <Text
          style={{
            margin: 0,
            fontSize: "14px",
            lineHeight: "20px",
            color: "#92400e",
            textAlign: "center",
          }}
        >
          🔒 このリンクは個人用です。他の人と共有しないでください。
        </Text>
      </div>

      <Text
        style={{
          margin: "24px 0 0 0",
          fontSize: "14px",
          lineHeight: "20px",
          color: "#64748b",
          textAlign: "center",
        }}
      >
        ご不明な点がございましたら、主催者にお問い合わせください。
      </Text>
    </EmailLayout>
  );
};

export default ParticipationRegisteredEmail;
