"use client";

import Link from "next/link";

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

export default function LoginPage() {
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
                      会員登録
                    </Link>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer
        className="text-center text-xs sm:text-sm text-muted-foreground py-4"
        role="contentinfo"
      >
        <p>みんなの集金 - 出欠から集金まで、ひとつのリンクで完了</p>
      </footer>
    </>
  );
}
