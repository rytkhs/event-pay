"use client";

export const dynamic = "force-dynamic";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useFormStatus } from "react-dom";

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

import { startGoogleOAuth } from "../login/actions";

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

function GoogleSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      className="w-full mb-4 sm:mb-6 flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-900 border-gray-300 font-medium transition-colors"
      disabled={pending}
      aria-label={pending ? `${label}中` : label}
    >
      {pending ? (
        <>
          <LoadingSpinner />
          <span>{label}中...</span>
        </>
      ) : (
        <>
          <GoogleIcon />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}

export default function RegisterPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("redirectTo") ?? "/";
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
                アカウント作成
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
              <div className="flex items-center my-6">
                <div className="h-px flex-1 bg-border" />
                <span className="mx-3 text-xs text-muted-foreground">または</span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <form action={startGoogleOAuth} className="space-y-4">
                <input type="hidden" name="next" value={next} />
                <GoogleSubmitButton label="Googleでアカウントを作成" />
              </form>
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
