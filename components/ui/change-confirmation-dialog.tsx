"use client";

import { Fragment } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export interface ChangeItem {
  field: string;
  fieldName: string;
  oldValue: string;
  newValue: string;
  impact?: string;
}

interface ChangeConfirmationDialogProps {
  isOpen: boolean;
  changes: ChangeItem[];
  attendeeCount?: number;
  hasStripePaid?: boolean;
  onConfirm: (changes: ChangeItem[]) => void;
  onCancel: () => void;
  onClose?: () => void;
  isLoading?: boolean;
}

export function ChangeConfirmationDialog({
  isOpen,
  changes,
  attendeeCount = 0,
  hasStripePaid = false,
  onConfirm,
  onCancel,
  onClose,
  isLoading = false,
}: ChangeConfirmationDialogProps) {
  const hasAttendees = attendeeCount > 0;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // ESCキーやオーバーレイクリックでの閉じる処理
      if (onClose) {
        onClose();
      } else {
        onCancel(); // onCloseが未定義の場合はフォールバック
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[600px] flex flex-col max-h-[calc(100vh-2rem)]"
        aria-describedby="change-confirmation-description"
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>変更内容を確認</DialogTitle>
          <DialogDescription>
            以下の変更内容をご確認ください。変更を適用する場合は「更新」をクリックしてください。
          </DialogDescription>
        </DialogHeader>

        <div
          id="change-confirmation-description"
          className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2"
        >
          {/* 副次的変更のサマリー */}
          {(() => {
            const secondaryChanges = changes.filter(
              (change) =>
                change.newValue.includes("（無料化により自動クリア）") ||
                change.newValue.includes("（オンライン決済選択解除により自動クリア）")
            );

            if (secondaryChanges.length > 0) {
              const freeEventChanges = secondaryChanges.filter((change) =>
                change.newValue.includes("（無料化により自動クリア）")
              );
              const stripeChanges = secondaryChanges.filter((change) =>
                change.newValue.includes("（オンライン決済選択解除により自動クリア）")
              );

              return (
                <div className="bg-info/10 border border-info/20 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-info text-lg">ℹ️</span>
                    <div>
                      <h4 className="font-medium text-info">自動的な変更について</h4>
                      <div className="text-sm text-info/80 mt-1 space-y-1">
                        {freeEventChanges.length > 0 && (
                          <p>
                            <strong>無料化に伴う自動クリア:</strong>{" "}
                            決済方法、決済締切、締切後決済許可、猶予期間が自動的にクリアされます。
                          </p>
                        )}
                        {stripeChanges.length > 0 && (
                          <p>
                            <strong>オンライン決済選択解除に伴う自動クリア:</strong>{" "}
                            決済締切、締切後決済許可、猶予期間が自動的にクリアされます。
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
            return null;
          })()}

          {/* 変更内容の表示 */}
          {changes.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-foreground">変更される項目</h3>
              <div className="space-y-2">
                {changes.map((change, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg border ${
                      change.newValue.includes("（無料化により自動クリア）") ||
                      change.newValue.includes("（オンライン決済選択解除により自動クリア）")
                        ? "bg-info/5 border-info/20"
                        : "bg-muted/30"
                    }`}
                    data-testid={`change-item-${change.field}`}
                  >
                    <div className="font-medium text-sm text-foreground">{change.fieldName}</div>
                    <div className="mt-1 text-sm">
                      <span className="text-destructive">変更前: </span>
                      <span className="font-mono">{change.oldValue}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-success">変更後: </span>
                      <span className="font-mono">{change.newValue}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 影響範囲の表示 */}
          {hasAttendees && (
            <div className="bg-warning/10 border border-warning/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-warning text-lg">⚠️</span>
                <div>
                  <h4 className="font-medium text-warning">参加者への影響について</h4>
                  <p className="text-sm text-warning/80 mt-1">
                    変更内容により参加者に影響が生じる場合があります。必要に応じて主催者から連絡をお取りください。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 制限項目の警告と定員変更の通知 */}
          {(() => {
            // 定員変更の解析関数
            const analyzeCapacityChange = (capacityChange: ChangeItem | undefined) => {
              if (!capacityChange) return { isDecrease: false, isIncrease: false };

              const oldCapacity =
                capacityChange.oldValue === "" || capacityChange.oldValue == null
                  ? null
                  : Number(capacityChange.oldValue);
              const newCapacity =
                capacityChange.newValue === "" || capacityChange.newValue == null
                  ? null
                  : Number(capacityChange.newValue);

              // 既存定員がnullの場合（制限なし）→新定員が設定された場合は通知なし
              if (oldCapacity === null && newCapacity !== null)
                return { isDecrease: false, isIncrease: false };
              // 新定員がnullの場合（制限なしに変更）→増加扱い
              if (newCapacity === null && oldCapacity !== null)
                return { isDecrease: false, isIncrease: true };
              // 両方とも数値の場合、増減を判定
              if (oldCapacity !== null && newCapacity !== null) {
                return {
                  isDecrease: newCapacity < oldCapacity,
                  isIncrease: newCapacity > oldCapacity,
                };
              }
              return { isDecrease: false, isIncrease: false };
            };

            // 金銭系の制限チェック
            const hasMoneyRestriction =
              hasAttendees &&
              hasStripePaid &&
              changes.some((change) => ["fee", "payment_methods"].includes(change.field));

            // 定員変更の解析
            const capacityChange = changes.find((change) => change.field === "capacity");
            const { isDecrease: hasCapacityDecrease, isIncrease: hasCapacityIncrease } =
              analyzeCapacityChange(capacityChange);
            const hasCapacityRestriction = hasAttendees && hasCapacityDecrease;

            return (
              <Fragment>
                {/* 制限項目の警告 */}
                {(hasMoneyRestriction || hasCapacityRestriction) && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-destructive text-lg">🚫</span>
                      <div>
                        <h4 className="font-medium text-destructive">制限項目の変更</h4>
                        <p className="text-sm text-destructive/80 mt-1">
                          {hasMoneyRestriction
                            ? "決済済み参加者がいるため、参加費・決済方法の変更はできません。"
                            : "参加者がいるため、定員の減少はできません。"}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 定員増加の通知 */}
                {hasAttendees && hasCapacityIncrease && (
                  <div className="bg-success/10 border border-success/20 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <span className="text-success text-lg">✅</span>
                      <div>
                        <h4 className="font-medium text-success">定員の変更</h4>
                        <p className="text-sm text-success/80 mt-1">
                          定員が増加または制限なしに変更されます。参加希望者により多くの機会を提供できます。
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })()}

          {/* 参加者への変更通知について */}
          {hasAttendees && (
            <div className="bg-info/10 border border-info/20 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-info text-lg">ℹ️</span>
                <div>
                  <h4 className="font-medium text-info">参加者への影響</h4>
                  <p className="text-sm text-info/80 mt-1">
                    変更内容により参加者に影響が生じる場合があります。必要に応じて主催者から個別に連絡をお取りください。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 flex-shrink-0 pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            キャンセル
          </Button>
          <Button
            type="button"
            onClick={() => onConfirm(changes)}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                更新中...
              </>
            ) : (
              "変更を確定"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
