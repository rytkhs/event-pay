import Link from "next/link";

type CommunityFooterProps = {
  communitySlug?: string;
  legalSlug?: string;
};

export function CommunityFooter({ communitySlug, legalSlug }: CommunityFooterProps) {
  return (
    <footer className="py-6 border-t border-border/30 bg-muted/20 mt-auto">
      <div className="container mx-auto max-w-7xl px-4 flex flex-col items-center gap-4">
        {/* ナビゲーションリンク */}
        <nav className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-xs sm:text-sm text-muted-foreground font-medium">
          <Link href="/terms" className="hover:text-foreground transition-all duration-200">
            利用規約
          </Link>
          <Link href="/privacy" className="hover:text-foreground transition-all duration-200">
            プライバシーポリシー
          </Link>

          {legalSlug && (
            <Link
              href={`/tokushoho/${legalSlug}`}
              className="hover:text-foreground transition-all duration-200"
            >
              特定商取引法に基づく表記
            </Link>
          )}
          {communitySlug && (
            <Link
              href={`/c/${communitySlug}/contact`}
              className="hover:text-foreground transition-all duration-200"
            >
              主催者にお問い合わせ
            </Link>
          )}
        </nav>

        {/* プラットフォームブランド */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-[10px] sm:text-xs">
            <span className="text-muted-foreground font-semibold tracking-widest">Powered by</span>
            <span className="text-primary font-bold">みんなの集金</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
