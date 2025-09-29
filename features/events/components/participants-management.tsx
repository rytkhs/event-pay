"use client";

import React, { useState, useCallback } from "react";

import { useToast } from "@core/contexts/toast-context";
import type { Event, Attendance } from "@core/types/models";
import type {
  GetParticipantsResponse,
  GetParticipantsParams,
  GetEventPaymentsResponse,
} from "@core/validation/participant-management";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import { adminAddAttendanceAction } from "../actions/admin-add-attendance";
import { getEventParticipantsAction } from "../actions/get-event-participants";
import { getEventPaymentsAction } from "../actions/get-event-payments";

import { EventStats } from "./event-stats";
import { ParticipantsTable } from "./participants-table";
import { PaymentSummary } from "./payment-summary";

interface ParticipantsManagementProps {
  eventId: string;
  eventData: Event;
  initialAttendances: Pick<Attendance, "id" | "status">[];
  initialPaymentsData: GetEventPaymentsResponse;
  initialParticipantsData: GetParticipantsResponse;
}

export function ParticipantsManagement({
  eventId,
  eventData,
  initialAttendances,
  initialPaymentsData,
  initialParticipantsData,
}: ParticipantsManagementProps) {
  const [participantsData, setParticipantsData] =
    useState<GetParticipantsResponse>(initialParticipantsData);
  const [paymentsData, setPaymentsData] = useState<GetEventPaymentsResponse>(initialPaymentsData);
  const [isLoading, setIsLoading] = useState(false);
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(false);
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addNickname, setAddNickname] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"cash">("cash");
  // const [addEmail, setAddEmail] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [confirmOverCapacity, setConfirmOverCapacity] = useState<null | {
    capacity?: number | null;
    current?: number;
  }>(null);

  // イベントが有料かどうかを判定
  const isPayingEvent = eventData.fee > 0;

  const handleOpenAdd = () => {
    setAddNickname("");
    setConfirmOverCapacity(null);
    setAddError(null);
    setPaymentMethod("cash"); // 現金固定
    setShowAddDialog(true);
  };

  const handleSubmitAdd = async (forceBypass = false) => {
    if (isAdding) return;
    if (!addNickname || addNickname.trim().length === 0) {
      setAddError("ニックネームを入力してください");
      return;
    }

    // 有料イベントの場合は決済方法の確認
    if (isPayingEvent && !paymentMethod) {
      setAddError("決済方法を選択してください");
      return;
    }

    setAddError(null);
    setIsAdding(true);
    try {
      const result = await adminAddAttendanceAction({
        eventId,
        nickname: addNickname,
        status: "attending",
        bypassCapacity: forceBypass,
        ...(isPayingEvent && { paymentMethod }),
      });
      if (!result.success) {
        if ((result as any).data?.confirmRequired || (result as any).confirmRequired) {
          const payload = (result as any).data || result;
          setConfirmOverCapacity({ capacity: payload.capacity, current: payload.current });
          return;
        }
        toast({
          title: "追加に失敗しました",
          description: result.error || "参加者の追加に失敗しました",
          variant: "destructive",
        });
        return;
      }
      const data = result.data as import("../actions/admin-add-attendance").AddAttendanceResult;
      // 一時的に停止
      // await navigator.clipboard.writeText((data as any).guestUrl);
      const successDescription = isPayingEvent
        ? "参加者を追加しました。現金決済（未払い）として記録されました。"
        : (data as any).canOnlinePay
          ? "参加者を追加しました（現在オンライン決済が可能です）"
          : "参加者を追加しました（オンライン決済は現在できません）";

      toast({
        title: "参加者を追加しました",
        description: successDescription,
      });
      setShowAddDialog(false);
      setConfirmOverCapacity(null);
      await refreshAllData();
    } finally {
      setIsAdding(false);
    }
  };

  // 決済データ更新ハンドラー
  const refreshPaymentsData = useCallback(async () => {
    setIsPaymentsLoading(true);
    try {
      const updatedPaymentsData = await getEventPaymentsAction(eventId);
      setPaymentsData(updatedPaymentsData);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to update payments data:", error);
      toast({
        title: "エラーが発生しました",
        description: "決済データの取得に失敗しました。",
        variant: "destructive",
      });
    } finally {
      setIsPaymentsLoading(false);
    }
  }, [eventId, toast]);

  // パラメータ変更ハンドラー
  const handleParamsChange = useCallback(
    async (newParams: Partial<GetParticipantsParams>) => {
      setIsLoading(true);

      try {
        const currentParams = {
          eventId,
          search: participantsData.filters.search,
          attendanceStatus: participantsData.filters.attendanceStatus,
          paymentMethod: participantsData.filters.paymentMethod,
          paymentStatus: participantsData.filters.paymentStatus,
          sortField: participantsData.sort.field,
          sortOrder: participantsData.sort.order,
          page: participantsData.pagination.page,
          limit: participantsData.pagination.limit,
          ...newParams,
        };

        const updatedData = await getEventParticipantsAction(currentParams);
        setParticipantsData(updatedData);

        // 参加者データ更新時は決済データも更新（決済状況変化の可能性）
        await refreshPaymentsData();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Failed to update participants data:", error);
        toast({
          title: "エラーが発生しました",
          description: "参加者データの取得に失敗しました。",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [eventId, participantsData, toast, refreshPaymentsData]
  );

  // 決済・参加者の両方をまとめて再取得
  const refreshAllData = useCallback(async () => {
    await handleParamsChange({});
  }, [handleParamsChange]);

  return (
    <div className="space-y-6">
      {/* イベント統計 */}
      <EventStats
        eventData={eventData}
        attendances={initialAttendances}
        payments={paymentsData.payments}
      />

      {/* 決済状況サマリー */}
      <PaymentSummary summary={paymentsData.summary} isLoading={isPaymentsLoading} />

      {/* 参加者追加ボタン */}
      <div className="flex justify-end">
        <Button onClick={handleOpenAdd} variant="default">
          参加者を追加
        </Button>
      </div>

      {/* 参加者一覧テーブル */}
      <ParticipantsTable
        eventId={eventId}
        eventFee={eventData.fee}
        initialData={participantsData}
        onParamsChange={handleParamsChange}
        isLoading={isLoading}
        onPaymentStatusUpdate={refreshAllData}
      />

      {/* 追加ダイアログ */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>参加者を追加</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="ニックネーム"
              value={addNickname}
              onChange={(e) => setAddNickname(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleSubmitAdd(false);
                }
              }}
              required
            />

            {/* 有料イベントの場合は決済方法選択を表示 */}
            {isPayingEvent && (
              <div className="space-y-2">
                <Label htmlFor="payment-method" className="text-sm font-medium">
                  決済方法 <span className="text-red-500">*</span>
                </Label>
                <RadioGroup
                  value={paymentMethod}
                  onValueChange={(value: "cash") => setPaymentMethod(value)}
                  className="flex flex-col space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="cash" id="cash" />
                    <Label htmlFor="cash" className="text-sm">
                      現金 ({eventData.fee.toLocaleString()}円)
                    </Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  手動追加の場合は現金決済のみ対応しています。
                </p>
              </div>
            )}

            {addError && <div className="text-sm text-red-600">{addError}</div>}
            {/* MVPではメールは収集しない */}
            {confirmOverCapacity && (
              <div className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-2">
                定員（{confirmOverCapacity.capacity ?? "-"}）を超過しています（現在{" "}
                {confirmOverCapacity.current ?? "-"} 名）。本当に追加しますか？
              </div>
            )}
          </div>
          <DialogFooter>
            {!confirmOverCapacity ? (
              <Button
                onClick={() => void handleSubmitAdd(false)}
                disabled={isAdding || !addNickname || addNickname.trim().length === 0}
              >
                {isAdding ? "追加中..." : "追加"}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setConfirmOverCapacity(null)}
                  disabled={isAdding}
                >
                  戻る
                </Button>
                <Button
                  onClick={() => void handleSubmitAdd(true)}
                  disabled={isAdding}
                  className="bg-red-600 hover:bg-red-700"
                >
                  {isAdding ? "処理中..." : "定員超過で追加"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
