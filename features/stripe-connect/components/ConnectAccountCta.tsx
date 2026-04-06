import Link from "next/link";

import { AlertCircle, ArrowRight, CreditCard, Clock, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { DetailedAccountStatus } from "../types";

interface ConnectAccountCtaProps {
  status: DetailedAccountStatus;
}

type VariantConfig = {
  containerClass: string;
  iconWrapperClass: string;
  titleClass: string;
  descriptionClass: string;
  icon: React.ReactNode;
};

function getVariantConfig(status: DetailedAccountStatus): VariantConfig {
  switch (status.severity) {
    case "error":
      return {
        containerClass: "bg-red-50/60 border border-red-200",
        iconWrapperClass: "bg-red-100",
        titleClass: "text-red-900",
        descriptionClass: "text-red-700",
        icon: <ShieldAlert className="h-5 w-5 text-red-600" />,
      };
    case "warning":
      return {
        containerClass: "bg-amber-50/60 border border-amber-200",
        iconWrapperClass: "bg-amber-100",
        titleClass: "text-amber-900",
        descriptionClass: "text-amber-700",
        icon: <AlertCircle className="h-5 w-5 text-amber-600" />,
      };
    case "info":
    default: {
      if (status.statusType === "pending_review") {
        return {
          containerClass: "bg-blue-50/60 border border-blue-200",
          iconWrapperClass: "bg-blue-100",
          titleClass: "text-blue-900",
          descriptionClass: "text-blue-700",
          icon: <Clock className="h-5 w-5 text-blue-600" />,
        };
      }
      if (status.statusType === "unverified") {
        return {
          containerClass: "bg-amber-50/60 border border-amber-200",
          iconWrapperClass: "bg-amber-100",
          titleClass: "text-amber-900",
          descriptionClass: "text-amber-700",
          icon: <RefreshCw className="h-5 w-5 text-amber-600" />,
        };
      }
      return {
        containerClass: "bg-primary/5 border border-primary/20",
        iconWrapperClass: "bg-primary/10",
        titleClass: "text-foreground",
        descriptionClass: "text-muted-foreground",
        icon: <CreditCard className="h-5 w-5 text-primary" />,
      };
    }
  }
}

/**
 * Stripe入金設定を促すダッシュボードバナーCTA
 *
 * - pending_review 状態はユーザーアクション不要のためボタン非表示
 * - severity に応じたデザインシステム準拠のカラートークンを使用
 */
export function ConnectAccountCta({ status }: ConnectAccountCtaProps) {
  const config = getVariantConfig(status);
  const showAction = status.statusType !== "pending_review";

  return (
    <div
      className={`rounded-xl ${config.containerClass} px-4 py-3.5 sm:px-5 sm:py-4 mb-6 sm:mb-8 shadow-sm`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* 左：アイコン + テキスト */}
        <div className="flex items-start gap-3">
          <div className={`shrink-0 rounded-lg p-2 ${config.iconWrapperClass}`}>{config.icon}</div>
          <div className="min-w-0">
            <p className={`text-sm font-semibold leading-snug ${config.titleClass}`}>
              {status.title}
            </p>
            <p className={`text-xs leading-relaxed mt-0.5 ${config.descriptionClass}`}>
              {status.description}
            </p>
          </div>
        </div>

        {/* 右：CTAボタン（pending_review は非表示） */}
        {showAction && (
          <div className="shrink-0 pl-11 sm:pl-0">
            <Button asChild size="sm" variant="outline" className="whitespace-nowrap gap-1.5">
              <Link href={status.actionUrl}>
                {status.actionText}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
