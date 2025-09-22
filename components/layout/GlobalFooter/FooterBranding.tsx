import { cn } from "@core/utils";

import { footerConfig } from "./navigation-config";
import { FooterBrandingProps } from "./types";

/**
 * フッターブランディングコンポーネント
 *
 * ブランドロゴと名前を表示します
 */
export function FooterBranding({ variant: _variant, className }: FooterBrandingProps): JSX.Element {
  return (
    <div className={cn("flex flex-col items-center md:items-start", className)}>
      <div className="footer-logo">
        <span
          className={cn(
            "font-bold text-foreground transition-colors duration-200",
            "text-lg md:text-xl",
            "hover:text-primary"
          )}
        >
          {footerConfig.brand.name}
        </span>
      </div>
    </div>
  );
}
