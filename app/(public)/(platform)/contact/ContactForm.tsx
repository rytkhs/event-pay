"use client";

import Link from "next/link";

import { CheckCircle2, Mail, MessageSquare, User } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Textarea } from "@/components/ui/textarea";

import { useContactForm } from "./useContactForm";

export function ContactForm() {
  const { form, onSubmit, isPending, isSuccess, resetSuccess } = useContactForm();

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle as="h2" className="text-xl sm:text-2xl">
          お問い合わせフォーム
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          フォームに必要事項をご記入の上、送信してください。
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        {isSuccess ? (
          // 送信完了メッセージ
          <div className="space-y-6 py-6 text-center sm:py-8">
            <div className="flex justify-center">
              <CheckCircle2 className="h-16 w-16 text-green-600" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">送信完了</h2>
              <p className="text-muted-foreground">お問い合わせを受け付けました。</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button variant="outline" asChild>
                <Link href="/">トップページへ</Link>
              </Button>
              <Button onClick={resetSuccess}>続けて送信する</Button>
            </div>
          </div>
        ) : (
          // フォーム
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-6" noValidate>
              {/* ルートエラー（レート制限など） */}
              {form.formState.errors.root && (
                <Alert variant="destructive">
                  <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                </Alert>
              )}

              {/* 氏名 */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      氏名 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User
                          className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          {...field}
                          type="text"
                          placeholder="山田 太郎"
                          disabled={isPending}
                          className="pl-9"
                          data-testid="contact-name-input"
                        />
                      </div>
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
                    <FormLabel>
                      メールアドレス <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail
                          className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          {...field}
                          type="email"
                          placeholder="example@mail.com"
                          disabled={isPending}
                          autoComplete="email"
                          className="pl-9"
                          data-testid="contact-email-input"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>ご返信先のメールアドレスをご入力ください</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* お問い合わせ内容 */}
              <FormField
                control={form.control}
                name="message"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      お問い合わせ内容 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MessageSquare
                          className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Textarea
                          {...field}
                          placeholder="お問い合わせ内容をご記入ください"
                          disabled={isPending}
                          rows={6}
                          className="min-h-[120px] pl-9 resize-none sm:min-h-[200px]"
                          data-testid="contact-message-input"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>10文字以上、4000文字以内でご記入ください</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* プライバシーポリシー同意 */}
              <FormField
                control={form.control}
                name="consent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-3 sm:p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
                        data-testid="contact-consent-checkbox"
                      />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>
                        <Link
                          href="/privacy"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          プライバシーポリシー
                        </Link>
                        に同意します <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormDescription>
                        お問い合わせ内容は、ご返信のためにのみ使用します
                      </FormDescription>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />

              {/* 送信ボタン */}
              <div className="flex flex-col gap-4">
                <Button
                  type="submit"
                  disabled={isPending}
                  className="w-full"
                  data-testid="contact-submit-button"
                >
                  {isPending ? "送信中..." : "送信する"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
