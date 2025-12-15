"use client";

import { AlertCircle, Ban, Info, CheckCircle2 } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export interface ValidationAnalysis {
  blockingErrors: string[];
  advisoryWarnings: string[];
  secondaryChanges: ChangeItem[];
  normalChanges: ChangeItem[];
  hasBlockingErrors: boolean;
}

interface ChangeConfirmationDialogProps {
  isOpen: boolean;
  analysis: ValidationAnalysis;
  attendeeCount?: number;
  onConfirm: () => void; // Fixed: no args needed, parent knows
  onCancel: () => void;
  onClose?: () => void;
  isLoading?: boolean;
}

export function ChangeConfirmationDialog({
  isOpen,
  analysis,
  attendeeCount = 0,
  onConfirm,
  onCancel,
  onClose,
  isLoading = false,
}: ChangeConfirmationDialogProps) {
  const hasAttendees = attendeeCount > 0;

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      if (onClose) {
        onClose();
      } else {
        onCancel();
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
            以下の変更内容をご確認ください。
            {analysis.hasBlockingErrors
              ? " 制限により変更できない項目が含まれています。"
              : " 変更を適用する場合は「変更を確定」をクリックしてください。"}
          </DialogDescription>
        </DialogHeader>

        <div
          id="change-confirmation-description"
          className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2"
        >
          {/* 1. ブロックエラー（最優先） */}
          {analysis.hasBlockingErrors && (
            <Alert
              variant="destructive"
              className="bg-destructive/5 text-destructive border-destructive/20"
            >
              <Ban className="h-4 w-4" />
              <AlertTitle>変更できない項目があります</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-sm">
                  {analysis.blockingErrors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* 2. 注意喚起（アドバイザリー） */}
          {analysis.advisoryWarnings.length > 0 && (
            <Alert className="bg-amber-500/10 text-amber-700 border-amber-500/20">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">確認事項</AlertTitle>
              <AlertDescription className="text-amber-700">
                <ul className="list-disc pl-5 mt-1 space-y-1 text-sm">
                  {analysis.advisoryWarnings.map((warning, idx) => (
                    <li key={idx}>{warning}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* 3. 副次的変更の通知（Info） */}
          {analysis.secondaryChanges.length > 0 && (
            <Alert className="bg-blue-500/10 text-blue-700 border-blue-500/20">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle className="text-blue-800">自動的な変更について</AlertTitle>
              <AlertDescription className="text-blue-700">
                <p className="text-sm mt-1">以下の設定が自動的に変更・解除されます。</p>
                <ul className="list-disc pl-5 mt-1 space-y-1 text-sm">
                  {analysis.secondaryChanges.map((change, idx) => (
                    <li key={idx}>
                      <strong>{change.fieldName}</strong>: {change.newValue.replace(/[（）]/g, "")}
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* 4. 具体的な変更内容リスト */}
          {analysis.normalChanges.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-foreground flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                変更される項目
              </h3>
              <div className="space-y-2">
                {analysis.normalChanges.map((change, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-lg border bg-muted/30"
                    data-testid={`change-item-${change.field}`}
                  >
                    <div className="font-medium text-sm text-foreground">{change.fieldName}</div>
                    <div className="mt-1 text-sm grid grid-cols-[auto_1fr] gap-x-2 gap-y-1">
                      <span className="text-muted-foreground text-xs uppercase tracking-wider self-center">
                        Before
                      </span>
                      <span className="font-mono text-muted-foreground line-through decoration-destructive/30 decoration-2">
                        {change.oldValue || "(未設定)"}
                      </span>

                      <span className="text-primary text-xs uppercase tracking-wider self-center font-bold">
                        After
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        {change.newValue || "(未設定)"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. 参加者への影響通知（参加者がいる場合のみ常時表示） */}
          {hasAttendees && !analysis.hasBlockingErrors && (
            // analysis.advisoryWarnings.length === 0 &&
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground flex gap-3">
              <Info className="w-5 h-5 flex-shrink-0 text-muted-foreground/70" />
              <p>
                現在 {attendeeCount} 名の参加者がいます。変更内容は即座に反映されます。
                重要な変更を行う場合は、参加者への連絡を推奨します。
              </p>
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
            onClick={onConfirm}
            disabled={isLoading || analysis.hasBlockingErrors}
            className="w-full sm:w-auto"
            variant={analysis.hasBlockingErrors ? "destructive" : "default"}
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                更新中...
              </>
            ) : analysis.hasBlockingErrors ? (
              "変更できません"
            ) : (
              "変更を確定"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
