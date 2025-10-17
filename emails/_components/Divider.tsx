import * as React from "react";

import { Hr } from "@react-email/components";

export const Divider = () => {
  return (
    <Hr
      style={{
        border: "none",
        borderTop: "2px solid #e5e7eb",
        margin: "32px 0",
        opacity: 0.6,
      }}
    />
  );
};
