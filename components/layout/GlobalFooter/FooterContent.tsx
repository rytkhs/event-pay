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

  const containerStyles = cn("flex flex-col gap-12 md:gap-16", className);

  return (
    <div className={containerStyles}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8">
        {/* 左側: ブランド・SNS */}
        {displaySettings.showBranding && (
          <div className="md:col-span-4 flex flex-col items-start gap-8">
            <FooterBranding />

            {/* デスクトップ・タブレット用SNSアイコン (md以上) */}
            <div className="hidden md:flex items-center gap-5">
              <SocialIcon
                href="https://x.com/minnano_shukin"
                ariaLabel="X (Twitter)"
                icon={<XIcon className="w-5 h-5" />}
              />
              <SocialIcon
                href="https://note.com/minnano_shukin"
                ariaLabel="note"
                icon={<NoteIcon className="h-4 w-auto" />}
              />
            </div>
          </div>
        )}

        {/* 右側: リンクグループ */}
        {displaySettings.showNavigation && (
          <div className="md:col-span-8">
            <FooterLinks groups={footerNavigationGroups} className="md:justify-self-end" />
          </div>
        )}
      </div>

      {/* 下部: コピーライト & モバイルSNS */}
      {(displaySettings.showCopyright || displaySettings.showBranding) && (
        <div className="pt-8 border-t border-border/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          {displaySettings.showCopyright && (
            <p className="text-xs text-muted-foreground/60 font-medium">
              {footerConfig.brand.copyright}
            </p>
          )}

          {/* モバイル用SNSアイコン (md未満) */}
          <div className="flex md:hidden items-center gap-6">
            <SocialIcon
              href="https://x.com/minnano_shukin"
              ariaLabel="X (Twitter)"
              icon={<XIcon className="w-5 h-5" />}
            />
            <SocialIcon
              href="https://note.com/minnano_shukin"
              ariaLabel="note"
              icon={<NoteIcon className="h-4 w-auto" />}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * SNSアイコン用ヘルパーコンポーネント
 */
function SocialIcon({
  href,
  ariaLabel,
  icon,
}: {
  href: string;
  ariaLabel: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-muted-foreground hover:text-primary transition-all duration-300 hover:scale-110 active:scale-95"
      aria-label={ariaLabel}
    >
      {icon}
    </a>
  );
}
