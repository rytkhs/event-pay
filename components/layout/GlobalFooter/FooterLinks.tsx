import Link from "next/link";

import { cn } from "@core/utils";

import { FooterLink } from "./types";

/**
 * フッターリンク群コンポーネント
 *
 * フッターナビゲーションリンクを表示します
 */
export function FooterLinks({
  links,
  className,
}: {
  links: FooterLink[];
  className?: string;
}): JSX.Element {
  if (links.length === 0) {
    return <div className={className} />;
  }

  const linkBaseStyles = cn(
    "text-muted-foreground hover:text-foreground hover:text-primary",
    "transition-colors duration-200",
    "text-xs",
    "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background",
    "rounded-sm px-1 py-0",
    "md:whitespace-nowrap"
  );

  const containerStyles = cn("flex flex-col items-center gap-0", "md:flex-row md:gap-2", className);

  return (
    <nav className={containerStyles} role="navigation" aria-label="フッターナビゲーション">
      {links.map((link) => (
        <div key={link.href}>
          {link.external ? (
            <a
              href={link.href}
              className={linkBaseStyles}
              aria-label={link.ariaLabel}
              target="_blank"
              rel="noopener noreferrer"
            >
              {link.label}
            </a>
          ) : (
            <Link href={link.href} className={linkBaseStyles} aria-label={link.ariaLabel}>
              {link.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
