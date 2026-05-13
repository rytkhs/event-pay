/**
 * StatusBadge - Stripe連携ステータスのバッジ表示
 * 各ステータスビューのカード内に統合して使用する
 */

import { cn } from "@/components/ui/_lib/cn";

export type StatusConfig = {
  label: string;
  dotClass: string;
  pulse?: boolean;
};

export function StatusBadge({ config }: { config: StatusConfig }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/40 bg-background/80 px-2.5 py-1 text-xs font-medium text-foreground/70">
      <span className="relative flex h-1.5 w-1.5">
        {config.pulse && (
          <span
            className={cn(
              "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
              config.dotClass
            )}
          />
        )}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", config.dotClass)} />
      </span>
      {config.label}
    </span>
  );
}
