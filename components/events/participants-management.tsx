"use client";

import React, { useState, useCallback } from "react";
import { ParticipantsTable } from "./participants-table";
import { EventStats } from "./event-stats";
import { useToast } from "@/components/ui/use-toast";
import { getEventParticipantsAction } from "@/app/events/actions/get-event-participants";
import type {
  GetParticipantsResponse,
  GetParticipantsParams,
} from "@/lib/validation/participant-management";
import type { Event, Attendance, Payment } from "@/types/models";

interface ParticipantsManagementProps {
  eventId: string;
  eventData: Event & { organizer_id: string };
  initialAttendances: Pick<Attendance, "id" | "status">[];
  initialPayments: Pick<Payment, "id" | "method" | "amount" | "status">[];
  initialParticipantsData: GetParticipantsResponse;
}

export function ParticipantsManagement({
  eventId,
  eventData,
  initialAttendances,
  initialPayments,
  initialParticipantsData,
}: ParticipantsManagementProps) {
  const [participantsData, setParticipantsData] =
    useState<GetParticipantsResponse>(initialParticipantsData);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

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
      } catch (error) {
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

  return (
    <div className="space-y-6">
      {/* イベント統計 */}
      <EventStats
        eventData={eventData}
        attendances={initialAttendances}
        payments={initialPayments}
      />

      {/* 参加者一覧テーブル */}
      <ParticipantsTable
        eventId={eventId}
        initialData={participantsData}
        onParamsChange={handleParamsChange}
        isLoading={isLoading}
      />
    </div>
  );
}
