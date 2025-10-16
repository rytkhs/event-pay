import * as React from "react";

interface StatusBadgeProps {
  status: "enabled" | "disabled";
  label: string;
}

export const StatusBadge = ({ status, label }: StatusBadgeProps) => {
  const styles = {
    enabled: {
      backgroundColor: "#dcfce7",
      color: "#166534",
      borderColor: "#86efac",
    },
    disabled: {
      backgroundColor: "#fee2e2",
      color: "#991b1b",
      borderColor: "#fca5a5",
    },
  };

  const style = styles[status];

  return (
    <span
      style={{
        backgroundColor: style.backgroundColor,
        color: style.color,
        border: `1px solid ${style.borderColor}`,
        padding: "4px 12px",
        borderRadius: "12px",
        fontSize: "14px",
        fontWeight: "600",
        display: "inline-block",
        lineHeight: "20px",
      }}
    >
      {label}
    </span>
  );
};
