import { cn } from "@core/utils";

import { FooterBranding } from "./FooterBranding";
import { FooterLinks } from "./FooterLinks";
import { footerNavigationLinks, footerConfig } from "./navigation-config";

/**
 * フッターコンテンツコンポーネント
 *
 * フッターの主要コンテンツ（ブランディング + ナビゲーション）を表示します
 */
export function FooterContent({ className }: { className?: string }): JSX.Element {
  const displaySettings = footerConfig.displaySettings;

  const containerStyles = cn(
    "flex flex-col gap-1 items-center",
    "md:grid md:grid-cols-2 md:items-center md:gap-2",
    className
  );

  return (
    <div className={containerStyles}>
      {/* ブランディング + コピーライト（左） */}
      {(displaySettings.showBranding || displaySettings.showCopyright) && (
        <div className="flex flex-col items-center gap-0 sm:gap-1 order-last md:order-none md:items-start justify-self-start">
          {displaySettings.showBranding && <FooterBranding />}
          {displaySettings.showCopyright && (
            <p className="text-sm text-muted-foreground text-center md:text-left">
              {footerConfig.brand.copyright}
            </p>
          )}
        </div>
      )}

      {/* ナビゲーションリンク（右） */}
      {displaySettings.showNavigation && (
        <FooterLinks links={footerNavigationLinks} className="justify-self-end" />
      )}
    </div>
  );
}
