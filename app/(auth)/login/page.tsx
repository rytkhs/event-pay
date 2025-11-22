"use client";

import { Suspense } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

import { useFormStatus } from "react-dom";

import { loginAction } from "@core/actions/auth";

import { useLoginFormRHF } from "@features/auth";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";

import { startGoogleOAuth } from "./actions";

const GoogleIcon = ({ className = "h-5 w-5" }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
  >
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const LoadingSpinner = ({ size = "h-4 w-4" }) => (
  <div
    className={`${size} border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin`}
    role="status"
    aria-label="読み込み中"
  />
);

function GoogleSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      className="w-full mb-4 sm:mb-6 flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-900 border-gray-300 font-medium transition-colors"
      disabled={pending}
      aria-label={pending ? "Googleでログイン中" : "Googleでログイン"}
    >
      {pending ? (
        <>
          <LoadingSpinner />
          <span>ログイン中...</span>
        </>
      ) : (
        <>
          <GoogleIcon />
          <span>Googleでログイン</span>
        </>
      )}
    </Button>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("redirectTo") ?? "/";
  const { form, onSubmit, isPending } = useLoginFormRHF(loginAction, {
    enableFocusManagement: true,
  });

  return (
    <>
      <main className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <Card>
            <CardHeader className="text-center">
              <CardTitle as="h1" className="text-2xl sm:text-3xl font-bold">
                ログイン
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                みんなの集金アカウントにログインしてください
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={onSubmit}
                  className="space-y-4 sm:space-y-6"
                  noValidate
                  data-testid="login-form"
                >
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
                            name="email"
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
                            autoComplete="current-password"
                            required
                            name="password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* ログイン状態を保持 */}
                  <FormField
                    control={form.control}
                    name="rememberMe"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isPending}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            ログイン状態を保持
                          </FormLabel>
                        </div>
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <div></div>
                    <Link
                      href="/reset-password"
                      className="text-primary hover:text-primary/80 underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded"
                    >
                      パスワードを忘れた方
                    </Link>
                  </div>

                  {/* 全体エラーメッセージ */}
                  {form.formState.errors.root && (
                    <div
                      className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded"
                      data-testid="error-message"
                    >
                      {form.formState.errors.root.message}
                    </div>
                  )}

                  {/* 送信ボタン */}
                  <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending ? "ログイン中..." : "ログイン"}
                  </Button>

                  <div className="text-center text-xs sm:text-sm text-muted-foreground">
                    アカウントをお持ちでない方は{" "}
                    <Link
                      href="/register"
                      className="text-primary hover:text-primary/80 underline focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 rounded"
                    >
                      アカウントを作成
                    </Link>
                  </div>
                </form>
              </Form>
              <div className="flex items-center my-6">
                <div className="h-px flex-1 bg-border" />
                <span className="mx-3 text-xs text-muted-foreground">または</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <form action={startGoogleOAuth} className="space-y-4">
                <input type="hidden" name="next" value={next} />
                <GoogleSubmitButton />
              </form>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer
        className="text-center text-xs sm:text-sm text-muted-foreground py-4"
        role="contentinfo"
      >
        <p>みんなの集金 - 集金ストレスをゼロに</p>
      </footer>
    </>
  );
}

export default function LoginPage() {
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
      <LoginForm />
    </Suspense>
  );
}
