import type { ReactNode } from "react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "アカウント作成",
  description: "みんなの集金のアカウントを作成します",
};

export default function RegisterLayout({ children }: { children: ReactNode }) {
  return children;
}
