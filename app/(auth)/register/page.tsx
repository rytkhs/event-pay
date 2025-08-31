"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useRegisterFormRHF } from "@features/auth/hooks/useAuthForm";
import { registerAction } from "@/app/(auth)/actions";

export default function RegisterPage() {
  const { form, onSubmit, isPending } = useRegisterFormRHF(registerAction, {
    enableFocusManagement: true,
  });

  // パスワード強度の表示
  const password = form.watch("password");
  const passwordConfirm = form.watch("passwordConfirm");

  const getPasswordStrength = (password: string) => {
    if (!password) return { level: 0, text: "", color: "text-gray-500", feedback: "" };

    let score = 0;
    const feedback = [];

    if (password.length >= 8) score += 1;
    else feedback.push("8文字以上");

    if (/[A-Z]/.test(password)) score += 1;
    else feedback.push("大文字");

    if (/[a-z]/.test(password)) score += 1;
    else feedback.push("小文字");

    if (/\d/.test(password)) score += 1;
    else feedback.push("数字");

    const levels = [
      { level: 0, text: "弱い", color: "text-red-500" },
      { level: 1, text: "弱い", color: "text-red-500" },
      { level: 2, text: "普通", color: "text-yellow-500" },
      { level: 3, text: "強い", color: "text-green-500" },
      { level: 4, text: "とても強い", color: "text-green-600" },
    ];

    return {
      ...levels[score],
      feedback: feedback.length > 0 ? `必要: ${feedback.join(", ")}` : "OK",
    };
  };

  const passwordStrength = getPasswordStrength(password);

  return (
    <>
      <main className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md space-y-8">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold">会員登録</CardTitle>
              <CardDescription className="text-sm">
                EventPayアカウントを作成してください
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form
                  onSubmit={onSubmit}
                  className="space-y-6"
                  noValidate
                  data-testid="register-form"
                >
                  {/* 名前 */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>名前</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="text"
                            placeholder="山田太郎"
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
                          <Input
                            {...field}
                            type="password"
                            placeholder="パスワードを入力"
                            disabled={isPending}
                            autoComplete="new-password"
                            required
                            data-testid="password-input"
                          />
                        </FormControl>
                        {password && (
                          <div className="text-sm">
                            <span className={`font-medium ${passwordStrength.color}`}>
                              強度: {passwordStrength.text}
                            </span>
                            {passwordStrength.feedback !== "OK" && (
                              <span className="text-gray-600 ml-2">
                                ({passwordStrength.feedback})
                              </span>
                            )}
                          </div>
                        )}
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
                          <Input
                            {...field}
                            type="password"
                            placeholder="パスワードを再度入力"
                            disabled={isPending}
                            autoComplete="new-password"
                            required
                            data-testid="password-confirm-input"
                          />
                        </FormControl>
                        {passwordConfirm && password && passwordConfirm !== password && (
                          <div className="text-sm text-red-500">パスワードが一致しません</div>
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
                              className="text-blue-600 hover:text-blue-500 underline"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              利用規約
                            </Link>
                            に同意します
                          </FormLabel>
                          <div id="terms-description" className="text-xs text-gray-600">
                            EventPayをご利用いただくには利用規約への同意が必要です
                          </div>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* 全体エラーメッセージ */}
                  {form.formState.errors.root && (
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                      {form.formState.errors.root.message}
                    </div>
                  )}

                  {/* 利用規約エラーメッセージ */}
                  {form.formState.errors.termsAgreed && (
                    <div
                      className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded"
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

                  <div className="text-center text-sm text-gray-600">
                    すでにアカウントをお持ちの方は{" "}
                    <Link
                      href="/login"
                      className="text-blue-600 hover:text-blue-500 underline focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded"
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

      <footer className="text-center text-sm text-gray-600 py-4" role="contentinfo">
        <p>EventPay - 小規模コミュニティ向けイベント出欠管理・集金ツール</p>
      </footer>
    </>
  );
}
