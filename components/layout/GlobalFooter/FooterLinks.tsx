import type { JSX } from "react";

import Link from "next/link";

import { cn } from "@core/utils";

import { FooterLinkGroup } from "./types";

/**
 * フッターリンク群コンポーネント
 *
 * フッターナビゲーションリンクをグループごとに表示します
 */
export function FooterLinks({
  groups,
  className,
}: {
  groups: FooterLinkGroup[];
  className?: string;
}): JSX.Element {
  if (groups.length === 0) {
    return <div className={className} />;
  }

  const linkBaseStyles = cn(
    "text-muted-foreground hover:text-primary transition-all duration-300",
    "text-sm relative group w-fit flex items-center gap-1",
    "focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-sm"
  );

  const containerStyles = cn(
    "grid gap-x-8 gap-y-10",
    "grid-cols-2", // デフォルトで2列（非常に小さい画面でも2列維持）
    groups.length >= 3 ? "sm:grid-cols-3" : "",
    "md:flex md:gap-16 md:justify-end", // デスクトップでは右寄せのFlex
    className
  );

  return (
    <nav className={containerStyles} role="navigation" aria-label="フッターナビゲーション">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-5 min-w-[120px]">
          <h3 className="font-bold text-foreground text-xs uppercase tracking-[0.15em]">
            {group.title}
          </h3>
          <ul className="flex flex-col gap-3.5">
            {group.links.map((link) => (
              <li key={link.href}>
                {link.external ? (
                  <a
                    href={link.href}
                    className={linkBaseStyles}
                    aria-label={link.ariaLabel}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="relative">
                      {link.label}
                      <span className="absolute -bottom-1 left-0 w-0 h-[1.5px] bg-primary/60 transition-all duration-300 group-hover:w-full" />
                    </span>
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    prefetch={false}
                    className={linkBaseStyles}
                    aria-label={link.ariaLabel}
                  >
                    <span className="relative">
                      {link.label}
                      <span className="absolute -bottom-1 left-0 w-0 h-[1.5px] bg-primary/60 transition-all duration-300 group-hover:w-full" />
                    </span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
