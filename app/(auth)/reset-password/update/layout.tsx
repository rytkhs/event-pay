import type { ReactNode } from "react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "新しいパスワードの設定",
  description: "新しいパスワードを設定します",
};

export default function UpdatePasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
