/**
 * Stripe 入金設定オンボーディングフォームコンポーネント
 */

"use client";

import { useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, CreditCard, Shield, Zap, Globe, FileText, Copy, CheckCircle } from "lucide-react";
import { useForm } from "react-hook-form";

import { logger } from "@core/logging/app-logger";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

import {
  OnboardingPrefillSchema,
  getDefaultPrefillValues,
  PRODUCT_DESCRIPTION_TEMPLATES,
  type OnboardingPrefillInput,
} from "../schemas/onboarding-prefill";

interface OnboardingFormProps {
  refreshUrl: string;
  returnUrl: string;
  onPrefillAndStart: (formData: FormData) => Promise<void>;
}

export function OnboardingForm({ refreshUrl, returnUrl, onPrefillAndStart }: OnboardingFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [copiedTemplate, setCopiedTemplate] = useState<number | null>(null);

  const form = useForm<OnboardingPrefillInput>({
    resolver: zodResolver(OnboardingPrefillSchema),
    defaultValues: {
      ...getDefaultPrefillValues(),
      refreshUrl,
      returnUrl,
    },
  });

  const watchHasWebsite = form.watch("hasWebsite");
  const watchProductDescription = form.watch("productDescription");

  const handleSubmit = async (data: OnboardingPrefillInput) => {
    setIsLoading(true);
    try {
      // FormDataに変換してServer Actionに渡す
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });

      await onPrefillAndStart(formData);
    } catch (error) {
      logger.error("Prefill onboarding start error", {
        tag: "prefillOnboardingStartError",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error),
      });
      setIsLoading(false);
    }
  };

  const insertTemplate = (templateIndex: number) => {
    const template = PRODUCT_DESCRIPTION_TEMPLATES[templateIndex];
    form.setValue("productDescription", template);
    setCopiedTemplate(templateIndex);
    setTimeout(() => setCopiedTemplate(null), 2000);
  };

  const getMccPresetOptions = () => [
    { value: "other", label: "Stripeで選択" },
    { value: "business_services", label: "イベント・コミュニティ運営" },
    { value: "membership_org", label: "会員制組織・クラブ" },
    { value: "recreation_services", label: "スポーツ・レクリエーション" },
    { value: "educational_services", label: "教育・研修サービス" },
    { value: "software_services", label: "ソフトウェア・技術サービス" },
  ];

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Stripe 入金設定
        </CardTitle>
        <CardDescription>
          オンライン決済の売上を受け取るため、Stripeの設定が必要です。
          <br />
          初回設定は約3〜5分で完了し、途中保存もできます。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8">
        {/* 簡単な説明 */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col items-center text-center p-4 border rounded-lg">
            <Shield className="h-8 w-8 text-blue-500 mb-2" />
            <h3 className="font-semibold mb-1">安全な決済</h3>
            <p className="text-sm text-muted-foreground">Stripeの安全な決済システム</p>
          </div>
          <div className="flex flex-col items-center text-center p-4 border rounded-lg">
            <Zap className="h-8 w-8 text-green-500 mb-2" />
            <h3 className="font-semibold mb-1">自動送金</h3>
            <p className="text-sm text-muted-foreground">オンライン決済を自動受取</p>
          </div>
          <div className="flex flex-col items-center text-center p-4 border rounded-lg">
            <CreditCard className="h-8 w-8 text-purple-500 mb-2" />
            <h3 className="font-semibold mb-1">簡単管理</h3>
            <p className="text-sm text-muted-foreground">収支状況をダッシュボードで確認</p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
            {/* 業種選択 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-semibold">業種を選択してください</Label>
                <p className="text-sm text-muted-foreground">最も近いものを選択してください。</p>
              </div>
              <FormField
                control={form.control}
                name="mccPreset"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        value={field.value}
                        className="grid gap-3 md:grid-cols-2"
                      >
                        {getMccPresetOptions().map((option) => (
                          <div key={option.value} className="flex items-center space-x-2">
                            <RadioGroupItem value={option.value} id={option.value} />
                            <Label
                              htmlFor={option.value}
                              className="text-sm font-normal cursor-pointer flex-1"
                            >
                              {option.label}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 「その他」を選んだ場合も、MCCはStripe Onboardingで選択してもらうため入力欄は表示しません */}
            </div>

            <hr className="border-t" />

            {/* ウェブサイト有無の選択 */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-base font-semibold">
                  ウェブサイト・SNSアカウントについて
                </Label>
                <p className="text-sm text-muted-foreground">
                  団体・サークルのウェブサイトもしくはSNSアカウントをお持ちですか？
                </p>
              </div>
              <FormField
                control={form.control}
                name="hasWebsite"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <RadioGroup
                        onValueChange={(value) => field.onChange(value === "true")}
                        value={field.value ? "true" : "false"}
                        className="flex gap-6"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="true" id="has-website-yes" />
                          <Label
                            htmlFor="has-website-yes"
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Globe className="h-4 w-4" />
                            ウェブサイト・SNSアカウントがある
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="false" id="has-website-no" />
                          <Label
                            htmlFor="has-website-no"
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <FileText className="h-4 w-4" />
                            持っていない
                          </Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ウェブサイトURL入力 */}
            {watchHasWebsite && (
              <FormField
                control={form.control}
                name="websiteUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>ウェブサイト・SNSアカウントURL</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="url"
                        placeholder="https://example.com"
                        className="font-mono text-sm"
                      />
                    </FormControl>
                    <FormDescription>
                      公式ウェブサイト、SNSアカウント、モバイルアプリ、いずれかのURLをご入力ください。
                      {process.env.NODE_ENV === "production" && (
                        <Badge variant="secondary" className="ml-2">
                          HTTPS必須
                        </Badge>
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* 商品説明入力 */}
            {!watchHasWebsite && (
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="productDescription"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>活動内容の説明</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="どのような活動を行い、どのような集金を行うかを具体的に説明してください..."
                          className="min-h-[100px] resize-y"
                          maxLength={280}
                        />
                      </FormControl>
                      <FormDescription>
                        活動の目的、頻度、参加費の用途などを含めてください（30〜280文字）
                        {watchProductDescription && (
                          <div className="mt-1">
                            <Badge
                              variant={
                                watchProductDescription.length >= 30 ? "default" : "secondary"
                              }
                            >
                              {watchProductDescription.length}/280文字
                            </Badge>
                          </div>
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* テンプレート */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">
                    テンプレートを使う（クリックで挿入）
                  </Label>
                  <div className="grid gap-2">
                    {PRODUCT_DESCRIPTION_TEMPLATES.map((template, index) => (
                      <Button
                        key={index}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="justify-start h-auto p-3 text-left"
                        onClick={() => insertTemplate(index)}
                      >
                        <div className="flex items-start gap-2">
                          {copiedTemplate === index ? (
                            <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <Copy className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          )}
                          <span className="text-sm">{template}</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <hr className="border-t" />

            {/* 注意事項 */}
            <Alert>
              <AlertDescription>
                <strong>ご準備いただくもの：</strong>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>• 本人確認書類（運転免許証、パスポートなど）</li>
                  <li>• 銀行口座情報（Stripeのページで入力します）</li>
                  <li>• 所要時間：約3〜5分（途中保存可能）</li>
                </ul>
              </AlertDescription>
            </Alert>

            {/* 送信ボタン */}
            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  設定を開始しています...
                </>
              ) : (
                "Stripeで設定を始める"
              )}
            </Button>
          </form>
        </Form>

        {/* 補足説明 */}
        <div className="text-sm text-muted-foreground space-y-2 border-t pt-6">
          <p>
            <strong>プライバシーについて：</strong>
            お客様の個人情報は、Stripeの厳格なセキュリティ基準に従って保護されます。
          </p>
          <p>
            <strong>手数料について：</strong>
            Stripe決済手数料（3.6%）がオンライン決済の売上から差し引かれます。プラットフォーム手数料は現在無料です。
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
