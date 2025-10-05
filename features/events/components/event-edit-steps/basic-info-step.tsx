"use client";

import { Calendar } from "lucide-react";
import type { Control, FieldErrors } from "react-hook-form";

import type { Event } from "@core/types/models";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import type { EventEditFormDataRHF } from "../../hooks/use-event-edit-form";
import { FeeCalculatorDisplay } from "../fee-calculator-display";

interface BasicInfoStepProps {
  control: Control<EventEditFormDataRHF>;
  isPending: boolean;
  changedFields: Set<string>;
  errors: FieldErrors<EventEditFormDataRHF>;
  isFieldEditable: (field: string) => boolean;
  event: Event;
}

/**
 * イベント編集: 基本情報入力ステップ
 * タイトル、開催日時、参加費を入力
 */
export function BasicInfoStep({
  control,
  isPending,
  changedFields,
  errors,
  isFieldEditable,
  event,
}: BasicInfoStepProps) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center">
            <Calendar className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">基本情報</h3>
            <p className="text-sm text-muted-foreground">
              イベントの基本的な情報を入力してください
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* タイトル */}
          <FormField
            control={control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  {changedFields.has("title") && (
                    <div className="w-2 h-2 rounded-full bg-orange-500" title="変更済み" />
                  )}
                  <FormLabel>
                    タイトル <span className="text-red-500">*</span>
                    {changedFields.has("title") && (
                      <Badge
                        variant="outline"
                        className="ml-2 text-xs bg-orange-50 text-orange-700"
                      >
                        変更済み
                      </Badge>
                    )}
                  </FormLabel>
                </div>
                <FormControl>
                  <Input
                    {...field}
                    disabled={isPending}
                    maxLength={100}
                    required
                    className={
                      changedFields.has("title") ? "bg-orange-50/30 border-orange-200" : ""
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 開催日時 */}
          <FormField
            control={control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  {changedFields.has("date") && (
                    <div className="w-2 h-2 rounded-full bg-orange-500" title="変更済み" />
                  )}
                  <FormLabel>
                    開催日時 <span className="text-red-500">*</span>
                    {changedFields.has("date") && (
                      <Badge
                        variant="outline"
                        className="ml-2 text-xs bg-orange-50 text-orange-700"
                      >
                        変更済み
                      </Badge>
                    )}
                  </FormLabel>
                </div>
                <FormControl>
                  <Input
                    {...field}
                    type="datetime-local"
                    disabled={isPending}
                    required
                    className={changedFields.has("date") ? "bg-orange-50/30 border-orange-200" : ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 参加費 */}
          <FormField
            control={control}
            name="fee"
            render={({ field }) => {
              const feeValue = field.value ? parseInt(field.value, 10) : 0;
              const feeEditable = isFieldEditable("fee");

              return (
                <FormItem>
                  <div className="flex items-center gap-2">
                    {changedFields.has("fee") && (
                      <div className="w-2 h-2 rounded-full bg-orange-500" title="変更済み" />
                    )}
                    <FormLabel>
                      参加費（円） <span className="text-red-500">*</span>
                      {changedFields.has("fee") && (
                        <Badge
                          variant="outline"
                          className="ml-2 text-xs bg-orange-50 text-orange-700"
                        >
                          変更済み
                        </Badge>
                      )}
                    </FormLabel>
                  </div>
                  <FormControl>
                    <Input
                      {...field}
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      disabled={isPending || !feeEditable}
                      required
                      className={
                        changedFields.has("fee") ? "bg-orange-50/30 border-orange-200" : ""
                      }
                    />
                  </FormControl>
                  {!feeEditable ? (
                    <FormDescription className="text-xs text-gray-500">
                      決済済み参加者がいるため、この項目は変更できません。
                    </FormDescription>
                  ) : (
                    <FormDescription className="text-sm text-gray-600">
                      0円（無料）または100円以上で設定してください。
                    </FormDescription>
                  )}
                  <FormMessage />

                  {/* 手取り計算表示 */}
                  {feeValue >= 100 && <FeeCalculatorDisplay fee={feeValue} className="mt-4" />}
                </FormItem>
              );
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}
