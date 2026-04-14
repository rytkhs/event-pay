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
    title: "自動送金",
    description: "集金は自動であなたの銀行口座に入金されます",
  },
] as const;

export function OnboardingIntro({ hasExistingAccount = false }: OnboardingIntroProps) {
  return (
    <>
      <div className="text-center mb-8">
        <p className="text-lg font-semibold tracking-tight mb-2">
          {hasExistingAccount ? "オンライン集金の設定を再開" : "オンライン集金を始めましょう"}
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed max-w-md mx-auto">
          参加費や会費をオンラインで受け取れるようになります。
          <br className="hidden sm:block" />
          現金管理の手間から解放されましょう。
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
