import type { ReactNode } from "react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "メール確認",
  description: "登録メールアドレスの確認を行います",
};

export default function VerifyEmailLayout({ children }: { children: ReactNode }) {
  return children;
}
