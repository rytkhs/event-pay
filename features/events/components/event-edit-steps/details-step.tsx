"use client";

import { MapPin } from "lucide-react";
import type { Control, FieldErrors } from "react-hook-form";

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
import { Textarea } from "@/components/ui/textarea";

import type { EventEditFormDataRHF } from "../../hooks/use-event-edit-form";

interface DetailsStepProps {
  control: Control<EventEditFormDataRHF>;
  isPending: boolean;
  changedFields: Set<string>;
  errors: FieldErrors<EventEditFormDataRHF>;
  hasAttendees: boolean;
  attendeeCount: number;
}

/**
 * イベント編集: 詳細情報入力ステップ
 * 場所、説明、定員を入力
 */
export function DetailsStep({
  control,
  isPending,
  changedFields,
  errors,
  hasAttendees,
  attendeeCount,
}: DetailsStepProps) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
            <MapPin className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">詳細情報</h3>
            <p className="text-sm text-muted-foreground">場所や詳細を入力してください</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* 場所 */}
          <FormField
            control={control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  {changedFields.has("location") && (
                    <div className="w-2 h-2 rounded-full bg-orange-500" title="変更済み" />
                  )}
                  <FormLabel>
                    場所
                    {changedFields.has("location") && (
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
                    maxLength={200}
                    className={
                      changedFields.has("location") ? "bg-orange-50/30 border-orange-200" : ""
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 定員 */}
          <FormField
            control={control}
            name="capacity"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  {changedFields.has("capacity") && (
                    <div className="w-2 h-2 rounded-full bg-orange-500" title="変更済み" />
                  )}
                  <FormLabel>
                    定員
                    {changedFields.has("capacity") && (
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
                    min={hasAttendees ? attendeeCount : 1}
                    disabled={isPending}
                    placeholder="制限なしの場合は空欄"
                    value={field.value || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      field.onChange(value === "" ? "" : value);
                    }}
                    className={
                      changedFields.has("capacity") ? "bg-orange-50/30 border-orange-200" : ""
                    }
                  />
                </FormControl>
                {hasAttendees && (
                  <FormDescription className="text-xs text-gray-500">
                    参加者がいるため、定員は現在の参加者数（{attendeeCount}
                    名）未満に設定できません。
                  </FormDescription>
                )}
                <FormMessage />
              </FormItem>
            )}
          />

          {/* 説明 */}
          <FormField
            control={control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center gap-2">
                  {changedFields.has("description") && (
                    <div className="w-2 h-2 rounded-full bg-orange-500" title="変更済み" />
                  )}
                  <FormLabel>
                    説明
                    {changedFields.has("description") && (
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
                  <Textarea
                    {...field}
                    disabled={isPending}
                    rows={5}
                    maxLength={1000}
                    className={
                      changedFields.has("description") ? "bg-orange-50/30 border-orange-200" : ""
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}
