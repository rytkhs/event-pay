"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArrowLeft, ArrowRight, CalendarDays, Link2, Loader2, LogOut, Wallet } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { cn } from "@/components/ui/_lib/cn";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CreateCommunityPayload = {
  communityId: string;
};

type CreateCommunityFormState = ActionResult<CreateCommunityPayload>;

type CreateCommunityFormAction = (
  state: CreateCommunityFormState,
  formData: FormData
) => Promise<CreateCommunityFormState>;

type CreateCommunityFormProps = {
  createCommunityAction: CreateCommunityFormAction;
  logoutAction: () => Promise<ActionResult>;
  hasOwnedCommunities: boolean;
};

const initialState: CreateCommunityFormState = {
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    correlationId: "",
    retryable: false,
    userMessage: "",
  },
};

const features = [
  {
    icon: CalendarDays,
    title: "イベント管理",
    description: "開催予定・終了イベントを一覧で把握",
  },
  // {
  //   icon: Users,
  //   title: "参加者管理",
  //   description: "招待リンクで手軽に出欠確認",
  // },
  {
    icon: Wallet,
    title: "オンライン集金",
    description: "Stripeで安全に参加費を受け取る",
  },
  {
    icon: Link2,
    title: "出欠確認",
    description: "参加者がリンク1つで出欠登録完了",
  },
];

const LOGOUT_ERROR_MESSAGE = "ログアウトに失敗しました。再度お試しください。";

export function CreateCommunityForm({
  createCommunityAction,
  logoutAction,
  hasOwnedCommunities,
}: CreateCommunityFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createCommunityAction, initialState);
  const error = state.success ? undefined : state.error;
  const nameError = error?.fieldErrors?.name?.[0];

  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [isLogoutPending, startLogoutTransition] = useTransition();

  // revalidatePath によって hasOwnedCommunities が送信後に true になり、
  // リダイレクト前にレイアウトが一瞬切り替わる（新規用 -> 通常用）のを防ぐため、初期値を保持する
  const [isNewUserFlow] = useState(!hasOwnedCommunities);

  useEffect(() => {
    if (state.success && state.redirectUrl) {
      router.push(state.redirectUrl);
    }
  }, [router, state]);

  const handleLogout = useCallback(async () => {
    setLogoutError(null);
    startLogoutTransition(async () => {
      try {
        const result = await logoutAction();
        if (!result.success) {
          setLogoutError(result.error.userMessage || LOGOUT_ERROR_MESSAGE);
          return;
        }

        window.location.href = result.redirectUrl || "/login";
      } catch (e) {
        console.error("Logout error:", e);
        setLogoutError(LOGOUT_ERROR_MESSAGE);
      }
    });
  }, [logoutAction]);

  const formElement = (
    <form action={formAction} className="flex flex-col gap-10" noValidate>
      {/* 基本情報セクション */}
      <section className="space-y-6">
        <div className="space-y-6">
          {/* コミュニティ名 */}
          <div className="group flex flex-col gap-2">
            <Label
              htmlFor="community-name"
              className="text-[13px] font-semibold text-foreground/80"
            >
              コミュニティ名
              <span className="ml-1 text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <div className="relative">
              <Input
                id="community-name"
                name="name"
                placeholder="例: 〇〇サークル、〇〇会、〇〇のコミュニティ"
                required
                className="h-11 rounded-xl border-border/60 shadow-sm transition-all focus-visible:ring-primary/20"
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "community-name-error" : "community-name-hint"}
                disabled={isPending || state.success}
              />
            </div>
            {nameError ? (
              <p
                id="community-name-error"
                className="text-[11px] font-medium text-destructive animate-in fade-in slide-in-from-top-1"
                role="alert"
              >
                {nameError}
              </p>
            ) : (
              <p id="community-name-hint" className="text-[11px] text-muted-foreground/75">
                サークル、団体、一時的なグループの名前などを入力してください。あとから変更できます。
              </p>
            )}
          </div>
        </div>
      </section>

      {/* 送信ボタン */}
      <Button
        type="submit"
        disabled={isPending || state.success}
        className={cn(
          "relative h-12 w-full rounded-xl text-sm font-bold transition-all duration-200",
          "bg-gradient-to-r from-primary via-primary/90 to-primary/80",
          "shadow-[0_10px_20px_-10px_hsl(var(--primary)/0.5),inset_0_1px_0_rgba(255,255,255,0.2)]",
          "hover:shadow-[0_12px_24px_-10px_hsl(var(--primary)/0.6),inset_0_1px_0_rgba(255,255,255,0.3)]",
          "active:scale-[0.98]",
          "disabled:opacity-70"
        )}
      >
        {isPending || state.success ? (
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>{state.success ? "移動中..." : "作成中..."}</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1.5">
            <span>コミュニティを作成</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </div>
        )}
      </Button>
    </form>
  );

  // 既存ユーザー向け：シンプルな1カラムレイアウト
  if (!isNewUserFlow) {
    return (
      <div className="flex min-h-screen flex-col bg-stone-50/50">
        <header className="relative z-10 flex h-20 shrink-0 items-center px-4 sm:px-8">
          <Button
            variant="ghost"
            className="h-10 rounded-xl text-[13px] font-medium text-muted-foreground transition-all hover:bg-white hover:text-foreground hover:shadow-sm"
            asChild
          >
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              戻る
            </Link>
          </Button>
        </header>

        <main className="flex flex-1 items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-10 text-center">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                コミュニティを追加
              </h1>
              <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
                運営単位となる新しいコミュニティを作成します。
              </p>
            </div>

            <div className="rounded-[2rem] border border-border/50 bg-white/70 p-8 shadow-2xl shadow-stone-200/50 backdrop-blur-sm sm:p-10">
              {!state.success && error?.userMessage ? (
                <Alert
                  variant="destructive"
                  className="mb-8 rounded-2xl border-destructive/20 bg-destructive/5"
                >
                  <AlertTitle className="text-sm font-bold">作成できませんでした</AlertTitle>
                  <AlertDescription className="text-xs opacity-90">
                    {error.userMessage}
                  </AlertDescription>
                </Alert>
              ) : null}

              {formElement}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 新規ユーザー向け：2カラムレイアウト（モバイル時はブランド部分をミニバージョンとして上部に表示）
  return (
    <div className="flex min-h-screen flex-col bg-background lg:grid lg:grid-cols-[5fr_7fr]">
      {/* ── 左/上パネル: ブランド & PR ───────────────────── */}
      <div
        className="relative flex shrink-0 flex-col justify-center overflow-hidden px-6 py-8 sm:px-10 lg:justify-between lg:px-12 lg:py-14"
        style={{
          background:
            "linear-gradient(150deg, hsl(186,67%,36%) 0%, hsl(186,67%,28%) 55%, hsl(210,70%,22%) 100%)",
        }}
      >
        {/* 背景装飾 */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className="absolute -right-24 -top-24 h-80 w-80 rounded-full opacity-[0.12]"
            style={{ background: "hsl(186,67%,75%)" }}
          />
          <div
            className="absolute -bottom-16 -left-16 h-64 w-64 rounded-full opacity-[0.10]"
            style={{ background: "hsl(210,70%,65%)" }}
          />
          <svg
            className="absolute inset-0 h-full w-full opacity-[0.035]"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <defs>
              <pattern id="cc-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="white" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#cc-grid)" />
          </svg>
        </div>

        {/* ヘッダーエリア (ロゴ & ログアウト) */}
        <div className="relative z-10 flex items-center justify-between lg:block">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 lg:text-white/50">
            みんなの集金
          </span>
          {/* モバイル用ログアウトラベル */}
          <div className="lg:hidden">
            <form action={handleLogout}>
              <Button
                variant="ghost"
                size="sm"
                type="submit"
                disabled={isLogoutPending}
                className="h-8 rounded-lg px-3 text-[11px] font-bold text-white/80 transition-all hover:bg-white/10 hover:text-white"
              >
                {isLogoutPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="mr-1.5 h-3.5 w-3.5" />
                )}
                ログアウト
              </Button>
              {logoutError && (
                <p className="mt-1 px-1 text-right text-[10px] font-medium text-destructive-foreground animate-in fade-in slide-in-from-top-1">
                  {logoutError}
                </p>
              )}
            </form>
          </div>
        </div>

        {/* lg用ログアウトラベル */}
        <div className="absolute right-12 top-12 z-20 hidden lg:block">
          <form action={handleLogout}>
            <Button
              variant="ghost"
              size="sm"
              type="submit"
              disabled={isLogoutPending}
              className="h-10 rounded-xl px-4 text-[11px] font-bold text-white/50 transition-all hover:bg-white/10 hover:text-white"
            >
              {isLogoutPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <LogOut className="mr-2 h-3.5 w-3.5" />
              )}
              ログアウト
            </Button>
            {logoutError && (
              <p className="mt-1 px-1 text-right text-[10px] font-medium text-destructive-foreground animate-in fade-in slide-in-from-top-1">
                {logoutError}
              </p>
            )}
          </form>
        </div>

        {/* メインコピー */}
        <div className="relative z-10 mt-8 mb-2 lg:my-10">
          <h2 className="text-2xl font-bold leading-snug tracking-tight text-white sm:text-3xl xl:text-4xl">
            出欠確認から集金まで、
            <br className="hidden lg:block" />
            リンク1本でまとめて管理。
          </h2>
          <p className="mt-3 text-[13px] leading-relaxed text-white/80 lg:mt-4 lg:text-sm lg:text-white/65">
            イベント・集金はコミュニティやグループごとに束ねて管理することができます。
            <br />
            まずは最初のコミュニティを作成しましょう。
          </p>

          {/* 機能一覧 (lg以上のみ表示) */}
          <div className="mt-12 hidden space-y-6 lg:block">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="group flex items-start gap-5">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white shadow-lg backdrop-blur-md transition-transform group-hover:scale-110">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="mb-1.5 text-sm font-bold text-white">{f.title}</h3>
                    <p className="text-[13px] leading-snug text-white/50">{f.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* フッター (lg以上のみ表示) */}
        <div className="relative z-10 hidden lg:block">
          <div className="mb-6 h-px w-16 bg-white/20" />
          <p className="text-[11px] font-medium uppercase tracking-wide text-white/40">
            Start creating your first community today
          </p>
        </div>
      </div>

      {/* ── 右/下パネル: フォーム ───────────────────────── */}
      <div className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10 lg:overflow-y-auto lg:py-16">
        {/* ステップインジケーター */}
        <div className="absolute right-6 top-6 flex items-center gap-3 sm:right-10 sm:top-10 lg:right-12 lg:top-12">
          <span className="hidden text-[11px] font-medium text-muted-foreground/60 sm:block">
            セットアップ
          </span>
          <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-bold text-foreground/80 shadow-sm backdrop-blur-sm">
            1 / 2
          </span>
        </div>

        <div className="w-full max-w-sm">
          {/* ヘッダー */}
          <div className="mb-12">
            <p className="mt-4 text-xl font-semibold">
              まずは最初のコミュニティを作成してください。
            </p>
          </div>

          {/* エラー */}
          {!state.success && error?.userMessage ? (
            <Alert
              variant="destructive"
              className="mb-8 rounded-2xl border-destructive/20 bg-destructive/5"
            >
              <AlertTitle className="text-sm font-bold">エラーが発生しました</AlertTitle>
              <AlertDescription className="text-xs opacity-90">
                {error.userMessage}
              </AlertDescription>
            </Alert>
          ) : null}

          {/* フォーム */}
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            {formElement}
          </div>
        </div>
      </div>
    </div>
  );
}
