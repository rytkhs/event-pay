import type { JSX } from "react";

import Link from "next/link";

import { cn } from "@core/utils";

import { NoteIcon } from "@/components/ui/icons/note-icon";
import { XIcon } from "@/components/ui/icons/x-icon";

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
    "text-muted-foreground hover:text-primary transition-all duration-200",
    "text-sm relative group w-fit",
    "focus:outline-none focus:ring-2 focus:ring-primary/20 rounded-sm"
  );

  const containerStyles = cn("grid grid-cols-2 sm:grid-cols-3 gap-8 md:gap-12", className);

  return (
    <nav className={containerStyles} role="navigation" aria-label="フッターナビゲーション">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-4">
          <h3 className="font-semibold text-foreground text-sm tracking-wider">{group.title}</h3>
          <ul className="flex flex-col gap-3">
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
                    {link.label}
                    <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
                  </a>
                ) : (
                  <Link
                    href={link.href}
                    prefetch={false}
                    className={linkBaseStyles}
                    aria-label={link.ariaLabel}
                  >
                    {link.label}
                    <span className="absolute -bottom-0.5 left-0 w-0 h-0.5 bg-primary transition-all duration-300 group-hover:w-full" />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* ソーシャルアイコン */}
      <div className="flex flex-col gap-4 sm:hidden">
        <h3 className="font-semibold text-foreground text-sm tracking-wider">Follow Us</h3>
        <div className="flex items-center gap-4">
          <a
            href="https://x.com/minnano_shukin"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
            aria-label="X (Twitter)"
          >
            <XIcon className="w-5 h-5" />
          </a>
          <a
            href="https://note.com/minnano_shukin"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary transition-colors"
            aria-label="note"
          >
            <NoteIcon className="h-4 w-auto" />
          </a>
        </div>
      </div>
    </nav>
  );
}
