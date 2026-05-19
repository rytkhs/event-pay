"use client";

import { useEffect } from "react";

import { useSearchParams } from "next/navigation";

import { DEMO_CLIENT_REDIRECT_ALLOWLIST } from "@core/constants/demo-config";

export function RedirectHandler() {
  const searchParams = useSearchParams();
  const rawPath = searchParams.get("to") || "/";

  // オープンリダイレクト対策: 許可されたパスのみリダイレクト、それ以外はトップへ
  const targetPath = DEMO_CLIENT_REDIRECT_ALLOWLIST.includes(rawPath) ? rawPath : "/";

  useEffect(() => {
    window.location.replace(`${process.env.NEXT_PUBLIC_PRODUCTION_URL}${targetPath}`);
  }, [targetPath]);

  return null;
}
