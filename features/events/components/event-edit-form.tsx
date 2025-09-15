"use client";

import { useState } from "react";

import type { Event } from "@core/types/models";
import { sanitizeForEventPay } from "@core/utils/sanitize";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChangeConfirmationDialog,
  type ChangeItem,
} from "@/components/ui/change-confirmation-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { useEventEditForm, type EventEditFormDataRHF } from "../hooks/use-event-edit-form";

interface EventEditFormProps {
  event: Event;
  attendeeCount: number;
  onSubmit?: (data: Event) => void;
  serverError?: string;
  hasStripePaid?: boolean;
}

export function EventEditForm({
  event,
  attendeeCount,
  onSubmit,
  serverError,
  hasStripePaid = false,
}: EventEditFormProps) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<ChangeItem[]>([]);

  const {
    form,
    isPending,
    hasAttendees,
    validation,
    restrictions,
    changes,
    actions,
    isFreeEvent, // 無料イベント判定フラグ
  } = useEventEditForm({
    event,
    attendeeCount,
    onSubmit,
    hasStripePaid,
  });

  const handleSubmit = async (_data: EventEditFormDataRHF) => {
    // 変更検出
    const detectedChanges = changes.detectChanges();

    if (detectedChanges.length === 0) {
      form.setError("root", {
        type: "manual",
        message: "変更がありません",
      });
      return;
    }

    // 変更確認ダイアログを表示
    setPendingChanges(detectedChanges);
    setShowConfirmDialog(true);
  };

  const handleConfirmChanges = async (confirmedChanges: ChangeItem[]) => {
    setShowConfirmDialog(false);

    try {
      const formData = form.getValues();
      await actions.submitFormWithChanges(formData, confirmedChanges);
    } catch (_error) {
      form.setError("root", {
        type: "manual",
        message: "更新に失敗しました。もう一度お試しください。",
      });
    }
  };

  const handleResetForm = () => {
    actions.resetForm();
  };

  return (
    <>
      <Card className="max-w-4xl mx-auto">
        <CardHeader className="space-y-4">
          <div className="flex items-center gap-4">
            <CardTitle className="text-2xl font-bold">イベント編集</CardTitle>
            <div className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
              React Hook Form 版（テスト中）
            </div>
          </div>

          {/* サーバーエラーの表示 */}
          {serverError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {serverError}
            </div>
          )}

          {/* 全体エラーの表示 */}
          {form.formState.errors.root && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {form.formState.errors.root.message}
            </div>
          )}

          {/* 編集制限の通知（V2: 決済済み時のみ） */}
          {restrictions.getRestrictedFieldNames().length > 0 && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
              <p className="font-medium">
                決済済みの参加者がいるため、一部項目の編集が制限されています
              </p>
              <p className="text-sm mt-1">
                制限項目: {restrictions.getRestrictedFieldNames().join(", ")}
              </p>
            </div>
          )}
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8" noValidate>
              {/* 基本情報セクション */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">基本情報</h3>
                  <p className="text-sm text-gray-500">イベントの基本的な情報を入力してください</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* タイトル */}
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          タイトル <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={sanitizeForEventPay(field.value)}
                            disabled={isPending}
                            maxLength={100}
                            required
                          />
                        </FormControl>
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
                            value={sanitizeForEventPay(field.value)}
                            disabled={isPending}
                            maxLength={200}
                          />
                        </FormControl>
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
                        <FormLabel>
                          開催日時 <span className="text-red-500">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input {...field} type="datetime-local" disabled={isPending} required />
                        </FormControl>
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
                        <FormLabel>
                          定員
                          {hasAttendees && (
                            <span className="ml-2 text-sm text-gray-500">
                              (現在の参加者数以上で設定)
                            </span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min={hasAttendees ? attendeeCount : 1}
                            disabled={isPending}
                            placeholder="制限なしの場合は空欄"
                            value={field.value || ""}
                            onChange={(e) => {
                              // 空文字列の場合は空文字列を維持（NaN防止）
                              const value = e.target.value;
                              field.onChange(value === "" ? "" : value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 説明 */}
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem className="md:col-span-2">
                        <FormLabel>説明</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={sanitizeForEventPay(field.value)}
                            disabled={isPending}
                            rows={3}
                            maxLength={1000}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* 料金・決済セクション */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">料金・決済</h3>
                  <p className="text-sm text-gray-500">参加費と決済方法を設定してください</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 参加費 */}
                  <FormField
                    control={form.control}
                    name="fee"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          参加費（円） <span className="text-red-500">*</span>
                          {restrictions.isFieldRestricted("fee") && (
                            <span className="ml-2 text-sm text-gray-500">(編集制限)</span>
                          )}
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            disabled={isPending || restrictions.isFieldRestricted("fee")}
                            required
                          />
                        </FormControl>
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
                          <FormLabel>
                            決済方法 <span className="text-red-500">*</span>
                            {restrictions.isFieldRestricted("payment_methods") && (
                              <span className="ml-2 text-sm text-gray-500">(編集制限)</span>
                            )}
                          </FormLabel>
                          <div className="space-y-2">
                            {[
                              { value: "stripe", label: "クレジットカード" },
                              { value: "cash", label: "現金" },
                            ].map((option) => (
                              <div key={option.value} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`payment-${option.value}`}
                                  checked={field.value?.includes(option.value)}
                                  onCheckedChange={(checked) => {
                                    if (checked) {
                                      field.onChange([...field.value, option.value]);
                                    } else {
                                      field.onChange(
                                        field.value?.filter((v) => v !== option.value)
                                      );
                                    }
                                  }}
                                  disabled={
                                    isPending || restrictions.isFieldRestricted("payment_methods")
                                  }
                                />
                                <label
                                  htmlFor={`payment-${option.value}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                >
                                  {option.label}
                                </label>
                              </div>
                            ))}
                          </div>
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
              </div>

              {/* 締切設定セクション */}
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">締切設定</h3>
                  <p className="text-sm text-gray-500">
                    参加申込とオンライン決済の締切日時を設定してください
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* 参加申込締切 */}
                  <FormField
                    control={form.control}
                    name="registration_deadline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>参加申込締切</FormLabel>
                        <FormControl>
                          <Input {...field} type="datetime-local" disabled={isPending} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* 支払い締切 */}
                  <FormField
                    control={form.control}
                    name="payment_deadline"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>オンライン決済締切</FormLabel>
                        <FormControl>
                          <Input {...field} type="datetime-local" disabled={isPending} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

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

              {/* アクションボタン */}
              <div className="flex flex-col sm:flex-row gap-4 pt-6">
                <Button
                  type="submit"
                  disabled={isPending || !changes.hasChanges || validation.hasErrors}
                  className="flex-1 sm:flex-none sm:min-w-[120px]"
                >
                  {isPending ? "更新中..." : "変更を保存"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetForm}
                  disabled={isPending || !changes.hasChanges}
                  className="flex-1 sm:flex-none sm:min-w-[120px]"
                >
                  リセット
                </Button>

                <div className="text-sm text-gray-600 flex items-center">
                  {changes.hasChanges ? (
                    <span className="text-amber-600">
                      未保存の変更: {changes.getChangeCount()}項目
                    </span>
                  ) : (
                    <span>変更はありません</span>
                  )}
                </div>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* 変更確認ダイアログ */}
      <ChangeConfirmationDialog
        isOpen={showConfirmDialog}
        changes={pendingChanges}
        onConfirm={handleConfirmChanges}
        onCancel={() => setShowConfirmDialog(false)}
        attendeeCount={attendeeCount}
      />
    </>
  );
}
