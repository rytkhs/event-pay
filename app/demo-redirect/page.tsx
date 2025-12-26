"use client";

import { Suspense, useEffect } from "react";

import { useSearchParams } from "next/navigation";

import { DEMO_CLIENT_REDIRECT_ALLOWLIST } from "@core/constants/demo-config";

const productionUrl = process.env.NEXT_PUBLIC_PRODUCTION_URL || "https://minnano-shukin.com";

function RedirectHandler() {
  const searchParams = useSearchParams();
  const rawPath = searchParams.get("to") || "/";

  // オープンリダイレクト対策: 許可されたパスのみリダイレクト、それ以外はトップへ
  const targetPath = DEMO_CLIENT_REDIRECT_ALLOWLIST.includes(rawPath) ? rawPath : "/";

  useEffect(() => {
    window.location.replace(`${productionUrl}${targetPath}`);
  }, [targetPath]);

  return null;
}

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
