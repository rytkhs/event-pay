import { cn } from "@core/utils";

import { FooterBranding } from "./FooterBranding";
import { FooterLinks } from "./FooterLinks";
import { footerNavigationLinks, footerConfig } from "./navigation-config";
import { FooterContentProps } from "./types";

/**
 * フッターコンテンツコンポーネント
 *
 * フッターの主要コンテンツ（ブランディング + ナビゲーション）を表示します
 */
export function FooterContent({ variant, className }: FooterContentProps): JSX.Element {
  const displaySettings = footerConfig.displaySettings[variant];

  const containerStyles = cn(
    "flex flex-col gap-1 items-center",
    "md:grid md:grid-cols-2 md:items-center md:gap-2",
    className
  );

  return (
    <div className={containerStyles}>
      {/* ブランディング + コピーライト（左） */}
      {(displaySettings.showBranding || displaySettings.showCopyright) && (
        <div className="flex flex-col items-center gap-2 order-last md:order-none md:items-start justify-self-start">
          {displaySettings.showBranding && <FooterBranding variant={variant} />}
          {displaySettings.showCopyright && (
            <p className="text-sm text-muted-foreground text-center md:text-left">
              {footerConfig.brand.copyright}
            </p>
          )}
        </div>
      )}

      {/* ナビゲーションリンク（右） */}
      {displaySettings.showNavigation && (
        <FooterLinks links={footerNavigationLinks} variant={variant} className="justify-self-end" />
      )}
    </div>
  );
}
