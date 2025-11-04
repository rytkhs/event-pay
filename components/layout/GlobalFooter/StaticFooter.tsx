import Link from "next/link";

import { cn } from "@core/utils";

/**
 * 静的フッターコンポーネント
 *
 * 認証状態を必要としないフッター。
 * マーケティングページで使用され、著作権、法的リンク、基本ナビゲーションを提供します。
 * Cookie/headers/searchParamsを一切参照しないため、静的プリレンダリングが可能です。
 */
export function StaticFooter({ className }: { className?: string }): JSX.Element {
  const footerLinks = [
    {
      label: "利用規約",
      href: "/terms",
      ariaLabel: "みんなの集金の利用規約を確認する",
    },
    {
      label: "プライバシーポリシー",
      href: "/privacy",
      ariaLabel: "みんなの集金のプライバシーポリシーを確認する",
    },
    {
      label: "特定商取引法に基づく表記",
      href: "/tokushoho/platform",
      ariaLabel: "みんなの集金プラットフォームの特定商取引法に基づく表記",
    },
    {
      label: "お問い合わせ",
      href: "/contact",
      ariaLabel: "みんなの集金へのお問い合わせフォーム",
    },
  ];

  return (
    <footer
      className={cn("bg-background text-foreground py-6", className)}
      role="contentinfo"
      aria-label="サイトフッター"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
        <div className="flex flex-col gap-1 items-center md:grid md:grid-cols-2 md:items-center md:gap-2">
          {/* ブランディング + コピーライト（左） */}
          <div className="flex flex-col items-center gap-2 order-last md:order-none md:items-start justify-self-start">
            {/* ブランド名 */}
            <Link
              href="/"
              className="text-lg font-bold text-primary hover:opacity-80 transition-opacity"
              aria-label="みんなの集金ホームページへ"
            >
              みんなの集金
            </Link>

            {/* コピーライト */}
            <p className="text-sm text-muted-foreground text-center md:text-left">
              © 2025 みんなの集金. All rights reserved.
            </p>
          </div>

          {/* ナビゲーションリンク（右） */}
          <nav
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 md:justify-end justify-self-end"
            aria-label="フッターナビゲーション"
          >
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
                aria-label={link.ariaLabel}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
