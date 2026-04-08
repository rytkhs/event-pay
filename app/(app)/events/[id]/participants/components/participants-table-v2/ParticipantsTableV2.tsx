"use client";

import React, { useCallback, useEffect, useMemo, useState, startTransition } from "react";

import { useRouter } from "next/navigation";

import { SortingState, Row } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { useToast } from "@core/contexts/toast-context";
import type { ActionResult } from "@core/errors/adapters/server-actions";
import { conditionalSmartSort } from "@core/utils/participant-smart-sort";
import { isPaymentUnpaid, toSimplePaymentStatus } from "@core/utils/payment-status-mapper";
import type { ParticipantView } from "@core/validation/participant-management";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  allParticipants: ParticipantView[];
  query: EventManagementQuery;
  onParamsChange: (patch: EventManagementQueryPatch) => void;
  updateCashStatusAction: UpdateCashStatusAction;
  bulkUpdateCashStatusAction: BulkUpdateCashStatusAction;
  isSelectionMode?: boolean;
  onSelectionModeChange?: (isSelectionMode: boolean) => void;
}

export function ParticipantsTableV2({
  eventId: _eventId,
  eventFee,
  allParticipants,
  query,
  onParamsChange,
  updateCashStatusAction,
  bulkUpdateCashStatusAction,
  isSelectionMode = false,
  onSelectionModeChange,
}: ParticipantsTableV2Props) {
  const { toast } = useToast();
  const isFreeEvent = eventFee === 0;
  const router = useRouter();

  const [viewMode, setViewMode] = useState<"table" | "cards" | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);

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
          toast({
            title: "決済状況を更新しました",
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
        toast({
          title: "更新に失敗しました",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setIsUpdating(false);
      }
    },
    [toast, router, localParticipants, applyLocal, updateCashStatusAction]
  );

  const handleBulkReceive = useCallback(async () => {
    if (validSelectedPaymentIds.length === 0) {
      toast({
        title: "選択エラー",
        description: "受領対象の決済を選択してください。",
        variant: "destructive",
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
        toast({
          title: "一括受領が完了しました",
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
      toast({
        title: "一括更新に失敗しました",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsBulkUpdating(false);
    }
  }, [validSelectedPaymentIds, localParticipants, toast, router, bulkUpdateCashStatusAction]);

  const handleBulkWaive = useCallback(async () => {
    if (validSelectedPaymentIds.length === 0) {
      toast({
        title: "選択エラー",
        description: "免除対象の決済を選択してください。",
        variant: "destructive",
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
        toast({
          title: "一括免除が完了しました",
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
      toast({
        title: "一括更新に失敗しました",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsBulkUpdating(false);
    }
  }, [validSelectedPaymentIds, localParticipants, toast, router, bulkUpdateCashStatusAction]);

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
          toast({
            title: "受領を取り消しました",
            description: "ステータスを「未決済」に戻しました。",
          });
          startTransition(() => router.refresh());
        } else {
          throw new Error(result.error?.userMessage || "更新に失敗しました");
        }
      } catch {
        setLocalParticipants(prev);
        toast({
          title: "取り消しに失敗しました",
          description: "しばらく待ってから再度お試しください。",
          variant: "destructive",
        });
      } finally {
        setIsUpdating(false);
      }
    },
    [toast, router, localParticipants, applyLocal, updateCashStatusAction]
  );

  // columns
  const columns = useMemo(
    () =>
      buildParticipantsColumns({
        eventFee,
        handlers: {
          onReceive: handleReceive,
          onCancel: handleCancel,
          isUpdating,
        },
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

  return (
    <Card className="border-none">
      <CardHeader className="px-4 py-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-md font-semibold">参加者 ({totalCount}名)</CardTitle>
          {viewMode ? (
            <ViewModeToggle value={viewMode} onChange={handleViewModeChange} />
          ) : (
            <div className="h-9 w-20 rounded-md border bg-muted/20" aria-hidden="true" />
          )}
        </div>
      </CardHeader>
      <CardContent className={`px-3 ${hasBulkActionBar ? "pb-32 sm:pb-28" : ""}`}>
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
    </Card>
  );
}
