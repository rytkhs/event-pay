"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { User, CreditCard, Shield, ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SettingsLayoutProps {
  children: React.ReactNode;
}

const settingsPages = [
  {
    title: "プロフィール情報",
    href: "/settings/profile",
    icon: User,
    description: "基本情報とアカウント設定",
    status: "completed", // completed, warning, incomplete
  },
  {
    title: "支払い設定",
    href: "/settings/payments",
    icon: CreditCard,
    description: "Stripe Connect と決済管理",
    status: "warning",
  },
  {
    title: "セキュリティ",
    href: "/settings/security",
    icon: Shield,
    description: "パスワードとアカウント保護",
    status: "completed",
  },
];

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();

  // 設定のルートページかどうか
  const isSettingsRoot = pathname === "/settings" || pathname === "/settings/";

  if (isSettingsRoot) {
    // 設定メニュー画面
    return (
      <div className="container mx-auto py-4 px-4 max-w-4xl">
        {/* 戻るボタン（モバイル重視） */}
        <div className="mb-4">
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
            <Link href="/dashboard" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              ダッシュボードに戻る
            </Link>
          </Button>
        </div>

        {/* ヘッダー */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold">設定</h1>
          <p className="text-muted-foreground mt-1">アカウント情報とアプリケーション設定を管理</p>
        </div>

        {/* 設定メニューカード */}
        <div className="grid gap-4 sm:gap-6">
          {settingsPages.map((page) => {
            const Icon = page.icon;
            return (
              <Card key={page.href} className="hover:shadow-md transition-shadow cursor-pointer">
                <Link href={page.href}>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-4">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="space-y-1">
                          <h3 className="font-semibold text-base">{page.title}</h3>
                          <p className="text-sm text-muted-foreground">{page.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={page.status === "completed" ? "default" : "secondary"}
                          className="hidden sm:inline-flex"
                        >
                          {page.status === "completed" ? "完了" : "要設定"}
                        </Badge>
                        <div className="h-5 w-5 text-muted-foreground">
                          <svg
                            className="w-full h-full"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // 個別設定ページ
  const currentPage = settingsPages.find((page) => pathname.startsWith(page.href));

  return (
    <div className="container mx-auto py-4 px-4 max-w-4xl">
      {/* パンくずナビゲーション */}
      <div className="mb-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <Link
                href="/settings"
                className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
              >
                設定
              </Link>
            </BreadcrumbItem>
            <BreadcrumbItem>
              <BreadcrumbPage className="font-medium">{currentPage?.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* ページタイトル */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          {currentPage && (
            <div className="p-2 rounded-lg bg-primary/10">
              <currentPage.icon className="h-5 w-5 text-primary" />
            </div>
          )}
          <h1 className="text-xl sm:text-2xl font-bold">{currentPage?.title}</h1>
        </div>
        <p className="text-muted-foreground text-sm">{currentPage?.description}</p>
      </div>

      {/* コンテンツエリア */}
      <div>{children}</div>
    </div>
  );
}
