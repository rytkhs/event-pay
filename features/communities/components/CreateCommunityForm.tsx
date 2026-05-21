"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArrowLeft, ArrowRight, Loader2, LogOut } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

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
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="community-name" className="text-sm font-medium">
          コミュニティ名
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id="community-name"
          name="name"
          placeholder="コミュニティ名を入力"
          required
          className="h-10"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "community-name-error" : "community-name-hint"}
          disabled={isPending || state.success}
        />
        {nameError ? (
          <p
            id="community-name-error"
            className="text-xs font-medium text-destructive"
            role="alert"
          >
            {nameError}
          </p>
        ) : (
          <p id="community-name-hint" className="text-xs text-muted-foreground">
            サークル、団体、一時的なグループの名前などを入力してください。あとから変更できます。
          </p>
        )}
      </div>

      <div className="flex justify-end border-t border-border/60 pt-4">
        <Button
          type="submit"
          disabled={isPending || state.success}
          className="w-full sm:w-auto sm:min-w-40"
        >
          {isPending || state.success ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{state.success ? "移動中..." : "作成中..."}</span>
            </>
          ) : (
            <>
              <span>コミュニティを作成</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </form>
  );

  // 既存ユーザー向け：シンプルな1カラムレイアウト
  if (!isNewUserFlow) {
    return (
      <div className="flex min-h-screen flex-col bg-muted/30">
        <header className="relative z-10 flex h-16 shrink-0 items-center px-4 sm:px-8">
          <Button variant="ghost" className="text-muted-foreground" asChild>
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              戻る
            </Link>
          </Button>
        </header>

        <main className="flex flex-1 items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="mb-6 text-center sm:mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                コミュニティを追加
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                運営単位となる新しいコミュニティを作成します。
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-background">
              <div className="flex flex-col gap-5 p-4 sm:gap-6 sm:p-6">
                {!state.success && error?.userMessage ? (
                  <Alert variant="destructive">
                    <AlertTitle>作成できませんでした</AlertTitle>
                    <AlertDescription>{error.userMessage}</AlertDescription>
                  </Alert>
                ) : null}

                {formElement}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 新規ユーザー向け：初回オンボーディングの1ステップ目として表示
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="flex items-start justify-between gap-4">
          <div className="pt-1">
            <span className="text-xs font-semibold text-muted-foreground">みんなの集金</span>
          </div>

          <div className="flex items-start gap-3">
            <div className="hidden items-center gap-3 pt-1 sm:flex">
              <span className="text-xs text-muted-foreground">セットアップ</span>
              <span className="rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs font-medium text-foreground">
                1 / 2
              </span>
            </div>
            <form action={handleLogout}>
              <Button
                variant="ghost"
                size="sm"
                type="submit"
                disabled={isLogoutPending}
                className="text-muted-foreground hover:bg-background"
              >
                {isLogoutPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LogOut className="mr-1.5 h-3.5 w-3.5" />
                )}
                ログアウト
              </Button>
              {logoutError && (
                <p className="mt-1 max-w-36 text-right text-xs font-medium text-destructive">
                  {logoutError}
                </p>
              )}
            </form>
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center py-8 sm:py-12">
          <div className="w-full max-w-md">
            <div className="mb-6 space-y-3 text-center sm:mb-8">
              <div className="mx-auto inline-flex rounded-md border border-border/60 bg-background px-2.5 py-1 text-xs font-medium text-foreground sm:hidden">
                セットアップ 1 / 2
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                最初のコミュニティを作成
              </h1>
              <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
                イベントと集金を管理する単位です。名前はあとから変更できます。
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-background">
              <div className="flex flex-col gap-5 p-4 sm:gap-6 sm:p-6">
                {!state.success && error?.userMessage ? (
                  <Alert variant="destructive">
                    <AlertTitle>作成できませんでした</AlertTitle>
                    <AlertDescription>{error.userMessage}</AlertDescription>
                  </Alert>
                ) : null}

                {formElement}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-dashed border-border/70 bg-background/60 px-4 py-3 text-center text-xs leading-5 text-muted-foreground">
              次にオンライン集金の設定へ進みます。設定はスキップしてあとから再開できます。
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
