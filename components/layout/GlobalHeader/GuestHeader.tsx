"use client";

import Link from "next/link";

import { CheckCircle, Clock, XCircle } from "lucide-react";

import { cn } from "@core/utils";

import { Badge } from "@components/ui/badge";

import { GuestHeaderProps } from "./types";

/**
 * ゲスト用ヘッダーコンポーネント
 * 招待リンクからアクセスしたゲストユーザー向けの最小限のヘッダー
 */
export function GuestHeader({ attendance, className }: GuestHeaderProps) {
  // 参加状況に応じたバッジの設定
  const getStatusBadge = () => {
    if (!attendance) return null;

    const statusConfig = {
      attending: {
        label: "参加予定",
        variant: "default" as const,
        icon: <CheckCircle className="h-3 w-3" />,
        className: "bg-green-100 text-green-800 hover:bg-green-100",
      },
      not_attending: {
        label: "不参加",
        variant: "secondary" as const,
        icon: <XCircle className="h-3 w-3" />,
        className: "bg-red-100 text-red-800 hover:bg-red-100",
      },
      pending: {
        label: "未定",
        variant: "outline" as const,
        icon: <Clock className="h-3 w-3" />,
        className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100",
      },
    };

    const config = statusConfig[attendance.status];

    return (
      <Badge variant={config.variant} className={cn("flex items-center gap-1", config.className)}>
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  return (
    <header
      className={cn(
        "bg-background/80 backdrop-blur-sm border-b border-border/50 sticky top-0 z-50",
        className
      )}
    >
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* ブランドロゴ */}
          <div className="flex items-center">
            <Link
              href="/"
              className="text-xl sm:text-2xl font-bold text-primary hover:opacity-80 transition-opacity"
            >
              みんなの集金
            </Link>
          </div>

          {/* 参加状況表示 */}
          <div className="flex items-center space-x-4">
            {attendance?.eventTitle && (
              <div className="hidden sm:block">
                <p className="text-sm text-muted-foreground">{attendance.eventTitle}</p>
              </div>
            )}

            {getStatusBadge()}
          </div>
        </div>

        {/* モバイル用イベント名表示 */}
        {attendance?.eventTitle && (
          <div className="sm:hidden pb-3">
            <p className="text-sm text-muted-foreground text-center">{attendance.eventTitle}</p>
          </div>
        )}
      </div>
    </header>
  );
}
