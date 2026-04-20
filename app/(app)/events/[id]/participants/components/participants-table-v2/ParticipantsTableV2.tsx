"use client";

import React, { useCallback, useEffect, useMemo, useState, startTransition } from "react";

import { useRouter } from "next/navigation";

import { SortingState, Row } from "@tanstack/react-table";
import { AlertTriangle, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import type { ActionResult } from "@core/errors/adapters/server-actions";
import type { EventStatus, PaymentMethod } from "@core/types/statuses";
import { conditionalSmartSort } from "@core/utils/participant-smart-sort";
import { isPaymentUnpaid, toSimplePaymentStatus } from "@core/utils/payment-status-mapper";
import type {
  AdminUpdateAttendanceConfirmation,
  AdminUpdateAttendanceStatusResult,
  ParticipantView,
} from "@core/validation/participant-management";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  EventManagementQuery,
  EventManagementQueryPatch,
  ParticipantSortField,
  ParticipantSortOrder,
} from "../../../query-params";

import { BulkActionBar } from "./BulkActionBar";
import { CardsView } from "./CardsView";
import { DataTable } from "./DataTable";
import { buildParticipantsColumns } from "./participants-columns";
import { ViewModeToggle } from "./ViewModeToggle";

type UpdateCashStatusInput = {
  paymentId: string;
  status: "received" | "waived" | "pending";
  notes?: string;
  isCancel?: boolean;
};

type BulkUpdateCashStatusInput = {
  paymentIds: string[];
  status: "received" | "waived";
  notes?: string;
};

type BulkUpdateResult = {
  successCount: number;
  failedCount: number;
  failures: Array<{
    paymentId: string;
    error: string;
  }>;
};

type UpdateCashStatusAction = (
  input: UpdateCashStatusInput
) => Promise<ActionResult<{ paymentId: string; status: "received" | "waived" | "pending" }>>;

type BulkUpdateCashStatusAction = (
  input: BulkUpdateCashStatusInput
) => Promise<ActionResult<BulkUpdateResult>>;

type DeleteMistakenAttendanceInput = {
  eventId: string;
  attendanceId: string;
};

type DeleteMistakenAttendanceAction = (
  input: DeleteMistakenAttendanceInput
) => Promise<ActionResult<{ attendanceId: string }>>;

type AttendanceStatus = ParticipantView["status"];

type AdminUpdateAttendanceStatusInput = {
  eventId: string;
  attendanceId: string;
  status: AttendanceStatus;
  paymentMethod?: PaymentMethod;
  acknowledgedFinalizedPayment?: boolean;
  acknowledgedPastEvent?: boolean;
  notes?: string;
};

type AdminUpdateAttendanceStatusAction = (
  input: AdminUpdateAttendanceStatusInput
) => Promise<ActionResult<AdminUpdateAttendanceStatusResult | AdminUpdateAttendanceConfirmation>>;

const MOBILE_BREAKPOINT = 768;
const VIEW_MODE_STORAGE_KEYS = {
  mobile: "event-participants-view-mode-mobile",
  desktop: "event-participants-view-mode-desktop",
} as const;

function isViewMode(value: string): value is "table" | "cards" {
  return value === "table" || value === "cards";
}

function getDeviceType(width: number): keyof typeof VIEW_MODE_STORAGE_KEYS {
  return width < MOBILE_BREAKPOINT ? "mobile" : "desktop";
}

function getDefaultViewMode(deviceType: keyof typeof VIEW_MODE_STORAGE_KEYS): "table" | "cards" {
  return deviceType === "mobile" ? "cards" : "table";
}

function getInitialViewMode(): "table" | "cards" {
  const deviceType = getDeviceType(window.innerWidth);
  const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEYS[deviceType]);

  if (saved && isViewMode(saved)) {
    return saved;
  }

  return getDefaultViewMode(deviceType);
}

function compareString(a: string, b: string, order: ParticipantSortOrder): number {
  return order === "asc" ? a.localeCompare(b, "ja") : b.localeCompare(a, "ja");
}

function compareNumber(a: number, b: number, order: ParticipantSortOrder): number {
  return order === "asc" ? a - b : b - a;
}

function getStatusOrder(status: ParticipantView["status"]): number {
  switch (status) {
    case "attending":
      return 0;
    case "maybe":
      return 1;
    case "not_attending":
      return 2;
    default:
      return 99;
  }
}

function getAttendanceStatusLabel(status: AttendanceStatus): string {
  switch (status) {
    case "attending":
      return "参加";
    case "not_attending":
      return "不参加";
    case "maybe":
      return "未定";
  }
}

function isFinalizedPaymentStatus(status: ParticipantView["payment_status"]): boolean {
  return status === "paid" || status === "received" || status === "waived" || status === "refunded";
}

function hasPreservedPayment(status: ParticipantView["payment_status"]): boolean {
  return status === "paid" || status === "received" || status === "waived" || status === "refunded";
}

function toTimestamp(value: string): number {
  return new Date(value).getTime();
}

function applyManualSort(
  participants: ParticipantView[],
  sort: ParticipantSortField | undefined,
  order: ParticipantSortOrder | undefined
): ParticipantView[] {
  if (!sort || !order) {
    return participants;
  }

  const sorted = [...participants];
  sorted.sort((a, b) => {
    switch (sort) {
      case "nickname":
        return compareString(a.nickname, b.nickname, order);
      case "status":
        return compareNumber(getStatusOrder(a.status), getStatusOrder(b.status), order);
      case "updated_at":
        return compareNumber(
          toTimestamp(a.attendance_updated_at),
          toTimestamp(b.attendance_updated_at),
          order
        );
      case "created_at":
      default:
        return compareNumber(
          toTimestamp(a.attendance_created_at),
          toTimestamp(b.attendance_created_at),
          order
        );
    }
  });

  return sorted;
}

export interface ParticipantsTableV2Props {
  eventId: string;
  eventFee: number;
  eventStatus: EventStatus;
  eventPaymentMethods: PaymentMethod[];
  allParticipants: ParticipantView[];
  query: EventManagementQuery;
  onParamsChange: (patch: EventManagementQueryPatch) => void;
  adminUpdateAttendanceStatusAction: AdminUpdateAttendanceStatusAction;
  deleteMistakenAttendanceAction: DeleteMistakenAttendanceAction;
  updateCashStatusAction: UpdateCashStatusAction;
  bulkUpdateCashStatusAction: BulkUpdateCashStatusAction;
  isSelectionMode?: boolean;
  onSelectionModeChange?: (isSelectionMode: boolean) => void;
}

export function ParticipantsTableV2({
  eventId,
  eventFee,
  eventStatus,
  eventPaymentMethods,
  allParticipants,
  query,
  onParamsChange,
  adminUpdateAttendanceStatusAction,
  deleteMistakenAttendanceAction,
  updateCashStatusAction,
  bulkUpdateCashStatusAction,
  isSelectionMode = false,
  onSelectionModeChange,
}: ParticipantsTableV2Props) {
  const isFreeEvent = eventFee === 0;
  const router = useRouter();

  const [viewMode, setViewMode] = useState<"table" | "cards" | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<ParticipantView | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);
  const [attendanceTarget, setAttendanceTarget] = useState<ParticipantView | null>(null);
  const [nextAttendanceStatus, setNextAttendanceStatus] = useState<AttendanceStatus>("attending");
  const [attendancePaymentMethod, setAttendancePaymentMethod] = useState<PaymentMethod | undefined>(
    undefined
  );
  const [attendanceErrorMessage, setAttendanceErrorMessage] = useState<string | null>(null);
  const [requiresFinalizedPaymentConfirmation, setRequiresFinalizedPaymentConfirmation] =
    useState(false);
  const [requiresPastEventConfirmation, setRequiresPastEventConfirmation] = useState(false);

  // 端末別に初回デフォルトを決めつつ、保存済みの選択を復元する
  useEffect(() => {
    setViewMode(getInitialViewMode());
  }, []);

  // 選択モードがOFFになったら選択状態をクリア
  useEffect(() => {
    if (!isSelectionMode) {
      setSelectedPaymentIds([]);
    }
  }, [isSelectionMode]);

  const handleViewModeChange = (newMode: "table" | "cards") => {
    if (newMode === viewMode) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setViewMode(newMode);
      const deviceType = getDeviceType(window.innerWidth);
      localStorage.setItem(VIEW_MODE_STORAGE_KEYS[deviceType], newMode);
      setTimeout(() => setIsTransitioning(false), 200);
    }, 100);
  };

  // ローカル参加者状態（楽観的更新用）
  const [localParticipants, setLocalParticipants] = useState(allParticipants);

  // props更新時に同期
  useEffect(() => {
    setLocalParticipants(allParticipants);
  }, [allParticipants]);

  // =======================================================
  // クライアントサイドフィルタリング
  // =======================================================
  const filteredParticipants = useMemo(() => {
    let result = localParticipants;

    // 検索フィルタ（ニックネーム/メール部分一致）
    const search = query.search.toLowerCase();
    if (search) {
      result = result.filter(
        (p) => p.nickname.toLowerCase().includes(search) || p.email.toLowerCase().includes(search)
      );
    }

    // 出席ステータスフィルタ
    const attendance = query.attendance;
    if (attendance && attendance !== "all") {
      result = result.filter((p) => p.status === attendance);
    }

    // 決済方法フィルタ
    const paymentMethod = query.paymentMethod;
    if (paymentMethod) {
      result = result.filter((p) => p.payment_method === paymentMethod);
    }

    // 決済ステータスフィルタ (SimplePaymentStatus)
    const paymentStatus = query.paymentStatus;
    if (paymentStatus) {
      result = result.filter((p) => {
        const simple = toSimplePaymentStatus(p.payment_status);
        return simple === paymentStatus;
      });
    }

    return result;
  }, [localParticipants, query]);

  const sortedParticipants = useMemo(() => {
    if (query.smart) {
      return conditionalSmartSort(filteredParticipants, isFreeEvent, true);
    }
    return applyManualSort(filteredParticipants, query.sort, query.order);
  }, [filteredParticipants, isFreeEvent, query.smart, query.sort, query.order]);

  // =======================================================
  // クライアントサイドページネーション
  // =======================================================
  const page = query.page;
  const limit = query.limit;

  const paginatedParticipants = useMemo(() => {
    const start = (page - 1) * limit;
    return sortedParticipants.slice(start, start + limit);
  }, [sortedParticipants, page, limit]);

  // ページネーション情報
  const totalCount = filteredParticipants.length;
  const totalPages = Math.ceil(totalCount / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  // =======================================================
  // 一括操作関連
  // =======================================================
  // 現金決済で一括操作可能な参加者のみフィルタ（フィルタ済みデータから）
  const bulkOperableParticipants = useMemo(() => {
    return sortedParticipants.filter(
      (p) =>
        p.status === "attending" &&
        p.payment_method === "cash" &&
        p.payment_id &&
        (p.payment_status === "pending" || p.payment_status === "failed")
    );
  }, [sortedParticipants]);

  // 現在選択されている現金決済のpayment_id配列
  const validSelectedPaymentIds = useMemo(() => {
    const validIds = new Set(bulkOperableParticipants.map((p) => p.payment_id).filter(Boolean));
    return selectedPaymentIds.filter((id) => validIds.has(id));
  }, [selectedPaymentIds, bulkOperableParticipants]);
  const hasBulkActionBar = !isFreeEvent && validSelectedPaymentIds.length > 0;

  // =======================================================
  // ソート状態
  // =======================================================
  const initialSorting: SortingState = useMemo(() => {
    const sort = query.sort;
    const order = query.order;
    if (sort && order) return [{ id: sort, desc: order === "desc" }];
    return [];
  }, [query.sort, query.order]);

  const [sorting, setSorting] = useState<SortingState>(initialSorting);

  const sortId = initialSorting[0]?.id;
  const sortDesc = initialSorting[0]?.desc;
  useEffect(() => {
    setSorting(initialSorting);
  }, [initialSorting, sortId, sortDesc]);

  // =======================================================
  // ハンドラー
  // =======================================================
  const getDefaultPaymentMethod = useCallback((): PaymentMethod | undefined => {
    if (eventPaymentMethods.includes("cash")) return "cash";
    if (eventPaymentMethods.includes("stripe")) return "stripe";
    return undefined;
  }, [eventPaymentMethods]);

  const applyLocal = useCallback(
    (paymentId: string, nextStatus: "received" | "waived" | "pending") => {
      setLocalParticipants((prev) =>
        prev.map((p) => (p.payment_id === paymentId ? { ...p, payment_status: nextStatus } : p))
      );
    },
    []
  );

  const handleReceive = useCallback(
    async (paymentId: string) => {
      setIsUpdating(true);
      const prev = localParticipants;
      applyLocal(paymentId, "received");
      try {
        const result = await updateCashStatusAction({ paymentId, status: "received" });
        if (result.success) {
          toast("決済状況を更新しました", {
            description: "ステータスを「受領」に変更しました。",
          });
          startTransition(() => router.refresh());
        } else {
          throw new Error(result.error?.userMessage || "更新に失敗しました");
        }
      } catch (error) {
        setLocalParticipants(prev);
        const errorMessage =
          error instanceof Error ? error.message : "予期しないエラーが発生しました";
        toast.error("更新に失敗しました", {
          description: errorMessage,
        });
      } finally {
        setIsUpdating(false);
      }
    },
    [router, localParticipants, applyLocal, updateCashStatusAction]
  );

  const handleBulkReceive = useCallback(async () => {
    if (validSelectedPaymentIds.length === 0) {
      toast.error("選択エラー", {
        description: "受領対象の決済を選択してください。",
      });
      return;
    }

    setIsBulkUpdating(true);
    const prev = localParticipants;
    const targetIds = [...validSelectedPaymentIds];

    setLocalParticipants((current) =>
      current.map((p) =>
        p.payment_id && targetIds.includes(p.payment_id) ? { ...p, payment_status: "received" } : p
      )
    );

    try {
      const result = await bulkUpdateCashStatusAction({
        paymentIds: targetIds,
        status: "received",
      });

      if (result.success) {
        const { successCount, failedCount } = result.data ?? { successCount: 0, failedCount: 0 };
        toast("一括受領が完了しました", {
          description: `${successCount}件受領、${failedCount > 0 ? `${failedCount}件失敗` : "全て成功"}`,
        });
        setSelectedPaymentIds([]);
        startTransition(() => router.refresh());
      } else {
        throw new Error(result.error?.userMessage || "一括更新に失敗しました");
      }
    } catch (error) {
      setLocalParticipants(prev);
      const errorMessage = error instanceof Error ? error.message : "一括受領に失敗しました";
      toast.error("一括更新に失敗しました", {
        description: errorMessage,
      });
    } finally {
      setIsBulkUpdating(false);
    }
  }, [validSelectedPaymentIds, localParticipants, router, bulkUpdateCashStatusAction]);

  const handleBulkWaive = useCallback(async () => {
    if (validSelectedPaymentIds.length === 0) {
      toast.error("選択エラー", {
        description: "免除対象の決済を選択してください。",
      });
      return;
    }

    setIsBulkUpdating(true);
    const prev = localParticipants;
    const targetIds = [...validSelectedPaymentIds];

    setLocalParticipants((current) =>
      current.map((p) =>
        p.payment_id && targetIds.includes(p.payment_id) ? { ...p, payment_status: "waived" } : p
      )
    );

    try {
      const result = await bulkUpdateCashStatusAction({
        paymentIds: targetIds,
        status: "waived",
      });

      if (result.success) {
        const { successCount, failedCount } = result.data ?? { successCount: 0, failedCount: 0 };
        toast("一括免除が完了しました", {
          description: `${successCount}件免除、${failedCount > 0 ? `${failedCount}件失敗` : "全て成功"}`,
        });
        setSelectedPaymentIds([]);
        startTransition(() => router.refresh());
      } else {
        throw new Error(result.error?.userMessage || "一括更新に失敗しました");
      }
    } catch (error) {
      setLocalParticipants(prev);
      const errorMessage = error instanceof Error ? error.message : "一括免除に失敗しました";
      toast.error("一括更新に失敗しました", {
        description: errorMessage,
      });
    } finally {
      setIsBulkUpdating(false);
    }
  }, [validSelectedPaymentIds, localParticipants, router, bulkUpdateCashStatusAction]);

  const handleSelectPayment = useCallback((paymentId: string, checked: boolean) => {
    setSelectedPaymentIds((prev) =>
      checked ? [...prev, paymentId] : prev.filter((id) => id !== paymentId)
    );
  }, []);

  const handleCancel = useCallback(
    async (paymentId: string) => {
      setIsUpdating(true);
      const prev = localParticipants;
      applyLocal(paymentId, "pending");
      try {
        const result = await updateCashStatusAction({
          paymentId,
          status: "pending",
          isCancel: true,
          notes: "管理者による決済取り消し",
        });
        if (result.success) {
          toast("受領を取り消しました", {
            description: "ステータスを「未決済」に戻しました。",
          });
          startTransition(() => router.refresh());
        } else {
          throw new Error(result.error?.userMessage || "更新に失敗しました");
        }
      } catch {
        setLocalParticipants(prev);
        toast.error("取り消しに失敗しました", {
          description: "しばらく待ってから再度お試しください。",
        });
      } finally {
        setIsUpdating(false);
      }
    },
    [router, localParticipants, applyLocal, updateCashStatusAction]
  );

  const handleOpenDeleteMistaken = useCallback((participant: ParticipantView) => {
    setDeleteErrorMessage(null);
    setDeleteTarget(participant);
  }, []);

  const handleCloseDeleteMistaken = useCallback(() => {
    setDeleteErrorMessage(null);
    setDeleteTarget(null);
  }, []);

  const handleConfirmDeleteMistaken = useCallback(async () => {
    if (!deleteTarget) return;

    setDeleteErrorMessage(null);
    setIsUpdating(true);
    const prev = localParticipants;
    const attendanceId = deleteTarget.attendance_id;
    setLocalParticipants((current) =>
      current.filter((participant) => participant.attendance_id !== attendanceId)
    );
    setSelectedPaymentIds((current) =>
      current.filter((paymentId) => paymentId !== deleteTarget.payment_id)
    );

    try {
      const result = await deleteMistakenAttendanceAction({ eventId, attendanceId });
      if (!result.success) {
        throw new Error(result.error?.userMessage || "参加者の削除に失敗しました");
      }

      toast("参加者を削除しました", {
        description: "",
      });
      setDeleteTarget(null);
      startTransition(() => router.refresh());
    } catch (error) {
      setLocalParticipants(prev);
      const errorMessage = error instanceof Error ? error.message : "参加者の削除に失敗しました";
      setDeleteErrorMessage(errorMessage);
    } finally {
      setIsUpdating(false);
    }
  }, [deleteMistakenAttendanceAction, deleteTarget, eventId, localParticipants, router]);

  const requiresPaymentMethodForAttendance = useCallback(
    (participant: ParticipantView, nextStatus: AttendanceStatus) => {
      return (
        eventFee > 0 &&
        nextStatus === "attending" &&
        participant.status !== "attending" &&
        !hasPreservedPayment(participant.payment_status)
      );
    },
    [eventFee]
  );

  const handleOpenAttendanceUpdate = useCallback(
    (participant: ParticipantView) => {
      const defaultNextStatus: AttendanceStatus =
        participant.status === "attending" ? "not_attending" : "attending";
      setAttendanceTarget(participant);
      setNextAttendanceStatus(defaultNextStatus);
      setAttendancePaymentMethod(
        requiresPaymentMethodForAttendance(participant, defaultNextStatus)
          ? getDefaultPaymentMethod()
          : undefined
      );
      setAttendanceErrorMessage(null);
      setRequiresFinalizedPaymentConfirmation(false);
      setRequiresPastEventConfirmation(false);
    },
    [getDefaultPaymentMethod, requiresPaymentMethodForAttendance]
  );

  const handleCloseAttendanceUpdate = useCallback(() => {
    setAttendanceTarget(null);
    setAttendanceErrorMessage(null);
    setRequiresFinalizedPaymentConfirmation(false);
    setRequiresPastEventConfirmation(false);
  }, []);

  const handleNextAttendanceStatusChange = useCallback(
    (value: AttendanceStatus) => {
      setNextAttendanceStatus(value);
      if (attendanceTarget && requiresPaymentMethodForAttendance(attendanceTarget, value)) {
        setAttendancePaymentMethod((current) => current ?? getDefaultPaymentMethod());
      } else {
        setAttendancePaymentMethod(undefined);
      }
    },
    [attendanceTarget, getDefaultPaymentMethod, requiresPaymentMethodForAttendance]
  );

  const applyLocalAttendanceStatus = useCallback(
    (result: AdminUpdateAttendanceStatusResult) => {
      const now = new Date().toISOString();
      setLocalParticipants((current) =>
        current.map((participant) => {
          if (participant.attendance_id !== result.attendanceId) return participant;

          const next: ParticipantView = {
            ...participant,
            status: result.newStatus,
            attendance_updated_at: now,
          };

          if (result.paymentEffect === "open_payment_canceled") {
            return {
              ...next,
              payment_status:
                participant.payment_status === "pending" || participant.payment_status === "failed"
                  ? "canceled"
                  : participant.payment_status,
              payment_updated_at: now,
            };
          }

          if (
            result.paymentEffect === "payment_created" ||
            result.paymentEffect === "open_payment_reused"
          ) {
            return {
              ...next,
              payment_id: result.paymentId ?? participant.payment_id,
              payment_method: result.paymentMethod ?? participant.payment_method,
              payment_status: result.paymentStatus ?? participant.payment_status,
              amount: eventFee,
              payment_updated_at: now,
            };
          }

          return next;
        })
      );
    },
    [eventFee]
  );

  const handleConfirmAttendanceUpdate = useCallback(async () => {
    if (!attendanceTarget) return;

    if (eventStatus === "canceled") {
      setAttendanceErrorMessage("中止済みイベントの出欠は変更できません。");
      return;
    }

    if (attendanceTarget.status === nextAttendanceStatus) {
      handleCloseAttendanceUpdate();
      return;
    }

    const requiresPaymentMethod = requiresPaymentMethodForAttendance(
      attendanceTarget,
      nextAttendanceStatus
    );

    if (requiresPaymentMethod && !attendancePaymentMethod) {
      setAttendanceErrorMessage("有料イベントで参加に変更するには、支払い方法を選択してください。");
      return;
    }

    setAttendanceErrorMessage(null);
    setIsUpdating(true);

    try {
      const result = await adminUpdateAttendanceStatusAction({
        eventId,
        attendanceId: attendanceTarget.attendance_id,
        status: nextAttendanceStatus,
        ...(requiresPaymentMethod && attendancePaymentMethod
          ? { paymentMethod: attendancePaymentMethod }
          : {}),
        acknowledgedFinalizedPayment:
          isFinalizedPaymentStatus(attendanceTarget.payment_status) ||
          requiresFinalizedPaymentConfirmation,
        acknowledgedPastEvent: eventStatus === "past" || requiresPastEventConfirmation,
        notes: "主催者による代理出欠変更",
      });

      if (!result.success) {
        throw new Error(result.error?.userMessage || "出欠変更に失敗しました");
      }

      const responseData = result.data;
      if ("confirmRequired" in responseData && responseData.confirmRequired) {
        if (responseData.reason === "finalized_payment") {
          setRequiresFinalizedPaymentConfirmation(true);
          return;
        }

        if (responseData.reason === "past_event") {
          setRequiresPastEventConfirmation(true);
          return;
        }
      }

      const updateResult = responseData as AdminUpdateAttendanceStatusResult;
      applyLocalAttendanceStatus(updateResult);
      toast("出欠を更新しました", {
        description: `${attendanceTarget.nickname}を「${getAttendanceStatusLabel(updateResult.newStatus)}」に変更しました。`,
      });
      handleCloseAttendanceUpdate();
      startTransition(() => router.refresh());
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "出欠変更に失敗しました";
      setAttendanceErrorMessage(errorMessage);
    } finally {
      setIsUpdating(false);
    }
  }, [
    adminUpdateAttendanceStatusAction,
    applyLocalAttendanceStatus,
    attendancePaymentMethod,
    attendanceTarget,
    eventId,
    eventStatus,
    handleCloseAttendanceUpdate,
    nextAttendanceStatus,
    requiresFinalizedPaymentConfirmation,
    requiresPastEventConfirmation,
    requiresPaymentMethodForAttendance,
    router,
  ]);

  // columns
  const columns = useMemo(
    () =>
      buildParticipantsColumns({
        eventFee,
        handlers: {
          onReceive: handleReceive,
          onCancel: handleCancel,
          onDeleteMistaken: handleOpenDeleteMistaken,
          onUpdateAttendance: handleOpenAttendanceUpdate,
          isUpdating,
        },
        isSelectionMode,
        bulkSelection:
          !isFreeEvent && isSelectionMode
            ? {
                selectedPaymentIds: validSelectedPaymentIds,
                onSelect: handleSelectPayment,
                isDisabled: isBulkUpdating || isUpdating,
              }
            : undefined,
      }),
    [
      eventFee,
      isUpdating,
      handleReceive,
      handleCancel,
      handleOpenDeleteMistaken,
      handleOpenAttendanceUpdate,
      isFreeEvent,
      validSelectedPaymentIds,
      handleSelectPayment,
      isBulkUpdating,
      isSelectionMode,
    ]
  );

  // pagination/sorting handlers -> URLパラメータ更新
  const handlePageChange = (newPageIndex: number) => {
    onParamsChange({ page: newPageIndex + 1 });
  };

  const handlePageSizeChange = (newLimitStr: string) => {
    onParamsChange({ limit: Number.parseInt(newLimitStr, 10), page: 1 });
  };

  const handleSortingChange = (
    updaterOrValue: SortingState | ((old: SortingState) => SortingState)
  ) => {
    const next = typeof updaterOrValue === "function" ? updaterOrValue(sorting) : updaterOrValue;
    setSorting(next);
    if (!next.length) {
      onParamsChange({ smart: false, sort: undefined, order: undefined });
      return;
    }
    const s = next[0];
    onParamsChange({
      smart: false,
      sort: s.id as ParticipantSortField,
      order: s.desc ? "desc" : "asc",
    });
  };

  // 行スタイリング関数
  const getRowClassName = useCallback(
    (row: Row<ParticipantView>) => {
      const p = row.original;
      const isActionRequired =
        !isFreeEvent && p.status === "attending" && isPaymentUnpaid(p.payment_status);
      return isActionRequired
        ? "bg-destructive/5 hover:bg-destructive/5 border-l-2 !border-l-destructive shadow-[inset_1px_0_0_0_hsl(var(--destructive)/0.1)]"
        : "";
    },
    [isFreeEvent]
  );

  const attendanceChangeRequiresPaymentMethod =
    attendanceTarget !== null &&
    requiresPaymentMethodForAttendance(attendanceTarget, nextAttendanceStatus);
  const attendanceChangeHasFinalizedPayment =
    attendanceTarget !== null && isFinalizedPaymentStatus(attendanceTarget.payment_status);
  const canUseCashForAttendanceChange = eventPaymentMethods.includes("cash");
  const canUseStripeForAttendanceChange = eventPaymentMethods.includes("stripe");

  return (
    <Card className="overflow-hidden bg-background/78 shadow-none border-0">
      <CardHeader className="border-b border-border/25 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-[15px] font-semibold tracking-tight text-foreground/92">
              {totalCount}名を表示中
            </CardTitle>
          </div>
          {viewMode ? (
            <ViewModeToggle value={viewMode} onChange={handleViewModeChange} />
          ) : (
            <div className="h-9 w-20 rounded-md border bg-muted/20" aria-hidden="true" />
          )}
        </div>
      </CardHeader>
      <CardContent className={`px-3 py-3 ${hasBulkActionBar ? "pb-32 sm:pb-28" : ""}`}>
        {viewMode ? (
          <div
            className={`transition-opacity duration-200 ${isTransitioning ? "opacity-50" : "opacity-100"}`}
          >
            {viewMode === "table" ? (
              <DataTable
                columns={columns}
                data={paginatedParticipants}
                pageIndex={page - 1}
                pageSize={limit}
                pageCount={totalPages}
                sorting={sorting}
                onSortingChange={handleSortingChange}
                getRowClassName={getRowClassName}
              />
            ) : (
              <CardsView
                participants={paginatedParticipants}
                eventFee={eventFee}
                isUpdating={isUpdating}
                onReceive={handleReceive}
                onCancel={handleCancel}
                onDeleteMistaken={handleOpenDeleteMistaken}
                onUpdateAttendance={handleOpenAttendanceUpdate}
                isSelectionMode={isSelectionMode}
                bulkSelection={
                  !isFreeEvent && isSelectionMode
                    ? {
                        selectedPaymentIds: validSelectedPaymentIds,
                        onSelect: handleSelectPayment,
                        isDisabled: isBulkUpdating || isUpdating,
                      }
                    : undefined
                }
              />
            )}
          </div>
        ) : (
          <div className="h-40 rounded-md border bg-muted/10" aria-hidden="true" />
        )}

        {(totalPages > 1 || totalCount > 50) && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-1 py-6 sm:px-2">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
              <div className="text-[10px] font-bold text-muted-foreground/50 tracking-[0.14em] uppercase">
                SHOWING {(page - 1) * limit + 1} – {Math.min(page * limit, totalCount)} OF{" "}
                {totalCount}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                  表示件数:
                </span>
                <Select value={String(limit)} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="w-[70px] h-8 text-[12px] font-bold rounded-lg border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-border/60 shadow-xl">
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="150">150</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5 bg-muted/30 p-1 rounded-xl border border-border/40">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(page - 2)}
                  disabled={!hasPrev}
                  className="h-8 w-8 rounded-lg hover:bg-background hover:shadow-sm"
                >
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </Button>
                <div className="flex items-center px-2 min-w-[60px] justify-center">
                  <span className="text-[12px] font-bold text-foreground">
                    {page} <span className="text-muted-foreground/40 font-medium mx-1">/</span>{" "}
                    {totalPages}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handlePageChange(page)}
                  disabled={!hasNext}
                  className="h-8 w-8 rounded-lg hover:bg-background hover:shadow-sm"
                >
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* 下部固定の一括操作バー */}
      {!isFreeEvent && (
        <BulkActionBar
          selectedCount={validSelectedPaymentIds.length}
          totalOperableCount={bulkOperableParticipants.length}
          onBulkReceive={handleBulkReceive}
          onBulkWaive={handleBulkWaive}
          onClearSelection={() => {
            setSelectedPaymentIds([]);
            if (onSelectionModeChange) onSelectionModeChange(false);
          }}
          isProcessing={isBulkUpdating || isUpdating}
        />
      )}
      <Dialog
        open={!!attendanceTarget}
        onOpenChange={(open) => !open && handleCloseAttendanceUpdate()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>出欠を代理変更</DialogTitle>
            <DialogDescription>
              <span className="block text-foreground">
                {attendanceTarget?.nickname}の出欠を主催者として変更します。
              </span>
              <span className="block mt-1">
                支払い状態の変更や返金は、この操作では行われません。
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="attendance-status-select">変更後の出欠</Label>
              <Select
                value={nextAttendanceStatus}
                onValueChange={(value) =>
                  handleNextAttendanceStatusChange(value as AttendanceStatus)
                }
                disabled={isUpdating}
              >
                <SelectTrigger id="attendance-status-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="attending">参加</SelectItem>
                  <SelectItem value="maybe">未定</SelectItem>
                  <SelectItem value="not_attending">不参加</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {attendanceChangeRequiresPaymentMethod && (
              <div className="space-y-2">
                <Label htmlFor="attendance-payment-method-select">支払い方法</Label>
                <Select
                  value={attendancePaymentMethod}
                  onValueChange={(value) => setAttendancePaymentMethod(value as PaymentMethod)}
                  disabled={isUpdating}
                >
                  <SelectTrigger id="attendance-payment-method-select">
                    <SelectValue placeholder="支払い方法を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {canUseCashForAttendanceChange && <SelectItem value="cash">現金</SelectItem>}
                    {canUseStripeForAttendanceChange && (
                      <SelectItem value="stripe">オンライン</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(eventStatus === "past" || requiresPastEventConfirmation) && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>イベント後の台帳修正として記録されます。</AlertDescription>
              </Alert>
            )}

            {(attendanceChangeHasFinalizedPayment || requiresFinalizedPaymentConfirmation) && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  この参加者は確定済みの支払いがあります。
                  <br />
                  出欠のみ変更され、支払い状態は維持されます。
                </AlertDescription>
              </Alert>
            )}

            {attendanceErrorMessage && (
              <Alert variant="destructive">
                <AlertDescription>{attendanceErrorMessage}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseAttendanceUpdate} disabled={isUpdating}>
              戻る
            </Button>
            <Button
              onClick={() => void handleConfirmAttendanceUpdate()}
              disabled={
                isUpdating ||
                !attendanceTarget ||
                attendanceTarget.status === nextAttendanceStatus ||
                (attendanceChangeRequiresPaymentMethod && !attendancePaymentMethod)
              }
            >
              {isUpdating ? "処理中..." : "変更する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && handleCloseDeleteMistaken()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>参加者を削除しますか？</DialogTitle>
            <DialogDescription>
              <span className="block text-foreground">
                {deleteTarget?.nickname}の登録を削除します。
              </span>
            </DialogDescription>
          </DialogHeader>
          {deleteErrorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{deleteErrorMessage}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDeleteMistaken} disabled={isUpdating}>
              戻る
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDeleteMistaken()}
              disabled={isUpdating || !deleteTarget}
            >
              {isUpdating ? "処理中..." : "削除する"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
