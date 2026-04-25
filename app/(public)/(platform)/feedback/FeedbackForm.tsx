"use client";

import Link from "next/link";

import {
  Bug,
  CheckCircle2,
  Lightbulb,
  Mail,
  MapPin,
  MessageCircle,
  SmilePlus,
  User,
} from "lucide-react";

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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

import { useFeedbackForm } from "./useFeedbackForm";

const feedbackCategoryOptions = [
  {
    value: "feature_request",
    label: "機能要望",
    description: "こんな機能があると助かる、という提案",
    icon: Lightbulb,
  },
  {
    value: "bug_report",
    label: "不具合報告",
    description: "動きがおかしい、表示が崩れるなどの報告",
    icon: Bug,
  },
  {
    value: "usability",
    label: "使いにくい点",
    description: "迷った操作、わかりづらかった言葉や画面",
    icon: SmilePlus,
  },
  {
    value: "other",
    label: "その他",
    description: "上記に当てはまらない気づき",
    icon: MessageCircle,
  },
] as const;

export function FeedbackForm() {
  const { form, onSubmit, isPending, isSuccess, resetSuccess } = useFeedbackForm();

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle as="h2" className="text-xl sm:text-2xl">
          フィードバックフォーム
        </CardTitle>
        <CardDescription className="text-xs sm:text-sm">
          返信が必要な場合だけ、メールアドレスを入力してください。
        </CardDescription>
      </CardHeader>

      <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
        {isSuccess ? (
          <div className="space-y-6 py-6 text-center sm:py-8">
            <div className="flex justify-center">
              <CheckCircle2 className="h-16 w-16 text-green-600" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold text-foreground">送信完了</h2>
              <p className="text-muted-foreground">フィードバックを受け付けました。</p>
            </div>
            <div className="flex flex-col justify-center gap-4 sm:flex-row">
              <Button variant="outline" asChild>
                <Link href="/">トップページへ</Link>
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
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      種別 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <RadioGroup
                        value={field.value}
                        onValueChange={field.onChange}
                        className="grid gap-3 sm:grid-cols-2"
                        disabled={isPending}
                        data-testid="feedback-category-radio-group"
                      >
                        {feedbackCategoryOptions.map((option) => {
                          const Icon = option.icon;
                          const selected = field.value === option.value;

                          return (
                            <FormItem
                              key={option.value}
                              className={`relative space-y-0 rounded-md border transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ${
                                selected
                                  ? "border-primary bg-primary/5"
                                  : "border-border bg-background hover:bg-muted/50"
                              }`}
                            >
                              <FormControl>
                                <RadioGroupItem
                                  id={`feedback-category-${option.value}`}
                                  value={option.value}
                                  className="absolute inset-0 z-10 h-full w-full cursor-pointer rounded-md border-0 opacity-0"
                                  data-testid={`feedback-category-${option.value}`}
                                />
                              </FormControl>
                              <div className="pointer-events-none flex h-full gap-2 p-3 sm:gap-3 sm:p-4">
                                <span
                                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                                    selected
                                      ? "bg-primary text-primary-foreground"
                                      : "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  <Icon className="h-5 w-5" aria-hidden="true" />
                                </span>
                                <span className="space-y-1">
                                  <span className="block font-semibold text-foreground">
                                    {option.label}
                                  </span>
                                  <span className="block text-xs leading-5 text-muted-foreground">
                                    {option.description}
                                  </span>
                                </span>
                              </div>
                            </FormItem>
                          );
                        })}
                      </RadioGroup>
                    </FormControl>
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
                      内容 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder={
                          "気づいたことをそのまま書いてください\n例：〇〇が使いにくい。〇〇の機能がほしい。"
                        }
                        disabled={isPending}
                        rows={6}
                        className="min-h-[120px] resize-none sm:min-h-[200px]"
                        data-testid="feedback-message-input"
                      />
                    </FormControl>
                    <FormDescription>10文字以上、4000文字以内でご記入ください</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="pageContext"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      画面名・URL <span className="text-muted-foreground">（任意）</span>
                    </FormLabel>
                    <FormControl>
                      <div className="relative">
                        <MapPin
                          className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Input
                          {...field}
                          type="text"
                          placeholder="例：イベント作成画面、/events/create"
                          disabled={isPending}
                          className="pl-9"
                          data-testid="feedback-page-context-input"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        お名前 <span className="text-muted-foreground">（任意）</span>
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
                            placeholder="任意"
                            disabled={isPending}
                            className="pl-9"
                            data-testid="feedback-name-input"
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
                        メールアドレス <span className="text-muted-foreground">（任意）</span>
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
                            placeholder="返信が必要な場合のみ"
                            disabled={isPending}
                            autoComplete="email"
                            className="pl-9"
                            data-testid="feedback-email-input"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

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
                        data-testid="feedback-consent-checkbox"
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
                      <FormDescription>入力内容はサービス改善のために利用されます</FormDescription>
                      <FormMessage />
                    </div>
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={isPending}
                className="w-full"
                data-testid="feedback-submit-button"
              >
                {isPending ? "送信中..." : "フィードバックを送信する"}
              </Button>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}
