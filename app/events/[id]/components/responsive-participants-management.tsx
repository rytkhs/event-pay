"use client";

import React, { useState, useCallback } from "react";

import { useToast } from "@core/contexts/toast-context";
import type {
  GetParticipantsResponse,
  GetParticipantsParams,
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
import { adminAddAttendanceAction } from "@/features/events/actions/admin-add-attendance";
import { generateGuestUrlAction } from "@/features/events/actions/generate-guest-url";
import { getEventParticipantsAction } from "@/features/events/actions/get-event-participants";
import { ParticipantsTable } from "@/features/events/components/participants-table";

interface ResponsiveParticipantsManagementProps {
  eventId: string;
  eventFee: number;
  initialParticipantsData: GetParticipantsResponse;
}

export function ResponsiveParticipantsManagement({
  eventId,
  eventFee,
  initialParticipantsData,
}: ResponsiveParticipantsManagementProps) {
  const [participantsData, setParticipantsData] =
    useState<GetParticipantsResponse>(initialParticipantsData);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addNickname, setAddNickname] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [confirmOverCapacity, setConfirmOverCapacity] = useState<null | {
    capacity?: number | null;
    current?: number;
  }>(null);

  const handleOpenAdd = () => {
    setAddNickname("");
    setConfirmOverCapacity(null);
    setAddError(null);
    setShowAddDialog(true);
  };

  const handleSubmitAdd = async (forceBypass = false) => {
    if (isAdding) return;
    if (!addNickname || addNickname.trim().length === 0) {
      setAddError("ニックネームを入力してください");
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
      const data =
        result.data as import("@/features/events/actions/admin-add-attendance").AddAttendanceResult;
      await navigator.clipboard.writeText((data as any).guestUrl);
      toast({
        title: "参加者を追加しました",
        description: (data as any).canOnlinePay
          ? "ゲストURLをコピーしました（現在オンライン決済が可能です）"
          : "ゲストURLをコピーしました（オンライン決済は現在できません）",
      });
      setShowAddDialog(false);
      setConfirmOverCapacity(null);
      await refreshAllData();
    } finally {
      setIsAdding(false);
    }
  };

  // 参加者管理に特化のため、決済データのサマリー更新は削除

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

        // 参加者管理に特化: 決済サマリーの更新は不要
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
    [eventId, participantsData, toast]
  );

  // 決済・参加者の両方をまとめて再取得
  const refreshAllData = useCallback(async () => {
    await handleParamsChange({});
  }, [handleParamsChange]);

  // ゲストURLコピー
  const handleCopyGuestUrl = async (attendanceId: string) => {
    try {
      const res = await generateGuestUrlAction({ eventId, attendanceId });
      if (!res.success) {
        toast({
          title: "コピーできません",
          description: res.error || "ゲストURL生成に失敗しました",
          variant: "destructive",
        });
        return;
      }
      await navigator.clipboard.writeText(res.data.guestUrl);
      toast({
        title: "URLをコピーしました",
        description: res.data.canOnlinePay
          ? "現在オンライン決済が可能です。"
          : res.data.reason || "オンライン決済は現在できません。",
      });
    } catch {
      toast({
        title: "コピーに失敗しました",
        description: "クリップボードにアクセスできませんでした",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 参加者追加ボタン */}
      <div className="flex justify-end">
        <Button onClick={handleOpenAdd} variant="default" className="w-full sm:w-auto">
          参加者を追加
        </Button>
      </div>

      {/* 参加者一覧 - テーブル形式（全デバイス共通） */}
      <ParticipantsTable
        eventId={eventId}
        eventFee={eventFee}
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
            {addError && <div className="text-sm text-red-600">{addError}</div>}
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
                className="w-full sm:w-auto"
              >
                {isAdding ? "追加中..." : "追加"}
              </Button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <Button
                  variant="outline"
                  onClick={() => setConfirmOverCapacity(null)}
                  disabled={isAdding}
                  className="w-full sm:w-auto"
                >
                  戻る
                </Button>
                <Button
                  onClick={() => void handleSubmitAdd(true)}
                  disabled={isAdding}
                  className="bg-red-600 hover:bg-red-700 w-full sm:w-auto"
                >
                  {isAdding ? "処理中..." : "定員超過で追加"}
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
