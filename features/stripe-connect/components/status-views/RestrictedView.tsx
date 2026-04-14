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
    <div className="space-y-4">
      <div className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
        <div className="flex gap-3 items-start">
          <div className="shrink-0 rounded-lg bg-destructive/15 p-2 flex items-center justify-center">
            <ShieldX className="h-4 w-4 text-destructive" />
          </div>
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
            className="group relative h-11 w-full rounded-xl border border-destructive/25 bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent text-sm font-semibold text-red-700 transition-all duration-300 hover:border-destructive/40 hover:from-destructive/20 hover:via-destructive/10 hover:to-destructive/5 hover:text-red-800 shadow-[inset_0_1px_0_hsl(var(--destructive-foreground)/0.4),0_8px_16px_-12px_hsl(var(--destructive)/0.2)] hover:shadow-[inset_0_1px_0_hsl(var(--destructive-foreground)/0.5),0_12px_24px_-12px_hsl(var(--destructive)/0.4)]"
          >
            Stripeで制限内容を確認
            <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </form>
      )}
    </div>
  );
}
