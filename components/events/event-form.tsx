"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useEventForm } from "@/hooks/use-event-form";

/**
 * react-hook-formを使用したイベント作成フォーム
 */
export default function EventCreateForm() {
  const { form, onSubmit, isPending, hasErrors, isFreeEvent } = useEventForm();

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>イベント作成</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-8" noValidate>
            {/* 基本情報セクション */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">基本情報</h3>
                <p className="text-sm text-gray-500">イベントの基本的な情報を入力してください</p>
              </div>

              {/* イベントタイトル */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>イベントタイトル *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="例：月例勉強会"
                        disabled={isPending}
                        maxLength={100}
                      />
                    </FormControl>
                    <FormDescription>
                      イベントのタイトルを入力してください（100文字以内）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 開催日時 */}
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>開催日時 *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="datetime-local"
                        disabled={isPending}
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </FormControl>
                    <FormDescription>イベントの開催日時を選択してください</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 場所 */}
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>場所</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="例：東京都渋谷区..."
                        disabled={isPending}
                        maxLength={200}
                      />
                    </FormControl>
                    <FormDescription>
                      イベントの開催場所を入力してください（200文字以内）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 説明 */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>説明</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="イベントの詳細な説明を入力してください"
                        disabled={isPending}
                        rows={4}
                        maxLength={1000}
                      />
                    </FormControl>
                    <FormDescription>
                      イベントの詳細な説明を入力してください（1000文字以内）
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 定員 */}
              <FormField
                control={form.control}
                name="capacity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>定員</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        placeholder="例：30"
                        disabled={isPending}
                        min="1"
                        max="10000"
                      />
                    </FormControl>
                    <FormDescription>イベントの定員を入力してください（1-10000人）</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 締切設定セクション */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">締切設定</h3>
                <p className="text-sm text-gray-500">参加申込と決済の締切を設定してください</p>
              </div>

              {/* 参加申込締切 */}
              <FormField
                control={form.control}
                name="registration_deadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>参加申込締切</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="datetime-local"
                        disabled={isPending}
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </FormControl>
                    <FormDescription>参加申込の締切日時を設定してください</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 決済締切 */}
              <FormField
                control={form.control}
                name="payment_deadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>決済締切</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="datetime-local"
                        disabled={isPending}
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </FormControl>
                    <FormDescription>決済の締切日時を設定してください</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 決済方法セクション */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">決済方法</h3>
                <p className="text-sm text-gray-500">
                  参加者が利用できる決済方法を選択してください
                </p>
              </div>

              {/* 参加費 */}
              <FormField
                control={form.control}
                name="fee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>参加費 *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="number"
                        placeholder="例：1000"
                        disabled={isPending}
                        min="0"
                        max="1000000"
                      />
                    </FormControl>
                    <FormDescription>参加費を入力してください（0-1000000円）</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 決済方法選択 - 条件付き表示 */}
              {!isFreeEvent && (
                <FormField
                  control={form.control}
                  name="payment_methods"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>利用可能な決済方法 *</FormLabel>
                      <div className="space-y-2" data-testid="payment-methods">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="stripe"
                            checked={field.value?.includes("stripe")}
                            onCheckedChange={(checked) => {
                              const currentMethods = field.value || [];
                              if (checked) {
                                field.onChange([...currentMethods, "stripe"]);
                              } else {
                                field.onChange(
                                  currentMethods.filter((method) => method !== "stripe")
                                );
                              }
                            }}
                            disabled={isPending}
                          />
                          <label
                            htmlFor="stripe"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            オンライン決済（Stripe）
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="cash"
                            checked={field.value?.includes("cash")}
                            onCheckedChange={(checked) => {
                              const currentMethods = field.value || [];
                              if (checked) {
                                field.onChange([...currentMethods, "cash"]);
                              } else {
                                field.onChange(
                                  currentMethods.filter((method) => method !== "cash")
                                );
                              }
                            }}
                            disabled={isPending}
                          />
                          <label
                            htmlFor="cash"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            現金決済
                          </label>
                        </div>
                      </div>
                      <FormDescription>有料イベントでは決済方法の選択が必要です</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* 無料イベント用の説明 */}
              {isFreeEvent && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
                  <p className="text-sm">ℹ️ 参加費が0円のため、決済方法の設定は不要です。</p>
                </div>
              )}
            </div>

            {/* 全体のエラーメッセージ */}
            {form.formState.errors.root && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {form.formState.errors.root.message}
              </div>
            )}

            {/* 送信ボタン */}
            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => form.reset()}
                disabled={isPending}
              >
                リセット
              </Button>
              <Button type="submit" disabled={isPending || hasErrors} className="min-w-[120px]">
                {isPending ? "作成中..." : "イベントを作成"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
