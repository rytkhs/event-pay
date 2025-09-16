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

export default function LoginPage() {
  const { form, onSubmit, isPending } = useLoginFormRHF(loginAction, {
    enableFocusManagement: true,
  });

  return (
    <>
      <main className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold">ログイン</CardTitle>
              <CardDescription className="text-sm">
                みんなの集金アカウントにログインしてください
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={onSubmit} className="space-y-6" noValidate data-testid="login-form">
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
                          <Input
                            {...field}
                            type="password"
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

                  <div className="flex items-center justify-between text-sm">
                    <div></div>
                    <Link
                      href="/reset-password"
                      className="text-blue-600 hover:text-blue-500 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
                    >
                      パスワードを忘れた方
                    </Link>
                  </div>

                  {/* 全体エラーメッセージ */}
                  {form.formState.errors.root && (
                    <div
                      className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded"
                      data-testid="error-message"
                    >
                      {form.formState.errors.root.message}
                    </div>
                  )}

                  {/* 送信ボタン */}
                  <Button type="submit" className="w-full" disabled={isPending}>
                    {isPending ? "ログイン中..." : "ログイン"}
                  </Button>

                  <div className="text-center text-sm text-gray-600">
                    アカウントをお持ちでない方は{" "}
                    <Link
                      href="/register"
                      className="text-blue-600 hover:text-blue-500 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
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

      <footer className="text-center text-sm text-gray-600 py-4" role="contentinfo">
        <p>みんなの集金 - 出欠も集金も、ひとつのリンクで完了</p>
      </footer>
    </>
  );
}
