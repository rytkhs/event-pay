"use client";

export const dynamic = "force-dynamic";
import { Suspense } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Lock } from "lucide-react";

import { useRegisterFormRHF } from "@features/auth";

import { registerAction } from "@/app/(auth)/actions";
import { GoogleLoginButton } from "@/components/auth/GoogleLoginButton";
import { LINELoginButton } from "@/components/auth/LINELoginButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

import { startGoogleOAuth } from "../login/actions";

function RegisterForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("redirectTo") ?? "/";
  const { form, onSubmit, isPending } = useRegisterFormRHF(registerAction, {
    enableFocusManagement: true,
  });

  return (
    <>
      <div className="w-full flex justify-center py-10 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <Card>
            <CardHeader className="text-center">
              <CardTitle as="h1" className="text-2xl sm:text-3xl font-bold">
                アカウント作成
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                みんなの集金アカウントを作成してください
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <LINELoginButton href={`/auth/line?next=${encodeURIComponent(next)}`} />
                <form action={startGoogleOAuth}>
                  <input type="hidden" name="next" value={next} />
                  <GoogleLoginButton label="Googleでログイン" />
                </form>
              </div>
              <div className="flex items-center my-6">
                <div className="h-px flex-1 bg-border" />
                <span className="mx-3 text-xs text-muted-foreground">または</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Form {...form}>
                <form
                  onSubmit={onSubmit}
                  className="space-y-4 sm:space-y-6"
                  noValidate
                  data-testid="register-form"
                >
                  {/* 名前 */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>表示名</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="text"
                            placeholder="例: 集金 太郎"
                            disabled={isPending}
                            autoComplete="name"
                            required
                            data-testid="name-input"
                          />
                        </FormControl>
                        <FormDescription className="text-xs sm:text-sm">
                          イベント作成者として表示される名前です(変更可能)
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* メールアドレス */}
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>メールアドレス</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            placeholder="example@mail.com"
                            disabled={isPending}
                            autoComplete="email"
                            required
                            data-testid="email-input"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* パスワード */}
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>パスワード</FormLabel>
                        <FormControl>
                          <PasswordInput
                            {...field}
                            placeholder="パスワードを入力"
                            disabled={isPending}
                            autoComplete="new-password"
                            required
                            data-testid="password-input"
                          />
                        </FormControl>
                        <FormDescription className="text-xs sm:text-sm">
                          8文字以上で設定してください
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 全体エラーメッセージ */}
                  {form.formState.errors.root && (
                    <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded">
                      {form.formState.errors.root.message}
                    </div>
                  )}

                  {/* 送信ボタンとセキュリティ表示 */}
                  <div className="space-y-2">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isPending}
                      data-testid="submit-button"
                    >
                      {isPending ? "登録中..." : "アカウントを作成"}
                    </Button>

                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3" />
                      <span>通信は暗号化され、安全に保護されます</span>
                    </div>
                  </div>

                  {/* 利用規約同意の注釈 */}
                  <p className="text-xs text-muted-foreground text-center">
                    送信することで、
                    <Link
                      href="/terms"
                      className="text-primary hover:text-primary/80 underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      利用規約
                    </Link>
                    と
                    <Link
                      href="/privacy"
                      className="text-primary hover:text-primary/80 underline"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      プライバシーポリシー
                    </Link>
                    に同意したものとみなされます。
                  </p>

                  <div className="text-center text-xs sm:text-sm text-muted-foreground">
                    すでにアカウントをお持ちの方は{" "}
                    <Link
                      href="/login"
                      className="text-primary hover:text-primary/80 underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded"
                    >
                      ログイン
                    </Link>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-muted/30">
          <div className="text-center">
            <div className="text-sm text-muted-foreground">読み込み中...</div>
          </div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
