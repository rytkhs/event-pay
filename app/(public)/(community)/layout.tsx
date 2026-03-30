import type { JSX, ReactNode } from "react";

/**
 * 動的 segment ごとの layout で community を解決するため、
 * ここでは共通の route group だけを提供します。
 */
export default function CommunityLayout({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>;
}
