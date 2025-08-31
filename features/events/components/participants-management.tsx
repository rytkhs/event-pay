"use client";

import React, { useState, useCallback } from "react";
import { ParticipantsTable } from "./participants-table";
import { EventStats } from "./event-stats";
import { PaymentSummary } from "./payment-summary";
import { useToast } from "@/contexts/toast-context";
import { getEventParticipantsAction } from "@/app/events/actions/get-event-participants";
import { getEventPaymentsAction } from "@/app/events/actions/get-event-payments";
import type {
  GetParticipantsResponse,
  GetParticipantsParams,
  GetEventPaymentsResponse,
} from "@core/validation/participant-management";
import type { Event, Attendance } from "@core/types/models";

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

      {/* 決済状況サマリー（MANAGE-002新機能） */}
      <PaymentSummary summary={paymentsData.summary} isLoading={isPaymentsLoading} />

      {/* 参加者一覧テーブル */}
      <ParticipantsTable
        eventId={eventId}
        initialData={participantsData}
        onParamsChange={handleParamsChange}
        isLoading={isLoading}
        onPaymentStatusUpdate={refreshAllData}
      />
    </div>
  );
}
