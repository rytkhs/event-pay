"use client";

import { useActionState, useEffect } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ArrowRight, Loader2 } from "lucide-react";

import type { ActionResult } from "@core/errors/adapters/server-actions";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export function CreateCommunityForm({
  createCommunityAction,
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

  return (
    <Card className="border-border/70 shadow-sm">
      <CardHeader className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <CardTitle className="text-2xl">コミュニティを作成</CardTitle>
            <CardDescription className="text-sm leading-6">
              {hasOwnedCommunities
                ? "新しい運営単位を追加します。"
                : "最初のコミュニティを作成すると、ダッシュボードやイベント管理を使い始められます。"}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {!state.success && error?.userMessage ? (
          <Alert variant="destructive">
            <AlertTitle>作成できませんでした</AlertTitle>
            <AlertDescription>{error.userMessage}</AlertDescription>
          </Alert>
        ) : null}

        <form action={formAction} className="space-y-6" noValidate>
          <div className="space-y-2">
            <Label htmlFor="community-name">コミュニティ名</Label>
            <Input
              id="community-name"
              name="name"
              placeholder="例: ボドゲ会、読書会、テニスサークル"
              required
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? "community-name-error" : undefined}
            />
            <p className="text-sm text-muted-foreground">
              招待ページや公開ページに表示される名前です。あとから変更できます。
            </p>
            {nameError ? (
              <p
                id="community-name-error"
                className="text-sm font-medium text-destructive"
                role="alert"
              >
                {nameError}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="community-description">説明文</Label>
            <Textarea
              id="community-description"
              name="description"
              placeholder="活動内容や雰囲気、参加者への案内を書けます"
              className="min-h-32"
            />
            <p className="text-sm text-muted-foreground">
              任意です。公開ページや設定画面の説明文として使います。
            </p>
          </div>

          <div className="flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button type="button" variant="ghost" asChild>
                <Link href="/dashboard">あとで戻る</Link>
              </Button>
              <Button type="submit" disabled={isPending} className="min-w-40">
                {isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    作成中...
                  </>
                ) : (
                  <>
                    コミュニティを作成
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
