"use client";

import { useEffect, useRef } from "react";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { toast } from "sonner";

import type { DetailedAccountStatus } from "@features/stripe-connect";

export function OnboardingToastNotifier({
  status,
  statusResolved,
}: {
  status?: DetailedAccountStatus;
  statusResolved: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const hasShownRef = useRef(false);

  useEffect(() => {
    const onboarding = searchParams.get("onboarding");

    // "stripe_return"以外の場合、または既に表示済みの場合は何もしない
    if (onboarding !== "stripe_return" || hasShownRef.current) {
      return;
    }

    if (!statusResolved) {
      toast("Stripe アカウント設定の状態を確認できませんでした", {
        description: "ダッシュボードを再読み込みして、設定状況を確認してください",
      });
    } else if (!status) {
      // CTA が不要な完全 ready 状態
      toast.success("設定が完了しました", {
        description: "さっそくイベントを作成しましょう",
      });
    } else if (status) {
      if (status.statusType === "ready") {
        // 1. "ready" の場合 (完了)
        toast.success("設定が完了しました", {
          description: "さっそくイベントを作成しましょう",
        });
      } else if (status.statusType === "pending_review") {
        // 2. "pending_review" の場合 (審査待ち)
        toast.success("設定が完了しました", {
          description: "Stripeでの確認が完了次第、オンライン集金が可能になります",
        });
      } else {
        // 3. その他のステータス（REQUIREMENTS_DUE などの途中で戻った場合等）
        toast("オンライン集金設定が中断されました", {
          description: "設定からいつでも再開できます",
        });
      }
    }

    hasShownRef.current = true;

    // URLからパラメータを削除する (UX向上のため)
    const newSearchParams = new URLSearchParams(searchParams.toString());
    newSearchParams.delete("onboarding");
    const query = newSearchParams.toString();
    const newUrl = query ? `${pathname}?${query}` : pathname;
    router.replace(newUrl, { scroll: false });
  }, [searchParams, status, statusResolved, pathname, router]);

  return null;
}
