import type { JSX } from "react";

import Link from "next/link";

import { cn } from "@core/utils";

import { NoteIcon } from "@/components/ui/icons/note-icon";
import { XIcon } from "@/components/ui/icons/x-icon";

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

  const containerStyles = cn("flex flex-col items-center gap-6", "md:flex-row md:gap-2", className);

  return (
    <nav className={containerStyles} role="navigation" aria-label="フッターナビゲーション">
      {/* リンクグループ */}
      <div className="flex flex-col items-center gap-1 md:flex-row md:gap-2">
        {/* リンクを2つずつのペアに分割して表示（モバイル用） */}
        {Array.from({ length: Math.ceil(links.length / 2) }).map((_, i) => (
          <div key={i} className="flex items-center md:gap-2">
            {links.slice(i * 2, i * 2 + 2).map((link, j) => (
              <div key={link.href} className="flex items-center">
                {j > 0 && (
                  <span className="text-muted-foreground/30 mx-2 md:hidden" aria-hidden="true">
                    /
                  </span>
                )}
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
                  <Link
                    href={link.href}
                    prefetch={false}
                    className={linkBaseStyles}
                    aria-label={link.ariaLabel}
                  >
                    {link.label}
                  </Link>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* ソーシャルアイコン */}
      <div className="flex items-center gap-3 md:ml-4">
        <a
          href="https://x.com/minnano_shukin"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(linkBaseStyles, "p-1")}
          aria-label="X (Twitter)"
        >
          <XIcon className="w-3.5 h-3.5" />
        </a>
        <a
          href="https://note.com/minnano_shukin"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(linkBaseStyles, "p-1")}
          aria-label="note"
        >
          <NoteIcon className="h-2.5 w-auto" />
        </a>
      </div>
    </nav>
  );
}
