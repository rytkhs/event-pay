import type { JSX } from "react";

import Link from "next/link";

import { cn } from "@core/utils";

import { footerConfig } from "./navigation-config";

/**
 * フッターブランディングコンポーネント
 *
 * ブランドロゴと名前を表示します
 */
export function FooterBranding({ className }: { className?: string }): JSX.Element {
  return (
    <div className={cn("flex flex-col items-center md:items-start", className)}>
      <div className="footer-logo">
        <Link
          href="/"
          className={cn(
            "font-bold text-foreground transition-colors duration-200",
            "text-lg md:text-xl",
            "hover:text-primary"
          )}
          aria-label="みんなの集金ホームページへ"
        >
          {footerConfig.brand.name}
        </Link>
      </div>
    </div>
  );
}
