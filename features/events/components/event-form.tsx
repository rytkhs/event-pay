"use client";

import { useEffect, useState } from "react";

import { format } from "date-fns-tz";

import { getCurrentJstTime } from "@core/utils/timezone";

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

import { useEventForm } from "../hooks/use-event-form";

/**
 * react-hook-formを使用したイベント作成フォーム
 */
function EventCreateForm(): JSX.Element {
  const { form, onSubmit, isPending, isFreeEvent } = useEventForm();

  // SSR不整合を避けるため、datetime-localのmin値をクライアント側で設定
  const [minDatetimeLocal, setMinDatetimeLocal] = useState<string | undefined>(undefined);

  useEffect(() => {
    const now = getCurrentJstTime();
    // 1時間後
    now.setHours(now.getHours() + 1);
    // 'YYYY-MM-DDTHH:mm'形式に変換
    const minValue = format(now, "yyyy-MM-dd'T'HH:mm", { timeZone: "Asia/Tokyo" });
    setMinDatetimeLocal(minValue);
  }, []);

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
                    <FormLabel>イベント *</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="例：月例勉強会、夏合宿、会費の集金など"
                        disabled={isPending}
                        maxLength={100}
                      />
                    </FormControl>
                    <FormDescription>イベントのタイトルを入力してください</FormDescription>
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
                        min={minDatetimeLocal}
                      />
                    </FormControl>
                    <FormDescription>イベントの開催日時を設定してください</FormDescription>
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
                    <FormDescription>イベントの開催場所を入力してください (任意)</FormDescription>
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
                    <FormLabel>説明・備考など</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="イベントの詳細な説明を入力してください"
                        disabled={isPending}
                        rows={4}
                        maxLength={1000}
                      />
                    </FormControl>
                    <FormDescription>イベントの詳細な説明を入力してください (任意)</FormDescription>
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
                        placeholder="例：60"
                        disabled={isPending}
                        min="1"
                        max="10000"
                      />
                    </FormControl>
                    <FormDescription>イベントの定員を入力してください (任意)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 締切設定セクション */}
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">締切設定</h3>
                <p className="text-sm text-gray-500">
                  参加申込とオンライン決済の締切を設定してください (任意)
                </p>
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
                        min={minDatetimeLocal}
                      />
                    </FormControl>
                    <FormDescription>参加申込の締切日時を設定してください (任意)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* オンライン決済締切 */}
              <FormField
                control={form.control}
                name="payment_deadline"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>オンライン決済締切</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="datetime-local"
                        disabled={isPending}
                        min={minDatetimeLocal}
                      />
                    </FormControl>
                    <FormDescription>
                      オンライン決済の締切日時を設定してください (任意)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* 締切後もオンライン決済を許可 + 猶予（日） */}
              {!isFreeEvent && form.watch("payment_deadline") && (
                <div className="space-y-3">
                  <FormField
                    control={form.control}
                    name="allow_payment_after_deadline"
                    render={() => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            checked={Boolean(form.watch("allow_payment_after_deadline"))}
                            onCheckedChange={(checked) => {
                              form.setValue("allow_payment_after_deadline", checked === true);
                              // 相関バリデーション再評価
                              void form.trigger();
                            }}
                            disabled={isPending}
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel>締切後もオンライン決済を許可</FormLabel>
                          <FormDescription>
                            終了後も支払いを受け付けます（最長30日まで）。
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  {form.watch("allow_payment_after_deadline") && (
                    <FormField
                      control={form.control}
                      name="grace_period_days"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>猶予（日）</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              inputMode="numeric"
                              min="0"
                              max="30"
                              step="1"
                              placeholder="例：7"
                              disabled={isPending}
                              onChange={(e) => {
                                const v = e.target.value;
                                field.onChange(v);
                                void form.trigger();
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            オンライン決済締切からの猶予日数（最大30日）。
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}
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
                        placeholder="例：3000"
                        disabled={isPending}
                        min="0"
                        max="1000000"
                      />
                    </FormControl>
                    <FormDescription>参加費を入力してください</FormDescription>
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
                            checked={Array.isArray(field.value) && field.value.includes("stripe")}
                            onCheckedChange={(checked: boolean) => {
                              // Radix UI Checkboxの三状態を正規化
                              const isChecked = checked === true;
                              const currentMethods = Array.isArray(field.value) ? field.value : [];
                              const newMethods = isChecked
                                ? Array.from(new Set([...currentMethods, "stripe"]))
                                : currentMethods.filter((method) => method !== "stripe");

                              field.onChange(newMethods);
                              // 相関バリデーション: 全体を再検証（payment_methods依存の.refineを更新）
                              void form.trigger();
                            }}
                            disabled={isPending}
                          />
                          <label
                            htmlFor="stripe"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            オンライン決済
                          </label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="cash"
                            checked={Array.isArray(field.value) && field.value.includes("cash")}
                            onCheckedChange={(checked: boolean) => {
                              // Radix UI Checkboxの三状態を正規化
                              const isChecked = checked === true;
                              const currentMethods = Array.isArray(field.value) ? field.value : [];
                              const newMethods = isChecked
                                ? Array.from(new Set([...currentMethods, "cash"]))
                                : currentMethods.filter((method) => method !== "cash");

                              field.onChange(newMethods);
                              // 相関バリデーション: 全体を再検証（payment_methods依存の.refineを更新）
                              void form.trigger();
                            }}
                            disabled={isPending}
                          />
                          <label
                            htmlFor="cash"
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            現金
                          </label>
                        </div>
                      </div>
                      <FormDescription>
                        有料イベントでは決済方法の選択が必要です。
                        <br />
                        現金の場合は当日会場などで集金してください。
                        <br />
                        オンライン決済の場合はクレジットカード、Apple Pay、 Google
                        Payなどが利用できます。
                      </FormDescription>
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
              <Button
                type="submit"
                disabled={isPending || !form.formState.isValid}
                className="min-w-[120px]"
              >
                {isPending ? "作成中..." : "イベントを作成"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

// デフォルトエクスポートと名前付きエクスポート両方を提供
export default EventCreateForm;
export { EventCreateForm as EventForm };
