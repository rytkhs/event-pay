export function OnboardingIntro() {
  return (
    <div className="mb-5 flex flex-col gap-2 sm:mb-8 sm:gap-3">
      <h2 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
        オンライン集金を設定する
      </h2>
      <p className="max-w-xl text-sm leading-6 text-muted-foreground">
        イベントでオンライン支払いを選べるようにします。本人確認と口座情報はStripeの画面で入力します。
      </p>
    </div>
  );
}
