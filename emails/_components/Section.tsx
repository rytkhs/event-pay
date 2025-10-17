import * as React from "react";

import { Section as ReactEmailSection } from "@react-email/components";

interface SectionProps {
  children: React.ReactNode;
  variant?: "default" | "info" | "warning" | "success" | "danger";
}

export const Section = ({ children, variant = "default" }: SectionProps) => {
  const variantStyles = {
    default: {
      backgroundColor: "#f8fafc",
      borderColor: "#e2e8f0",
      iconColor: "#64748b",
    },
    info: {
      backgroundColor: "#eff6ff",
      borderColor: "#93c5fd",
      iconColor: "#3b82f6",
    },
    warning: {
      backgroundColor: "#fefce8",
      borderColor: "#fde047",
      iconColor: "#eab308",
    },
    success: {
      backgroundColor: "#f0fdf4",
      borderColor: "#86efac",
      iconColor: "#22c55e",
    },
    danger: {
      backgroundColor: "#fef2f2",
      borderColor: "#fca5a5",
      iconColor: "#ef4444",
    },
  };

  const style = variantStyles[variant];

  return (
    <ReactEmailSection
      style={{
        backgroundColor: style.backgroundColor,
        border: `2px solid ${style.borderColor}`,
        borderLeft: `6px solid ${style.iconColor}`,
        borderRadius: "12px",
        padding: "20px 24px",
        margin: "24px 0",
      }}
    >
      {children}
    </ReactEmailSection>
  );
};
