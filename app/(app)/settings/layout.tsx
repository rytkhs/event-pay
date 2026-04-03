"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Building2, ChevronLeft, CreditCard, Shield, User } from "lucide-react";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

const settingsPages = [
  {
    title: "コミュニティ",
    href: "/settings/community",
    icon: Building2,
    description: "選択中のコミュニティの設定",
  },
  {
    title: "Stripe アカウント",
    href: "/settings/payments",
    icon: CreditCard,
    description: "Stripeアカウント設定とダッシュボード",
  },
  {
    title: "アカウント",
    href: "/settings/profile",
    icon: User,
    description: "アカウント情報の変更",
  },
  {
    title: "パスワード",
    href: "/settings/security",
    icon: Shield,
    description: "パスワードの変更",
  },
];

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();

  const isSettingsRoot = pathname === "/settings" || pathname === "/settings/";

  if (isSettingsRoot) {
    return (
      <div className="container mx-auto max-w-4xl px-4 py-4">
        {/* ヘッダー */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold sm:text-3xl">設定</h1>
          <p className="mt-1 text-sm text-muted-foreground">コミュニティとアカウントを管理</p>
        </div>

        {/* 設定メニュー */}
        <div className="grid gap-3">
          {settingsPages.map((page) => {
            const Icon = page.icon;
            return (
              <Link key={page.href} href={page.href}>
                <div className="group flex items-center gap-4 rounded-xl border border-border/60 bg-card p-4 shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-muted/30 hover:shadow-md">
                  <div className="shrink-0 rounded-lg bg-primary/10 p-2.5 transition-colors duration-200 group-hover:bg-primary/15">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{page.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{page.description}</p>
                  </div>
                  <div className="shrink-0 text-muted-foreground/40 transition-colors duration-200 group-hover:text-primary/60">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // 個別設定ページ
  const currentPage = settingsPages.find((page) => pathname === page.href);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-2">
      {/* 戻るボタン */}
      <div className="mb-5">
        <Link
          href="/settings"
          className="group inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          設定に戻る
        </Link>
      </div>

      {/* ページヘッダー */}
      {currentPage && (
        <div className="mb-8 border-b border-border/60 pb-6">
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground">
            <span className="inline-block h-3.5 w-0.5 rounded-full bg-primary" aria-hidden="true" />
            設定
          </p>
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-lg bg-primary/10 p-2.5">
              <currentPage.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold sm:text-2xl">{currentPage.title}</h1>
              <p className="mt-0.5 text-xs text-muted-foreground">{currentPage.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* コンテンツエリア */}
      <div>{children}</div>
    </div>
  );
}
