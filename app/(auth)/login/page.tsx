"use client";

import { Suspense } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

import { LINE_ERROR_MESSAGES } from "@core/auth/line-error-messages";

import { AuthCard, AuthSocialLoginSection, useLoginFormRHF } from "@features/auth";

import { loginAction, startGoogleOAuth } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
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

function LoginForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get("redirectTo") ?? "/dashboard";
  const errorCode = searchParams.get("error");
  const errorMessage = errorCode ? LINE_ERROR_MESSAGES[errorCode] : null;

  const { form, onSubmit, isPending } = useLoginFormRHF(loginAction, {
    enableFocusManagement: true,
  });

  return (
    <AuthCard title="ログイン" description="みんなの集金アカウントにログインしてください">
      <div className="flex flex-col gap-6">
        <AuthSocialLoginSection
          next={next}
          googleAction={startGoogleOAuth}
          oauthErrorMessage={errorMessage}
        />

        <Form {...form}>
          <form
            onSubmit={onSubmit}
            className="flex flex-col gap-4 sm:gap-6"
            noValidate
            data-testid="login-form"
          >
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

            <div className="flex items-center justify-end text-xs sm:text-sm">
              <Link
                href="/reset-password"
                prefetch={false}
                className="rounded text-primary underline hover:text-primary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              >
                パスワードを忘れた方
              </Link>
            </div>

            {form.formState.errors.root && (
              <div
                className="rounded border border-destructive/20 bg-destructive/10 px-4 py-3 text-destructive"
                data-testid="error-message"
              >
                {form.formState.errors.root.message}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "ログイン中..." : "ログイン"}
            </Button>

            <div className="text-center text-xs text-muted-foreground sm:text-sm">
              アカウントをお持ちでない方は{" "}
              <Link
                href="/register"
                className="rounded text-primary underline hover:text-primary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
              >
                アカウントを作成
              </Link>
            </div>
          </form>
        </Form>
      </div>
    </AuthCard>
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
