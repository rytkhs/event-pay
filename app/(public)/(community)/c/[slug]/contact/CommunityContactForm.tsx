"use client";

import Link from "next/link";

import { CheckCircle2, Mail, MessageSquare, User } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

import { useCommunityContactForm } from "./useCommunityContactForm";

export function CommunityContactForm(props: { communitySlug: string }) {
  const { communitySlug } = props;
  const { form, onSubmit, isPending, isSuccess, resetSuccess } =
    useCommunityContactForm(communitySlug);

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="text-lg sm:text-2xl">
          主催者へのお問い合わせ
        </CardTitle>
      </CardHeader>

      <CardContent>
        {isSuccess ? (
          <div className="space-y-6 py-8 text-center">
            <div className="flex justify-center">
              <CheckCircle2 className="h-16 w-16 text-green-600" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">送信完了</h2>
              <p className="text-muted-foreground">お問い合わせを受け付けました。</p>
            </div>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button variant="outline" asChild>
                <Link href={`/c/${communitySlug}`}>コミュニティページへ戻る</Link>
              </Button>
              <Button onClick={resetSuccess}>続けて送信する</Button>
            </div>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-6" noValidate>
              {form.formState.errors.root && (
                <Alert variant="destructive">
                  <AlertDescription>{form.formState.errors.root.message}</AlertDescription>
                </Alert>
              )}

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
                        />
                      </div>
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
                        />
                      </div>
                    </FormControl>
                    <FormDescription>返信先メールアドレスを入力してください</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                          rows={8}
                          className="pl-9 resize-none"
                        />
                      </div>
                    </FormControl>
                    <FormDescription>10文字以上、4000文字以内でご記入ください</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="consent"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                    <FormControl>
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={isPending}
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
                        入力内容は主催者への連絡のために利用されます
                      </FormDescription>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "送信中..." : "送信する"}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
