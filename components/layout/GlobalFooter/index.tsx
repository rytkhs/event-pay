import { cn } from "@core/utils";

import { FooterContent } from "./FooterContent";
import { footerConfig } from "./navigation-config";

/**
 * グローバルフッターコンポーネント
 *
 * アプリケーション全体で共通のフッターを提供します。
 * 静的Server Componentとして実装され、静的プリレンダリングが可能です。
 */
export function GlobalFooter({ className }: { className?: string }): JSX.Element {
  const displaySettings = footerConfig.displaySettings;

  const footerStyles = cn("bg-background text-foreground py-6", className);

  const containerStyles = cn("container mx-auto px-4 sm:px-6 lg:px-8", "max-w-7xl");

  return (
    <footer className={footerStyles} aria-label="サイトフッター">
      <div className={containerStyles}>
        {/* フッターコンテンツ */}
        {(displaySettings.showBranding ||
          displaySettings.showNavigation ||
          displaySettings.showCopyright) && <FooterContent className="" />}
      </div>
    </footer>
  );
}
