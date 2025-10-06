import * as React from "react";

import { Section as ReactEmailSection } from "@react-email/components";

interface SectionProps {
  children: React.ReactNode;
  variant?: "default" | "info" | "warning" | "success" | "danger";
}

export const Section = ({ children, variant = "default" }: SectionProps) => {
  const variantStyles = {
    default: {
      backgroundColor: "#f9fafb",
      borderColor: "#d1d5db",
    },
    info: {
      backgroundColor: "#f0f9ff",
      borderColor: "#0ea5e9",
    },
    warning: {
      backgroundColor: "#fffbeb",
      borderColor: "#f59e0b",
    },
    success: {
      backgroundColor: "#f0fdf4",
      borderColor: "#22c55e",
    },
    danger: {
      backgroundColor: "#fef2f2",
      borderColor: "#f87171",
    },
  };

  const style = variantStyles[variant];

  return (
    <ReactEmailSection
      style={{
        backgroundColor: style.backgroundColor,
        border: `1px solid ${style.borderColor}`,
        borderRadius: "8px",
        padding: "16px",
        margin: "20px 0",
      }}
    >
      {children}
    </ReactEmailSection>
  );
};
