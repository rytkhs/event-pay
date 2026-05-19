import type { ReactNode } from "react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ログイン",
  description: "みんなの集金にログインします",
};

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
