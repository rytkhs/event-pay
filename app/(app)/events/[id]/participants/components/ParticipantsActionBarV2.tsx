"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Plus, Download, Search, X, ListTodo, MoreVertical } from "lucide-react";

import { useToast } from "@core/contexts/toast-context";
import type { Event } from "@core/types/event";
import type {
  ExportParticipantsCsvResult,
  AdminAddAttendanceResult,
} from "@core/validation/participant-management";

import { cn } from "@/components/ui/_lib/cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

import type { EventManagementQuery, EventManagementQueryPatch } from "../../query-params";
import { adminAddAttendanceAction, exportParticipantsCsvAction } from "../actions";

import { SmartSortToggle } from "./SmartSortToggle";

interface ParticipantsActionBarV2Props {
  eventId: string;
  eventDetail: Event;
  query: EventManagementQuery;
  onFiltersChange: (patch: EventManagementQueryPatch) => void;
  filterTrigger: ReactNode;
  isSelectionMode?: boolean;
  onToggleSelectionMode?: () => void;
}

export function ParticipantsActionBarV2({
  eventId,
  eventDetail,
  query,
  onFiltersChange,
  filterTrigger,
  isSelectionMode = false,
  onToggleSelectionMode,
}: ParticipantsActionBarV2Props) {
  const { toast } = useToast();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addNickname, setAddNickname] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash">("cash");
  const [confirmOverCapacity, setConfirmOverCapacity] = useState<null | {
    capacity?: number | null;
    current?: number;
  }>(null);

  // インライン検索
  const [searchQuery, setSearchQuery] = useState(query.search);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // イベントが有料かどうかを判定
  const isPayingEvent = eventDetail.fee > 0;

  useEffect(() => {
    setSearchQuery(query.search);
  }, [query.search]);

  const handleOpenAdd = () => {
    setAddNickname("");
    setConfirmOverCapacity(null);
    setAddError(null);
    setPaymentMethod("cash");
    setShowAddDialog(true);
  };

  const handleSubmitAdd = async (forceBypass = false) => {
    if (isAdding) return;
    if (!addNickname || addNickname.trim().length === 0) {
      setAddError("ニックネームを入力してください");
      return;
    }

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
        toast({
          title: "追加に失敗しました",
          description: result.error?.userMessage || "参加者の追加に失敗しました",
          variant: "destructive",
        });
        return;
      }

      // confirmRequired の特殊ケース（成功として返される）
      if ("confirmRequired" in result.data && result.data.confirmRequired) {
        const payload = result.data;
        setConfirmOverCapacity({ capacity: payload.capacity, current: payload.current });
        return;
      }

      const data = result.data as AdminAddAttendanceResult;
      const successDescription = isPayingEvent
        ? "参加者を追加しました。現金決済（未払い）として記録されました。"
        : data.canOnlinePay
          ? "参加者を追加しました（現在オンライン決済が可能です）"
          : "参加者を追加しました（オンライン決済は現在できません）";

      toast({
        title: "参加者を追加しました",
        description: successDescription,
      });
      setShowAddDialog(false);
      setConfirmOverCapacity(null);

      window.location.reload();
    } catch (_error) {
      toast({
        title: "エラーが発生しました",
        description: "参加者の追加に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleExportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      toast({
        title: "CSV エクスポート",
        description: "個人情報の取り扱いには十分注意してください。(最大 1,000 件まで)",
        duration: 3000,
      });

      const result = await exportParticipantsCsvAction({
        eventId,
        filters: {},
      });

      if (!result.success) {
        toast({
          title: "エクスポート失敗",
          description: result.error.userMessage || "CSVエクスポートに失敗しました。",
          variant: "destructive",
        });
        return;
      }

      if (result.data?.csvContent) {
        const { csvContent, filename } = result.data as ExportParticipantsCsvResult;
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);

        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        toast({
          title: "エクスポート完了",
          description: `${filename} をダウンロードしました。`,
        });
      }
    } catch (_error) {
      toast({
        title: "エクスポート失敗",
        description: "CSVエクスポートでエラーが発生しました。",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const smartActive = query.smart;

  const handleToggleSmartSort = (checked: boolean) => {
    if (checked) {
      onFiltersChange({
        smart: true,
        sort: undefined,
        order: undefined,
      });
    } else {
      onFiltersChange({ smart: false });
    }
  };

  const handleSearch = () => {
    onFiltersChange({ search: searchQuery });
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    onFiltersChange({ search: "" });
  };

  return (
    <>
      <div className="flex items-center gap-2 py-1.5 px-1.5 w-full rounded-2xl border border-border/40 bg-background/40 shadow-[0_2px_12px_-4px_transparent] backdrop-blur-md transition-all duration-300 h-[3.25rem] sm:py-2 flex-nowrap">
        {/* 左側：検索エリア (Mobile対応) */}
        <div className="flex items-center flex-1 min-w-0">
          {/* Mobile: 検索展開時のみInput表示 */}
          {isMobileSearchOpen ? (
            <div className="flex items-center flex-1 gap-2 animate-in fade-in slide-in-from-left-2 direction-normal duration-200">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ニックネームで検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9 pr-8 h-10 rounded-xl border-border/50 bg-muted/40 shadow-inner text-base md:text-sm focus-visible:ring-primary/20 focus-visible:border-primary/40 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    aria-label="検索条件をクリア"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-lg transition-colors"
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobileSearchOpen(false)}
                className="shrink-0 h-9 w-9 p-0 rounded-xl transition-colors hover:bg-muted/80"
                aria-label="検索入力を閉じる"
              >
                <X className="h-5 w-5 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            // 通常表示
            <div className="flex items-center w-full gap-2 lg:gap-3">
              {/* Desktop Search */}
              <div className="hidden md:flex items-center flex-1 max-w-sm">
                <div
                  className={cn(
                    "relative flex-1 transition-all duration-300 rounded-xl border flex items-center overflow-hidden h-9",
                    isSearchFocused
                      ? "border-primary/30 bg-background shadow-[0_2px_10px_-4px_hsl(var(--primary)/0.15)] ring-4 ring-primary/5"
                      : "border-border/50 bg-muted/20 hover:bg-muted/40 hover:border-border/70"
                  )}
                >
                  <Search
                    className={cn(
                      "absolute left-3 h-4 w-4 transition-colors",
                      isSearchFocused ? "text-primary/70" : "text-muted-foreground/70"
                    )}
                  />
                  <Input
                    placeholder="ニックネームで検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setIsSearchFocused(false)}
                    className="pl-9 pr-8 h-full border-none bg-transparent shadow-none focus-visible:ring-0 text-sm"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      aria-label="検索条件をクリア"
                      className="absolute right-1.5 p-1 hover:bg-muted rounded-md transition-colors"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              </div>

              {/* Mobile Search Trigger */}
              <div className="md:hidden">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMobileSearchOpen(true)}
                  className="h-9 w-9 p-0 rounded-xl transition-colors hover:bg-muted/80 text-muted-foreground/80 hover:text-foreground"
                  aria-label="検索を開く"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>

              {/* フィルター */}
              {filterTrigger}
            </div>
          )}
        </div>

        {/* 右側アクション群 (検索非展開時のみ) */}
        {!isMobileSearchOpen && (
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 sm:ml-auto">
            {/* 選択モード切替 (Mobile & Desktop) */}
            {isPayingEvent && onToggleSelectionMode && (
              <Button
                variant={isSelectionMode ? "secondary" : "outline"}
                size="sm"
                onClick={onToggleSelectionMode}
                className={cn(
                  "h-9 w-9 p-0 rounded-xl transition-all duration-300",
                  isSelectionMode
                    ? "bg-primary/15 text-primary border-primary/30 shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] hover:bg-primary/25"
                    : "border-border/50 bg-background shadow-sm hover:border-border/80 hover:bg-muted/80 hover:shadow-[0_4px_12px_-8px_hsl(var(--foreground)/0.1)]"
                )}
                aria-label={
                  isSelectionMode ? "一括操作の選択モードを終了" : "一括操作の選択モードを開始"
                }
              >
                <ListTodo className="h-4 w-4" />
              </Button>
            )}

            {/* 追加ボタン (Primary) */}
            <Button
              size="sm"
              onClick={handleOpenAdd}
              className={cn(
                "gap-1.5 h-9 px-3 sm:px-4 rounded-xl font-medium transition-all duration-300 border border-primary/20 text-primary-foreground",
                "bg-gradient-to-b from-primary to-primary/90",
                "shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.25),0_4px_12px_-4px_hsl(var(--primary)/0.6)]",
                "hover:brightness-110 hover:shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.35),0_6px_16px_-4px_hsl(var(--primary)/0.7)] hover:scale-[1.02]",
                "active:scale-95"
              )}
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">追加</span>
            </Button>

            {/* その他アクション (Dropdown for Mobile) */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0 rounded-xl transition-colors hover:bg-muted/80 text-muted-foreground/80 hover:text-foreground"
                    aria-label="その他の参加者操作を開く"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-56 rounded-xl border-border/60 shadow-lg mt-2"
                >
                  <div className="p-2.5 border-b border-border/50 mb-1">
                    <SmartSortToggle
                      isActive={smartActive}
                      onToggle={handleToggleSmartSort}
                      showLabel={true}
                    />
                  </div>
                  <DropdownMenuItem
                    onClick={handleExportCsv}
                    disabled={isExporting}
                    className="gap-2 p-2.5 cursor-pointer rounded-lg mx-1 focus:bg-muted/60"
                  >
                    <Download className="h-4 w-4 text-muted-foreground focus:text-foreground" />
                    <span className="font-medium text-sm">CSVエクスポート</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Desktop Actions (そのまま表示) */}
            <div className="hidden md:flex items-center gap-2 border-l border-border/40 pl-2 sm:ml-1">
              <SmartSortToggle
                isActive={smartActive}
                onToggle={handleToggleSmartSort}
                showLabel={false}
                className="h-9 rounded-xl"
              />

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={isExporting}
                className={cn(
                  "gap-1.5 h-9 rounded-xl transition-all duration-300",
                  "border-border/50 bg-background shadow-sm hover:border-border/80 hover:bg-muted/50 hover:shadow-[0_4px_12px_-8px_hsl(var(--foreground)/0.3)]"
                )}
              >
                <Download className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden lg:inline font-medium text-foreground/80">CSV</span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 参加者追加ダイアログ */}
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
                      現金 ({eventDetail.fee.toLocaleString()}円)
                    </Label>
                  </div>
                </RadioGroup>
                <p className="text-xs text-muted-foreground">
                  手動追加は現金のみ対応しています。
                  オンライン決済を利用したい場合は招待リンクから登録するよう案内してください。
                </p>
              </div>
            )}

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
    </>
  );
}
