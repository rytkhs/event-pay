import * as React from "react";

import { Button as ReactEmailButton } from "@react-email/components";

interface ButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

export const Button = ({ href, children, variant = "primary" }: ButtonProps) => {
  const isPrimary = variant === "primary";

  return (
    <ReactEmailButton
      href={href}
      style={{
        backgroundColor: isPrimary ? "#2563eb" : "#f3f4f6",
        color: isPrimary ? "#ffffff" : "#1f2937",
        padding: "12px 24px",
        borderRadius: "6px",
        textDecoration: "none",
        fontWeight: "600",
        display: "inline-block",
        fontSize: "14px",
        lineHeight: "20px",
        textAlign: "center",
      }}
    >
      {children}
    </ReactEmailButton>
  );
};
