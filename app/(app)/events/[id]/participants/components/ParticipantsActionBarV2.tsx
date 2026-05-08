"use client";

import { useEffect, useState, type ReactNode, startTransition } from "react";

import { Plus, Download, Search, X, ListTodo, MoreVertical } from "lucide-react";
import { toast } from "sonner";

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
  statusTabs?: ReactNode;
  activeFilters?: ReactNode;
  isSelectionMode?: boolean;
  onToggleSelectionMode?: () => void;
}

export function ParticipantsActionBarV2({
  eventId,
  eventDetail,
  query,
  onFiltersChange,
  filterTrigger,
  statusTabs,
  activeFilters,
  isSelectionMode = false,
  onToggleSelectionMode,
}: ParticipantsActionBarV2Props) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addNickname, setAddNickname] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash">("cash");

  // インライン検索
  const [searchQuery, setSearchQuery] = useState(query.search);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // イベントが有料かどうかを判定
  const isPayingEvent = eventDetail.fee > 0;

  useEffect(() => {
    setSearchQuery(query.search);
  }, [query.search]);

  useEffect(() => {
    const normalized = searchQuery.trim();
    if (normalized === query.search) return;

    const timer = window.setTimeout(() => {
      startTransition(() => {
        onFiltersChange({ search: normalized });
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchQuery, query.search, onFiltersChange]);

  const handleOpenAdd = () => {
    setAddNickname("");
    setAddError(null);
    setPaymentMethod("cash");
    setShowAddDialog(true);
  };

  const handleSubmitAdd = async () => {
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
        ...(isPayingEvent && { paymentMethod }),
      });

      if (!result.success) {
        toast.error("追加に失敗しました", {
          description: result.error?.userMessage || "参加者の追加に失敗しました",
        });
        return;
      }

      const data = result.data as AdminAddAttendanceResult;
      const successDescription = isPayingEvent
        ? "参加者を追加しました。現金（未集金）として記録されました。"
        : data.canOnlinePay
          ? "参加者を追加しました（現在オンライン決済が可能です）"
          : "参加者を追加しました（オンライン決済は現在できません）";

      toast("参加者を追加しました", {
        description: successDescription,
      });
      setShowAddDialog(false);

      window.location.reload();
    } catch (_error) {
      toast.error("エラーが発生しました", {
        description: "参加者の追加に失敗しました",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleExportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      toast("CSV エクスポート", {
        description: "個人情報の取り扱いには十分注意してください。(最大 1,000 件まで)",
        duration: 3000,
      });

      const result = await exportParticipantsCsvAction({
        eventId,
        filters: {},
      });

      if (!result.success) {
        toast.error("エクスポート失敗", {
          description: result.error.userMessage || "CSVエクスポートに失敗しました。",
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

        toast("エクスポート完了", {
          description: `${filename} をダウンロードしました。`,
        });
      }
    } catch (_error) {
      toast.error("エクスポート失敗", {
        description: "CSVエクスポートでエラーが発生しました。",
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

  const handleClearSearch = () => {
    setSearchQuery("");
    onFiltersChange({ search: "" });
  };

  return (
    <>
      <div className="overflow-hidden rounded-[1.5rem] border border-border/28 bg-background shadow-[0_10px_24px_-30px_hsl(var(--foreground)/0.16)]">
        <div className="flex min-h-[3.25rem] items-center gap-2 px-2 py-2 sm:px-3">
          <div className="flex min-w-0 flex-1 items-center">
            {isMobileSearchOpen ? (
              <div className="flex flex-1 items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-200">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="ニックネームで検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 rounded-xl border-border/40 bg-background/60 pl-9 pr-8 text-base shadow-[inset_0_1px_0_hsl(var(--background)),0_1px_2px_hsl(var(--foreground)/0.02)] focus-visible:border-primary/20 focus-visible:ring-primary/5 md:text-sm"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleClearSearch}
                      aria-label="検索条件をクリア"
                      className="absolute right-2 top-1/2 rounded-lg p-1 -translate-y-1/2 transition-colors hover:bg-muted"
                    >
                      <X className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMobileSearchOpen(false)}
                  className="h-9 w-9 rounded-xl p-0 text-muted-foreground/75 hover:bg-muted/55 hover:text-foreground"
                  aria-label="検索入力を閉じる"
                >
                  <X className="h-5 w-5 text-muted-foreground" />
                </Button>
              </div>
            ) : (
              <div className="flex w-full min-w-0 items-center gap-2 lg:gap-3">
                <div className="hidden max-w-sm flex-1 items-center md:flex">
                  <div
                    className={cn(
                      "relative flex h-10 flex-1 items-center overflow-hidden rounded-xl border transition-all duration-200",
                      isSearchFocused
                        ? "border-primary/20 bg-background/80 shadow-[0_8px_18px_-18px_hsl(var(--foreground)/0.22)] ring-4 ring-primary/5"
                        : "border-border/40 bg-background/55 hover:border-border/55 hover:bg-background/75"
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
                      onFocus={() => setIsSearchFocused(true)}
                      onBlur={() => setIsSearchFocused(false)}
                      className="h-full border-none bg-transparent pl-9 pr-8 text-sm shadow-none focus-visible:ring-0"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={handleClearSearch}
                        aria-label="検索条件をクリア"
                        className="absolute right-1.5 rounded-md p-1 transition-colors hover:bg-muted"
                      >
                        <X className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="md:hidden">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsMobileSearchOpen(true)}
                    className="h-9 w-9 rounded-xl p-0 text-muted-foreground/75 hover:bg-muted/55 hover:text-foreground"
                    aria-label="検索を開く"
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>

                {filterTrigger}
                <SmartSortToggle
                  isActive={smartActive}
                  onToggle={handleToggleSmartSort}
                  showLabel={false}
                  className="h-9 rounded-xl"
                />
              </div>
            )}
          </div>

          {!isMobileSearchOpen && (
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              {isPayingEvent && onToggleSelectionMode && (
                <Button
                  variant={isSelectionMode ? "secondary" : "outline"}
                  size="sm"
                  onClick={onToggleSelectionMode}
                  className={cn(
                    "h-9 w-9 rounded-xl border-border/40 p-0 transition-all duration-200",
                    isSelectionMode
                      ? "border-border/55 bg-foreground/[0.03] text-foreground shadow-[inset_0_1px_0_hsl(var(--background))] hover:bg-foreground/[0.045]"
                      : "bg-background/65 shadow-[0_4px_12px_-14px_hsl(var(--foreground)/0.24)] hover:border-border/60 hover:bg-muted/30"
                  )}
                  aria-label={
                    isSelectionMode ? "一括操作の選択モードを終了" : "一括操作の選択モードを開始"
                  }
                >
                  <ListTodo className="h-4 w-4" />
                </Button>
              )}

              <Button
                size="sm"
                onClick={handleOpenAdd}
                className={cn(
                  "h-9 rounded-xl border border-primary/12 px-3 font-medium text-primary-foreground transition-all duration-200 sm:px-4",
                  "bg-primary",
                  "shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.14),0_10px_24px_-20px_hsl(var(--primary)/0.45)]",
                  "hover:brightness-[1.03] hover:shadow-[inset_0_1px_0_hsl(var(--primary-foreground)/0.18),0_12px_26px_-20px_hsl(var(--primary)/0.52)]",
                  "active:scale-95"
                )}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">追加</span>
              </Button>

              <div className="md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 w-9 rounded-xl p-0 text-muted-foreground/75 hover:bg-muted/55 hover:text-foreground"
                      aria-label="その他の参加者操作を開く"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    className="mt-2 w-56 rounded-xl border-border/45 bg-popover/95 shadow-[0_14px_28px_-24px_hsl(var(--foreground)/0.26)]"
                  >
                    <DropdownMenuItem
                      onClick={handleExportCsv}
                      disabled={isExporting}
                      className="mx-1 cursor-pointer gap-2 rounded-lg p-2.5 focus:bg-muted/45"
                    >
                      <Download className="h-4 w-4 text-muted-foreground focus:text-foreground" />
                      <span className="text-sm font-medium">CSVエクスポート</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="hidden border-l border-border/20 pl-2 md:block">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportCsv}
                  disabled={isExporting}
                  className={cn(
                    "h-9 gap-1.5 rounded-xl border-border/40 bg-background/65 shadow-[0_4px_12px_-14px_hsl(var(--foreground)/0.24)] transition-all duration-200",
                    "hover:border-border/60 hover:bg-muted/30 hover:shadow-[0_8px_16px_-16px_hsl(var(--foreground)/0.22)]"
                  )}
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="hidden font-medium text-foreground/80 lg:inline">CSV</span>
                </Button>
              </div>
            </div>
          )}
        </div>

        {!isMobileSearchOpen && (statusTabs || activeFilters) && (
          <div className="border-t border-border/15 bg-background px-2 py-1.5 sm:px-3">
            {statusTabs && <div className="min-w-0 overflow-x-auto">{statusTabs}</div>}
            {activeFilters && <div className="mt-1.5">{activeFilters}</div>}
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
                  void handleSubmitAdd();
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
          </div>
          <DialogFooter>
            <Button
              onClick={() => void handleSubmitAdd()}
              disabled={isAdding || !addNickname || addNickname.trim().length === 0}
              className="w-full sm:w-auto"
            >
              {isAdding ? "追加中..." : "追加"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
