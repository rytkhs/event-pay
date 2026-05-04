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
    title: "入金確認",
    description: "Stripe上の残高と入金状況を確認できます",
  },
] as const;

export function OnboardingIntro({ hasExistingAccount = false }: OnboardingIntroProps) {
  return (
    <>
      <div className="mb-10 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {hasExistingAccount ? "オンライン集金の設定を再開" : "オンライン集金を始めましょう"}
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground">
          参加費や会費をオンラインで安全に受け取れるようになります。
          <br className="hidden sm:block" />
          現金管理のストレスから解放されましょう。
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
        {BENEFITS.map((benefit) => {
          const Icon = benefit.icon;
          return (
            <div
              key={benefit.title}
              className="flex flex-col items-center text-center rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-primary/30 hover:bg-primary/[0.02]"
            >
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 mb-3">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-semibold mb-1">{benefit.title}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{benefit.description}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}
