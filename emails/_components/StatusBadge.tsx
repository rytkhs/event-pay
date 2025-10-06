import * as React from "react";

import { Text } from "@react-email/components";

interface StatusBadgeProps {
  status: "enabled" | "disabled";
  label: string;
}

export const StatusBadge = ({ status, label }: StatusBadgeProps) => {
  const color = status === "enabled" ? "#059669" : "#dc2626";

  return (
    <Text
      style={{
        color,
        margin: 0,
        fontSize: "14px",
        lineHeight: "20px",
      }}
    >
      {label}
    </Text>
  );
};
