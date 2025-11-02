import type { Metadata } from "next";

export const metadata: Metadata = {
  alternates: {
    canonical: "./",
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return <>{children}</>;
}
