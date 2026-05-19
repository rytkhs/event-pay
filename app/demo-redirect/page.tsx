import { Suspense } from "react";

import type { Metadata } from "next";

import { RedirectHandler } from "./RedirectHandler";

export const metadata: Metadata = {
  title: "リダイレクト中",
  robots: "noindex, nofollow, noarchive",
};

/**
 * デモ環境から本番環境へのリダイレクトページ
 *
 * middleware から rewrite されてきたリクエストを受け取り、
 * クライアントサイドで本番環境の対応するパスへリダイレクトする。
 * これにより RSC prefetch の CORS エラーを回避する。
 */
export default function DemoRedirectPage() {
  return (
    <Suspense fallback={null}>
      <RedirectHandler />
    </Suspense>
  );
}
