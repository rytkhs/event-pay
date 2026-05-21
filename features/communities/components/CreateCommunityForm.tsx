"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArrowLeft, ArrowRight, Loader2, LogOut } from "lucide-react";

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

  // 新規ユーザー向け：初回オンボーディングの1ステップ目として表示
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.42)_52%,hsl(var(--background))_100%)]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-start justify-between gap-4">
          <div className="pt-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">
              みんなの集金
            </span>
          </div>

          <div className="flex items-start gap-3">
            <div className="hidden items-center gap-3 pt-1 sm:flex">
              <span className="text-[11px] font-medium text-muted-foreground/60">
                セットアップ
              </span>
              <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-bold text-foreground/80 shadow-sm backdrop-blur-sm">
                1 / 2
              </span>
            </div>
            <form action={handleLogout}>
              <Button
                variant="ghost"
                size="sm"
                type="submit"
                disabled={isLogoutPending}
                className="h-9 rounded-xl px-3 text-[11px] font-bold text-muted-foreground transition-all hover:bg-background hover:text-foreground hover:shadow-sm"
              >
                {isLogoutPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="mr-1.5 h-3.5 w-3.5" />
                )}
                ログアウト
              </Button>
              {logoutError && (
                <p className="mt-1 max-w-36 text-right text-[10px] font-medium text-destructive animate-in fade-in slide-in-from-top-1">
                  {logoutError}
                </p>
              )}
            </form>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center py-8 sm:py-12">
          <div className="w-full max-w-md">
            <div className="mb-8 space-y-3 text-center sm:mb-10">
              <div className="mx-auto inline-flex rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-bold text-foreground/80 shadow-sm backdrop-blur-sm sm:hidden">
                セットアップ 1 / 2
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                最初のコミュニティを作成
              </h1>
              <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
                イベントと集金を管理する単位です。名前はあとから変更できます。
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-border/60 bg-background/85 p-6 shadow-[0_24px_70px_-44px_hsl(var(--foreground)/0.45)] backdrop-blur-sm sm:p-8">
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

              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                {formElement}
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-dashed border-border/70 bg-muted/30 px-4 py-3 text-center text-xs leading-5 text-muted-foreground">
              次にオンライン集金の設定へ進みます。設定はスキップしてあとから再開できます。
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
