import * as React from "react";

import { Text } from "@react-email/components";

interface InfoCardProps {
  label: string;
  value: string;
  icon?: string;
}

export const InfoCard = ({ label, value, icon }: InfoCardProps) => {
  return (
    <div
      style={{
        backgroundColor: "#f8fafc",
        borderRadius: "8px",
        padding: "16px 20px",
        margin: "12px 0",
        border: "1px solid #e2e8f0",
      }}
    >
      <Text
        style={{
          margin: "0 0 4px 0",
          fontSize: "13px",
          lineHeight: "18px",
          color: "#64748b",
          fontWeight: "500",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
        }}
      >
        {icon && `${icon} `}
        {label}
      </Text>
      <Text
        style={{
          margin: 0,
          fontSize: "16px",
          lineHeight: "24px",
          color: "#1e293b",
          fontWeight: "600",
        }}
      >
        {value}
      </Text>
    </div>
  );
};
