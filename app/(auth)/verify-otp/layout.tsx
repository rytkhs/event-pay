import type { ReactNode } from "react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "認証コード確認",
  description: "メールで受け取った認証コードを確認します",
};

export default function VerifyOtpLayout({ children }: { children: ReactNode }) {
  return children;
}
