"use client";

import React from "react";

import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { navigationConfig } from "./GlobalHeader/navigation-config";

export function Header() {
  const pathname = usePathname();

  // URLパスからブレッドクラム用のセグメントを生成
  const segments = pathname.split("/").filter(Boolean);

  // パスから適切なラベルを取得するコンポーネント内関数
  const getLabel = (path: string, segment: string) => {
    // 1. NavigationConfigから検索
    const navItem = navigationConfig.app.find((item) => item.href === path);
    if (navItem) return navItem.label;

    // 2. 一般的なパスのフォールバック
    const commonLabels: Record<string, string> = {
      dashboard: "ダッシュボード",
      events: "イベント",
      settings: "設定",
      create: "新規作成",
      participants: "参加者管理",
      edit: "編集",
    };

    if (commonLabels[segment]) return commonLabels[segment];

    // 3. IDと思われる場合（簡易判定）
    if (segment.length > 20) return "詳細"; // UUIDなどの場合

    // 4. そのまま表示（先頭大文字化などしても良い）
    return segment;
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 bg-background z-20 sticky top-0">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            {segments.map((segment, index) => {
              const path = `/${segments.slice(0, index + 1).join("/")}`;
              const isLast = index === segments.length - 1;
              const label = getLabel(path, segment);

              return (
                <React.Fragment key={path}>
                  <BreadcrumbItem className="hidden md:block">
                    {isLast ? (
                      <BreadcrumbPage>{label}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={path}>{label}</BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                  {!isLast && <BreadcrumbSeparator className="hidden md:block" />}
                </React.Fragment>
              );
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </header>
  );
}
