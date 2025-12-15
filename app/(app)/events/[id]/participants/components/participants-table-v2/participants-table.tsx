"use client";

import React, { useCallback, useEffect, useMemo, useState, startTransition } from "react";

import { useRouter } from "next/navigation";

import { SortingState, Row } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, LayoutGridIcon, TableIcon } from "lucide-react";

import { useToast } from "@core/contexts/toast-context";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { bulkUpdateCashStatusAction } from "@/features/payments/actions/bulk-update-cash-status";
import { updateCashStatusAction } from "@/features/payments/actions/update-cash-status";

import { BulkActionBar } from "./bulk-action-bar";
import { CardsView } from "./cards-view";
import { buildParticipantsColumns } from "./columns";
import { DataTable } from "./data-table";

export interface ParticipantsTableV2Props {
  eventId: string;
  eventFee: number;
  allParticipants: ParticipantView[];
  searchParams: { [key: string]: string | string[] | undefined };
  onParamsChange: (params: Record<string, string | undefined>) => void;
  isSelectionMode?: boolean;
  onSelectionModeChange?: (isSelectionMode: boolean) => void;
}

export function ParticipantsTableV2({
  eventId: _eventId,
  eventFee,
  allParticipants,
  searchParams,
  onParamsChange,
  isSelectionMode = false,
  onSelectionModeChange,
}: ParticipantsTableV2Props) {
  const { toast } = useToast();
  const isFreeEvent = eventFee === 0;
  const router = useRouter();

  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<string[]>([]);

  // localStorage によるビュー永続化 + モバイル時は強制cards
  useEffect(() => {
    const saved = localStorage.getItem("event-participants-view-mode") as "table" | "cards" | null;
    const check = () => {
      const mobile = window.innerWidth < 768;
      if (mobile) setViewMode("cards");
      else if (saved) setViewMode(saved);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
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
      localStorage.setItem("event-participants-view-mode", newMode);
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
    const search = typeof searchParams.search === "string" ? searchParams.search.toLowerCase() : "";
    if (search) {
      result = result.filter(
        (p) => p.nickname.toLowerCase().includes(search) || p.email.toLowerCase().includes(search)
      );
    }

    // 出席ステータスフィルタ
    const attendance = typeof searchParams.attendance === "string" ? searchParams.attendance : null;
    if (attendance && attendance !== "all") {
      result = result.filter((p) => p.status === attendance);
    }

    // 決済方法フィルタ
    const paymentMethod =
      typeof searchParams.payment_method === "string" ? searchParams.payment_method : null;
    if (paymentMethod) {
      result = result.filter((p) => p.payment_method === paymentMethod);
    }

    // 決済ステータスフィルタ (SimplePaymentStatus)
    const paymentStatus =
      typeof searchParams.payment_status === "string" ? searchParams.payment_status : null;
    if (paymentStatus) {
      result = result.filter((p) => {
        const simple = toSimplePaymentStatus(p.payment_status);
        return simple === paymentStatus;
      });
    }

    return result;
  }, [localParticipants, searchParams]);

  // =======================================================
  // スマートソート（全フィルタ済みデータに対して）
  // =======================================================
  const smartActive = searchParams.smart !== "0";
  const sortedParticipants = useMemo(() => {
    return conditionalSmartSort(filteredParticipants, isFreeEvent, smartActive);
  }, [filteredParticipants, isFreeEvent, smartActive]);

  // =======================================================
  // クライアントサイドページネーション
  // =======================================================
  const page = typeof searchParams.page === "string" ? parseInt(searchParams.page, 10) : 1;
  const limit = typeof searchParams.limit === "string" ? parseInt(searchParams.limit, 10) : 150;

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

  // =======================================================
  // ソート状態
  // =======================================================
  const initialSorting: SortingState = useMemo(() => {
    const sort = typeof searchParams.sort === "string" ? searchParams.sort : undefined;
    const order =
      searchParams.order === "asc" ? "asc" : searchParams.order === "desc" ? "desc" : undefined;
    if (sort && order) return [{ id: sort, desc: order === "desc" }];
    return [];
  }, [searchParams.sort, searchParams.order]);

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
          throw new Error(result.error);
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
    [toast, router, localParticipants, applyLocal]
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
        const { successCount, failedCount } = result.data;
        toast({
          title: "一括受領が完了しました",
          description: `${successCount}件受領、${failedCount > 0 ? `${failedCount}件失敗` : "全て成功"}`,
        });
        setSelectedPaymentIds([]);
        startTransition(() => router.refresh());
      } else {
        throw new Error(result.error);
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
  }, [validSelectedPaymentIds, localParticipants, toast, router]);

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
        const { successCount, failedCount } = result.data;
        toast({
          title: "一括免除が完了しました",
          description: `${successCount}件免除、${failedCount > 0 ? `${failedCount}件失敗` : "全て成功"}`,
        });
        setSelectedPaymentIds([]);
        startTransition(() => router.refresh());
      } else {
        throw new Error(result.error);
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
  }, [validSelectedPaymentIds, localParticipants, toast, router]);

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
            title: "決済を取り消しました",
            description: "ステータスを「未決済」に戻しました。",
          });
          startTransition(() => router.refresh());
        } else {
          throw new Error(result.error);
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
    [toast, router, localParticipants, applyLocal]
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
    onParamsChange({ page: String(newPageIndex + 1) });
  };

  const handlePageSizeChange = (newLimitStr: string) => {
    onParamsChange({ limit: newLimitStr, page: "1" });
  };

  const handleSortingChange = (
    updaterOrValue: SortingState | ((old: SortingState) => SortingState)
  ) => {
    const next = typeof updaterOrValue === "function" ? updaterOrValue(sorting) : updaterOrValue;
    setSorting(next);
    if (!next.length) {
      onParamsChange({ sort: undefined, order: undefined });
      return;
    }
    const s = next[0];
    onParamsChange({ sort: s.id, order: s.desc ? "desc" : "asc" });
  };

  // 行スタイリング関数
  const getRowClassName = useCallback(
    (row: Row<ParticipantView>) => {
      const p = row.original;
      const isActionRequired =
        !isFreeEvent && p.status === "attending" && isPaymentUnpaid(p.payment_status);
      return isActionRequired ? "bg-red-50 border-l-4 !border-l-red-500" : "";
    },
    [isFreeEvent]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold">参加者一覧 ({totalCount}件)</CardTitle>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v: any) => v && handleViewModeChange(v)}
            className="border rounded-md"
            aria-label="表示形式を選択"
          >
            <ToggleGroupItem value="table" aria-label="テーブル表示">
              <TableIcon className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="cards" aria-label="カード表示">
              <LayoutGridIcon className="h-4 w-4" />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </CardHeader>
      <CardContent>
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

        {(totalPages > 1 || totalCount > 150) && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4 py-3 sm:px-6 border-t">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="text-sm text-gray-700">
                {totalCount}件中 {(page - 1) * limit + 1}-{Math.min(page * limit, totalCount)}
                件を表示
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">表示件数:</span>
                <Select value={String(limit)} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="w-20 h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="150">150</SelectItem>
                    <SelectItem value="200">200</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page - 2)}
                  disabled={!hasPrev}
                  className="min-h-[44px] min-w-[44px]"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm text-gray-700 px-2 sm:px-3">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(page)}
                  disabled={!hasNext}
                  className="min-h-[44px] min-w-[44px]"
                >
                  <ChevronRight className="h-4 w-4" />
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
