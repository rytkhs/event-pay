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
    <div className={cn("flex flex-col items-center md:items-start gap-2", className)}>
      <div className="footer-logo">
        <Link
          href="/"
          className={cn(
            "font-bold text-foreground transition-all duration-300",
            "text-xl md:text-2xl",
            "hover:text-primary hover:tracking-tight",
            "bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70"
          )}
          aria-label="みんなの集金トップページへ"
        >
          {footerConfig.brand.name}
        </Link>
      </div>
      {footerConfig.brand.tagline && (
        <p className="text-sm text-muted-foreground font-medium max-w-[240px] leading-relaxed">
          {footerConfig.brand.tagline}
        </p>
      )}
    </div>
  );
}
