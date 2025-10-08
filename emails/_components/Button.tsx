import * as React from "react";

import { Button as ReactEmailButton } from "@react-email/components";

interface ButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
}

export const Button = ({ href, children, variant = "primary", fullWidth = false }: ButtonProps) => {
  const isPrimary = variant === "primary";

  const baseStyles = {
    backgroundColor: isPrimary ? "#24A6B5" : "#ffffff",
    color: isPrimary ? "#ffffff" : "#24A6B5",
    padding: "14px 32px",
    borderRadius: "8px",
    textDecoration: "none",
    fontWeight: "600",
    display: fullWidth ? "block" : "inline-block",
    fontSize: "16px",
    lineHeight: "24px",
    textAlign: "center" as const,
    border: isPrimary ? "none" : "2px solid #24A6B5",
    transition: "all 0.2s ease",
  };

  return (
    <div style={{ textAlign: "center", margin: "24px 0" }}>
      <ReactEmailButton href={href} style={baseStyles}>
        {children}
      </ReactEmailButton>
    </div>
  );
};
