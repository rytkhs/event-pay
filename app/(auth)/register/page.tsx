"use client";

export const dynamic = "force-dynamic";
import { Suspense } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { Lock } from "lucide-react";

import { AuthCard, AuthSocialLoginSection, useRegisterFormRHF } from "@features/auth";

import { registerAction, startGoogleOAuth } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
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

function RegisterForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("redirectTo") ?? "/";
  const { form, onSubmit, isPending } = useRegisterFormRHF(registerAction, {
    enableFocusManagement: true,
  });

  return (
    <AuthCard title="アカウント作成" description="みんなの集金アカウントを作成してください">
      <div className="flex flex-col gap-6">
        <AuthSocialLoginSection next={next} googleAction={startGoogleOAuth} />

        <Form {...form}>
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-4 sm:gap-6"
            noValidate
            data-testid="register-form"
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ユーザーネーム</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      placeholder="ユーザーネームを入力"
                      disabled={isPending}
                      autoComplete="name"
                      required
                      data-testid="name-input"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            {form.formState.errors.root && (
              <div className="rounded border border-destructive/20 bg-destructive/10 px-4 py-3 text-destructive">
                {form.formState.errors.root.message}
              </div>
            )}

            <div className="flex flex-col gap-2">
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

            <p className="text-center text-xs text-muted-foreground">
              送信することで、
              <Link
                href="/terms"
                prefetch={false}
                className="text-primary underline hover:text-primary/80"
                target="_blank"
                rel="noopener noreferrer"
              >
                利用規約
              </Link>
              と
              <Link
                href="/privacy"
                prefetch={false}
                className="text-primary underline hover:text-primary/80"
                target="_blank"
                rel="noopener noreferrer"
              >
                プライバシーポリシー
              </Link>
              に同意したものとみなされます。
            </p>

            <div className="text-center text-xs text-muted-foreground sm:text-sm">
              すでにアカウントをお持ちの方は{" "}
              <Link
                href="/login"
                className="rounded text-primary underline hover:text-primary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              >
                ログイン
              </Link>
            </div>
          </form>
        </Form>
      </div>
    </AuthCard>
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
