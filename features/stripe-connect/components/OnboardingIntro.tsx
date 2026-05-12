import { ShieldCheck, Smartphone, Zap } from "lucide-react";

interface OnboardingIntroProps {
  hasExistingAccount?: boolean;
}

const BENEFITS = [
  {
    icon: Smartphone,
    title: "かんたん",
    description: "参加者はリンクからすぐに支払い。現金の手間ゼロ",
  },
  {
    icon: ShieldCheck,
    title: "安全",
    description: "Stripeが決済を安全に処理。個人情報は当サービスに保存されません",
  },
  {
    icon: Zap,
    title: "振込確認",
    description: "Stripe上の残高と振込状況を確認できます",
  },
] as const;

export function OnboardingIntro({ hasExistingAccount = false }: OnboardingIntroProps) {
  return (
    <>
      <div className="mb-5 flex flex-col gap-2 sm:mb-8 sm:gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
          {hasExistingAccount ? "オンライン集金の設定を再開" : "オンライン集金を始めましょう"}
        </h2>
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">
          参加費や会費をオンラインで受け取るため、Stripeの安全な画面で受取先を設定します。
        </p>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-2 sm:mb-8 sm:grid-cols-3">
        {BENEFITS.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <div
              key={benefit.title}
              className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3.5 transition-colors hover:border-primary/30 hover:bg-muted/30 sm:p-4"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/60 text-primary">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{benefit.title}</span>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                  {benefit.description}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
