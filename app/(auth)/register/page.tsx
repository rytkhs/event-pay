"use client";

import Link from "next/link";

export const dynamic = "force-dynamic";

import { registerAction } from "@core/actions/auth";

import { useRegisterFormRHF } from "@features/auth";

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

export default function RegisterPage() {
  const { form, onSubmit, isPending } = useRegisterFormRHF(registerAction, {
    enableFocusManagement: true,
  });

  const password = form.watch("password");
  const passwordConfirm = form.watch("passwordConfirm");

  return (
    <>
      <main className="min-h-screen flex items-center justify-center bg-muted/30 py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <Card>
            <CardHeader className="text-center">
              <CardTitle as="h1" className="text-2xl sm:text-3xl font-bold">
                会員登録
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                みんなの集金アカウントを作成してください
              </CardDescription>
            </CardHeader>
            <CardContent>
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* パスワード確認 */}
                  <FormField
                    control={form.control}
                    name="passwordConfirm"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>パスワード確認</FormLabel>
                        <FormControl>
                          <PasswordInput
                            {...field}
                            placeholder="パスワードを再度入力"
                            disabled={isPending}
                            autoComplete="new-password"
                            required
                            data-testid="password-confirm-input"
                          />
                        </FormControl>
                        {passwordConfirm && password && passwordConfirm !== password && (
                          <div className="text-sm text-destructive">パスワードが一致しません</div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 利用規約同意 */}
                  <FormField
                    control={form.control}
                    name="termsAgreed"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={isPending}
                            aria-required="true"
                            aria-describedby="terms-description"
                            data-testid="terms-checkbox"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                            <Link
                              href="/terms"
                              className="text-primary hover:text-primary/80 underline"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              利用規約
                            </Link>
                            に同意します
                          </FormLabel>
                          <div id="terms-description" className="text-xs text-muted-foreground">
                            みんなの集金をご利用いただくには利用規約への同意が必要です
                          </div>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* 全体エラーメッセージ */}
                  {form.formState.errors.root && (
                    <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded">
                      {form.formState.errors.root.message}
                    </div>
                  )}

                  {/* 利用規約エラーメッセージ */}
                  {form.formState.errors.termsAgreed && (
                    <div
                      className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded"
                      data-testid="terms-error"
                    >
                      {form.formState.errors.termsAgreed.message}
                    </div>
                  )}

                  {/* 送信ボタン */}
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isPending}
                    data-testid="submit-button"
                  >
                    {isPending ? "登録中..." : "アカウントを作成"}
                  </Button>

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
