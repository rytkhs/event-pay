import type { JSX } from "react";

import Link from "next/link";

import { MessageSquare } from "lucide-react";

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
          <h3 className="font-bold text-foreground text-xs tracking-[0.15em]">{group.title}</h3>
          <ul className="flex flex-col gap-3.5">
            {group.links.map((link) => {
              const linkStyles = cn(
                "text-sm relative group w-fit flex items-center gap-1.5 transition-all duration-300",
                link.featured
                  ? "text-primary font-semibold hover:text-primary/80"
                  : "text-muted-foreground hover:text-primary",
                "focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-sm"
              );

              return (
                <li key={link.href}>
                  {link.external ? (
                    <a
                      href={link.href}
                      className={linkStyles}
                      aria-label={link.ariaLabel}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <span className="relative flex items-center gap-1.5">
                        {link.featured && <MessageSquare className="w-3.5 h-3.5" />}
                        {link.label}
                        <span
                          className={cn(
                            "absolute -bottom-1 left-0 w-0 h-[1.5px] transition-all duration-300 group-hover:w-full",
                            link.featured ? "bg-primary/40" : "bg-primary/60"
                          )}
                        />
                      </span>
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      prefetch={false}
                      className={linkStyles}
                      aria-label={link.ariaLabel}
                    >
                      <span className="relative flex items-center gap-1.5">
                        {link.featured && <MessageSquare className="w-3.5 h-3.5" />}
                        {link.label}
                        <span
                          className={cn(
                            "absolute -bottom-1 left-0 w-0 h-[1.5px] transition-all duration-300 group-hover:w-full",
                            link.featured ? "bg-primary/40" : "bg-primary/60"
                          )}
                        />
                      </span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
