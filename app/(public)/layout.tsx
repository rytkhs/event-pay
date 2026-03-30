import type { ReactNode, JSX } from "react";

export default function PublicLayout({ children }: { children: ReactNode }): JSX.Element {
  return <>{children}</>;
}
