/**
 * RestrictedView - アカウント制限状態のビュー
 * restricted状態の表示
 */

"use client";

import { ExternalLink, ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";

interface RestrictedViewProps {
  expressDashboardAction?: (formData: FormData) => Promise<void>;
  expressDashboardAvailable?: boolean;
}

export function RestrictedView({
  expressDashboardAction,
  expressDashboardAvailable,
}: RestrictedViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-3.5 sm:p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-destructive/20 text-destructive">
            <ShieldX className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">アカウントが制限されています</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Stripeによってアカウントが制限されています。詳細については、Stripeサポートにお問い合わせください。
            </p>
          </div>
        </div>
      </div>

      {expressDashboardAvailable && expressDashboardAction && (
        <form action={expressDashboardAction}>
          <Button
            type="submit"
            variant="outline"
            className="group h-11 w-full border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground"
          >
            Stripeで制限内容を確認
            <ExternalLink className="ml-2 size-3.5 opacity-70 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
          </Button>
        </form>
      )}
    </div>
  );
}
