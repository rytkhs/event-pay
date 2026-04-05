"use client";

import { useActionState, useEffect } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArrowLeft, ArrowRight, CalendarDays, Link2, LogOut, Users, Wallet } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  {
    icon: Users,
    title: "参加者管理",
    description: "招待リンクで手軽に出欠確認",
  },
  {
    icon: Wallet,
    title: "オンライン集金",
    description: "Stripeで安全に参加費を受け取る",
  },
  {
    icon: Link2,
    title: "招待リンク発行",
    description: "参加者がリンク1つで申し込み完了",
  },
];

export function CreateCommunityForm({
  createCommunityAction,
  logoutAction,
  hasOwnedCommunities,
}: CreateCommunityFormProps) {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createCommunityAction, initialState);
  const error = state.success ? undefined : state.error;
  const nameError = error?.fieldErrors?.name?.[0];

  useEffect(() => {
    if (state.success && state.redirectUrl) {
      router.push(state.redirectUrl);
    }
  }, [router, state]);

  const handleLogout = async () => {
    const result = await logoutAction();
    if (result.redirectUrl) {
      window.location.href = result.redirectUrl;
    } else {
      window.location.href = "/login";
    }
  };

  const formElement = (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      {/* コミュニティ名 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="community-name" className="font-semibold">
          コミュニティ名
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        </Label>
        <Input
          id="community-name"
          name="name"
          placeholder="例: ボドゲ会、読書会、テニスサークル"
          required
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "community-name-error" : "community-name-hint"}
        />
        {nameError ? (
          <p
            id="community-name-error"
            className="text-sm font-medium text-destructive animate-fade-in"
            role="alert"
          >
            {nameError}
          </p>
        ) : (
          <p id="community-name-hint" className="text-xs text-muted-foreground">
            招待ページやプロフィールに表示されます。
          </p>
        )}
      </div>

      {/* 説明 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="community-description" className="font-semibold">
          コミュニティの説明 <span className="ml-1 text-muted-foreground font-normal">(任意)</span>
        </Label>
        <Textarea
          id="community-description"
          name="description"
          placeholder="例: サークル・グループの活動やイベント等の企画・運営を行っています..."
          className="min-h-32 resize-none"
          aria-describedby="community-description-hint"
        />
        <p id="community-description-hint" className="text-xs text-muted-foreground">
          コミュニティプロフィールに表示されます。未入力のままでも作成できます。
        </p>
      </div>

      {/* 送信ボタン */}
      <Button type="submit" disabled={isPending} className="mt-1 h-11 w-full font-semibold">
        {isPending ? (
          <>
            <span
              className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
              aria-hidden="true"
            />
            作成中...
          </>
        ) : (
          <>
            コミュニティを作成
            <ArrowRight className="ml-1.5 h-4 w-4" data-icon="inline-end" />
          </>
        )}
      </Button>
    </form>
  );

  // 既存ユーザー向け：シンプルな1カラムレイアウト
  if (hasOwnedCommunities) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <header className="relative z-10 flex h-16 shrink-0 items-center px-4 sm:px-6">
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-foreground -ml-2"
            asChild
          >
            <Link href="/dashboard">
              <ArrowLeft className="mr-2 h-4 w-4" />
              ダッシュボードに戻る
            </Link>
          </Button>
        </header>

        <main className="flex flex-1 items-center justify-center p-6 sm:p-10 -mt-16">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                コミュニティを追加する
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                企画やグループごとに運営単位を分けられます。
              </p>
            </div>

            {!state.success && error?.userMessage ? (
              <Alert variant="destructive" className="mb-6">
                <AlertTitle>作成できませんでした</AlertTitle>
                <AlertDescription>{error.userMessage}</AlertDescription>
              </Alert>
            ) : null}

            {formElement}
          </div>
        </main>
      </div>
    );
  }

  // 新規ユーザー向け：2カラムレイアウト（モバイル時は左パネル非表示）
  return (
    <div className="grid min-h-screen lg:grid-cols-[5fr_7fr] bg-background">
      {/* モバイル用ヘッダー（左パネル非表示の代わり） */}
      <div className="absolute top-0 left-0 right-0 z-20 flex h-16 items-center justify-between border-b border-border/40 bg-background/80 px-6 backdrop-blur-sm lg:hidden">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">
          みんなの集金
        </span>
        <form action={handleLogout}>
          <Button
            variant="ghost"
            size="sm"
            type="submit"
            className="h-8 px-2 text-xs text-muted-foreground"
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            ログアウト
          </Button>
        </form>
      </div>

      {/* ── 左パネル: ブランド & PR (lg以上のみ) ───────────────────── */}
      <div
        className="relative hidden flex-col justify-between overflow-hidden px-8 py-10 sm:px-12 sm:py-14 lg:flex"
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

        {/* ログアウトラベル */}
        <div className="absolute right-8 top-8 z-20">
          <form action={handleLogout}>
            <Button
              variant="ghost"
              size="sm"
              type="submit"
              className="h-8 px-3 text-xs text-white/50 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="mr-1.5 h-3.5 w-3.5" />
              ログアウト
            </Button>
          </form>
        </div>

        {/* ロゴラベル */}
        <div className="relative z-10">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
            みんなの集金
          </span>
        </div>

        {/* メインコピー */}
        <div className="relative z-10 my-10">
          <h2 className="text-3xl font-bold leading-snug tracking-tight text-white xl:text-4xl">
            集金 · 出欠管理を
            <br />
            もっとラクに
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-white/65">
            コミュニティを作ると、イベントの参加受付から集金まで一元管理できます。
          </p>
          <ul className="mt-8 flex flex-col gap-4">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <li key={f.title} className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: "rgba(255,255,255,0.13)" }}
                  >
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-none text-white">{f.title}</p>
                    <p className="mt-0.5 text-xs leading-none text-white/55">{f.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {/* フッター */}
        <div className="relative z-10">
          <p className="text-[11px] text-white/35">作成後すぐにイベントを開始できます</p>
        </div>
      </div>

      {/* ── 右パネル: フォーム ───────────────────────── */}
      <div className="flex items-start justify-center px-6 py-24 sm:px-10 lg:items-center lg:overflow-y-auto lg:py-16">
        <div className="w-full max-w-sm">
          {/* ヘッダー */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              最初のコミュニティを作成
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              まず運営の土台となるコミュニティを1件作成してください。
            </p>
          </div>

          {/* エラー */}
          {!state.success && error?.userMessage ? (
            <Alert variant="destructive" className="mb-6">
              <AlertTitle>作成できませんでした</AlertTitle>
              <AlertDescription>{error.userMessage}</AlertDescription>
            </Alert>
          ) : null}

          {/* フォーム */}
          {formElement}
        </div>
      </div>
    </div>
  );
}
