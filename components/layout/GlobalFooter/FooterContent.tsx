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
    "flex flex-col gap-4 items-center",
    "md:grid md:grid-cols-3 md:items-center md:gap-4",
    className
  );

  return (
    <div className={containerStyles}>
      {/* ブランディング（左） */}
      {displaySettings.showBranding && (
        <FooterBranding variant={variant} className="justify-self-start" />
      )}

      {/* コピーライト（中央） */}
      {displaySettings.showCopyright && (
        <div className="order-last md:order-none justify-self-center">
          <p className="text-sm text-muted-foreground text-center">
            {footerConfig.brand.copyright}
          </p>
        </div>
      )}

      {/* ナビゲーションリンク（右） */}
      {displaySettings.showNavigation && (
        <FooterLinks links={footerNavigationLinks} variant={variant} className="justify-self-end" />
      )}
    </div>
  );
}
