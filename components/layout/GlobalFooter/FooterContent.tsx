import type { JSX } from "react";

import { cn } from "@core/utils";

import { NoteIcon } from "@/components/ui/icons/note-icon";
import { XIcon } from "@/components/ui/icons/x-icon";

import { FooterBranding } from "./FooterBranding";
import { FooterLinks } from "./FooterLinks";
import { footerNavigationGroups, footerConfig } from "./navigation-config";

/**
 * フッターコンテンツコンポーネント
 *
 * フッターの主要コンテンツ（ブランディング + ナビゲーション）を表示します
 */
export function FooterContent({ className }: { className?: string }): JSX.Element {
  const displaySettings = footerConfig.displaySettings;

  const containerStyles = cn("grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8", className);

  return (
    <div className={containerStyles}>
      {/* 左側: ブランド・SNS・コピーライト */}
      {(displaySettings.showBranding || displaySettings.showCopyright) && (
        <div className="md:col-span-4 flex flex-col items-center md:items-start justify-between gap-8 h-full">
          <div className="flex flex-col items-center md:items-start gap-6">
            {displaySettings.showBranding && <FooterBranding />}

            {/* デスクトップ用SNSアイコン */}
            <div className="hidden md:flex items-center gap-4">
              <a
                href="https://x.com/minnano_shukin"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors duration-200"
                aria-label="X (Twitter)"
              >
                <XIcon className="w-5 h-5" />
              </a>
              <a
                href="https://note.com/minnano_shukin"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors duration-200"
                aria-label="note"
              >
                <NoteIcon className="h-4 w-auto" />
              </a>
            </div>
          </div>

          <div className="flex flex-col items-center md:items-start gap-4">
            {displaySettings.showCopyright && (
              <p className="text-xs text-muted-foreground/60 font-medium">
                {footerConfig.brand.copyright}
              </p>
            )}
          </div>
        </div>
      )}

      {/* 右側: リンクグループ */}
      {displaySettings.showNavigation && (
        <div className="md:col-span-8">
          <FooterLinks groups={footerNavigationGroups} className="justify-self-end" />
        </div>
      )}
    </div>
  );
}
