import type { ReactNode } from "react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "パスワードリセット",
  description: "登録済みメールアドレスにパスワードリセット用の確認コードを送信します",
};

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
