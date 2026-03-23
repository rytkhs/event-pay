import "server-only";

import type { User } from "@supabase/supabase-js";

import { getCurrentCommunityServerActionContext } from "@core/community/current-community";
import { getOwnedEventContextForCurrentCommunity } from "@core/community/get-owned-event-context-for-current-community";
import { AppError } from "@core/errors/app-error";
import { errResult, okResult, type AppResult } from "@core/errors/app-result";
import type { AppSupabaseClient } from "@core/types/supabase";

type PaymentActionRow = {
  attendance_id: string;
  id: string;
  method: string;
  status: string;
  version: number;
};

type AttendanceEventRow = {
  event_id: string;
  id: string;
};

export type OwnedPaymentActionContext = {
  attendanceId: string;
  currentCommunityId: string;
  eventId: string;
  method: string;
  paymentId: string;
  status: string;
  user: User;
  version: number;
};

export type OwnedBulkPaymentActionContext = {
  currentCommunityId: string;
  payments: OwnedPaymentActionContext[];
  user: User;
};

const PAYMENT_ACCESS_DENIED_MESSAGE = "現在選択中のコミュニティではこの決済を操作できません";

export async function getOwnedPaymentActionContextForServerAction(
  supabase: AppSupabaseClient,
  paymentId: string
): Promise<AppResult<OwnedPaymentActionContext>> {
  const currentCommunityContext = await getCurrentCommunityServerActionContext();
  if (!currentCommunityContext.success) {
    return currentCommunityContext;
  }

  const currentCommunityContextData = currentCommunityContext.data;
  if (!currentCommunityContextData) {
    return errResult(
      new AppError("INTERNAL_ERROR", {
        message: "Current community server action context returned no data.",
        userMessage: "コミュニティ情報の取得に失敗しました。",
      })
    );
  }

  const { currentCommunity, user } = currentCommunityContextData;

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, attendance_id, method, status, version")
    .eq("id", paymentId)
    .maybeSingle<PaymentActionRow>();

  if (paymentError) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: paymentError,
        userMessage: "決済レコードの取得に失敗しました。",
      })
    );
  }

  if (!payment) {
    return errResult(
      new AppError("NOT_FOUND", {
        userMessage: "決済レコードが見つかりません。",
      })
    );
  }

  const { data: attendance, error: attendanceError } = await supabase
    .from("attendances")
    .select("id, event_id")
    .eq("id", payment.attendance_id)
    .maybeSingle<AttendanceEventRow>();

  if (attendanceError) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: attendanceError,
        userMessage: "参加記録の取得に失敗しました。",
      })
    );
  }

  if (!attendance) {
    return errResult(
      new AppError("ATTENDANCE_NOT_FOUND", {
        userMessage: "参加記録が見つかりません。",
      })
    );
  }

  const eventContext = await getOwnedEventContextForCurrentCommunity(
    supabase,
    attendance.event_id,
    currentCommunity.id
  );

  if (!eventContext.success) {
    if (eventContext.error.code === "EVENT_ACCESS_DENIED") {
      return errResult(
        new AppError("EVENT_ACCESS_DENIED", {
          userMessage: PAYMENT_ACCESS_DENIED_MESSAGE,
          details: eventContext.error.details,
        })
      );
    }
    return eventContext;
  }

  return okResult({
    attendanceId: payment.attendance_id,
    currentCommunityId: currentCommunity.id,
    eventId: attendance.event_id,
    method: payment.method,
    paymentId: payment.id,
    status: payment.status,
    user,
    version: payment.version,
  });
}

export async function getOwnedBulkPaymentActionContextForServerAction(
  supabase: AppSupabaseClient,
  paymentIds: string[]
): Promise<AppResult<OwnedBulkPaymentActionContext>> {
  const currentCommunityContext = await getCurrentCommunityServerActionContext();
  if (!currentCommunityContext.success) {
    return currentCommunityContext;
  }

  const currentCommunityContextData = currentCommunityContext.data;
  if (!currentCommunityContextData) {
    return errResult(
      new AppError("INTERNAL_ERROR", {
        message: "Current community server action context returned no data.",
        userMessage: "コミュニティ情報の取得に失敗しました。",
      })
    );
  }

  const { currentCommunity, user } = currentCommunityContextData;
  const uniquePaymentIds = Array.from(new Set(paymentIds));

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("id, attendance_id, method, status, version")
    .in("id", uniquePaymentIds);

  if (paymentsError) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: paymentsError,
        userMessage: "決済レコードの取得に失敗しました。",
      })
    );
  }

  const typedPayments = (payments ?? []) as PaymentActionRow[];

  if (typedPayments.length === 0) {
    return errResult(
      new AppError("NOT_FOUND", {
        userMessage: "決済レコードが見つかりません。",
      })
    );
  }

  if (typedPayments.length !== uniquePaymentIds.length) {
    return errResult(
      new AppError("EVENT_ACCESS_DENIED", {
        userMessage: PAYMENT_ACCESS_DENIED_MESSAGE,
      })
    );
  }

  const attendanceIds = Array.from(new Set(typedPayments.map((payment) => payment.attendance_id)));
  const { data: attendances, error: attendancesError } = await supabase
    .from("attendances")
    .select("id, event_id")
    .in("id", attendanceIds);

  if (attendancesError) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: attendancesError,
        userMessage: "参加記録の取得に失敗しました。",
      })
    );
  }

  const attendanceMap = new Map(
    ((attendances ?? []) as AttendanceEventRow[]).map((attendance) => [attendance.id, attendance])
  );

  if (attendanceMap.size !== attendanceIds.length) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        userMessage: "参加記録の取得に失敗しました。",
      })
    );
  }

  const eventIds = Array.from(
    new Set((attendances ?? []).map((attendance) => attendance.event_id))
  );
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, community_id, created_by")
    .in("id", eventIds);

  if (eventsError) {
    return errResult(
      new AppError("DATABASE_ERROR", {
        cause: eventsError,
        userMessage: "イベント情報の取得に失敗しました。",
      })
    );
  }

  const eventMap = new Map((events ?? []).map((event) => [event.id, event]));

  if (eventMap.size !== eventIds.length) {
    return errResult(
      new AppError("EVENT_ACCESS_DENIED", {
        userMessage: PAYMENT_ACCESS_DENIED_MESSAGE,
      })
    );
  }

  for (const event of eventMap.values()) {
    if (!event.community_id) {
      return errResult(
        new AppError("DATABASE_ERROR", {
          message: "Payment linked event is missing community_id.",
          userMessage: "イベント情報の取得に失敗しました。",
        })
      );
    }

    if (event.community_id !== currentCommunity.id) {
      return errResult(
        new AppError("EVENT_ACCESS_DENIED", {
          userMessage: PAYMENT_ACCESS_DENIED_MESSAGE,
          details: {
            currentCommunityId: currentCommunity.id,
            eventCommunityId: event.community_id,
          },
        })
      );
    }
  }

  return okResult({
    currentCommunityId: currentCommunity.id,
    payments: typedPayments.map((payment) => {
      const attendance = attendanceMap.get(payment.attendance_id);

      if (!attendance) {
        throw new AppError("DATABASE_ERROR", {
          message: "Attendance lookup failed while building owned bulk payment context.",
          userMessage: "参加記録の取得に失敗しました。",
        });
      }

      return {
        attendanceId: payment.attendance_id,
        currentCommunityId: currentCommunity.id,
        eventId: attendance.event_id,
        method: payment.method,
        paymentId: payment.id,
        status: payment.status,
        user,
        version: payment.version,
      };
    }),
    user,
  });
}
