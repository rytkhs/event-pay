'use client'

import { Fragment } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'

export interface ChangeItem {
  field: string
  fieldName: string
  oldValue: string
  newValue: string
  impact?: string
}

interface ChangeConfirmationDialogProps {
  isOpen: boolean
  changes: ChangeItem[]
  attendeeCount?: number
  onConfirm: (changes: ChangeItem[]) => void
  onCancel: () => void
  onClose?: () => void
  isLoading?: boolean
}

export function ChangeConfirmationDialog({
  isOpen,
  changes,
  attendeeCount = 0,
  onConfirm,
  onCancel,
  onClose,
  isLoading = false,
}: ChangeConfirmationDialogProps) {
  const hasAttendees = attendeeCount > 0

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // ESCキーやオーバーレイクリックでの閉じる処理
      if (onClose) {
        onClose()
      } else {
        onCancel() // onCloseが未定義の場合はフォールバック
      }
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[600px]"
        aria-describedby="change-confirmation-description"
      >
        <DialogHeader>
          <DialogTitle>変更内容を確認</DialogTitle>
          <DialogDescription>
            以下の変更内容をご確認ください。変更を適用する場合は「更新」をクリックしてください。
          </DialogDescription>
        </DialogHeader>

        <div id="change-confirmation-description" className="space-y-4">
          {/* 変更内容の表示 */}
          {changes.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-medium text-gray-900">変更される項目</h3>
              <div className="space-y-2">
                {changes.map((change, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 p-3 rounded-lg border"
                    data-testid={`change-item-${change.field}`}
                  >
                    <div className="font-medium text-sm text-gray-700">{change.fieldName}</div>
                    <div className="mt-1 text-sm">
                      <span className="text-red-600">変更前: </span>
                      <span className="font-mono">{change.oldValue}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-green-600">変更後: </span>
                      <span className="font-mono">{change.newValue}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 影響範囲の表示 */}
          {hasAttendees && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-yellow-600 text-lg">⚠️</span>
                <div>
                  <h4 className="font-medium text-yellow-800">参加者への影響について</h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    {attendeeCount}人の参加者に変更が通知されます。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 制限項目の警告 */}
          {hasAttendees &&
            changes.some((change) =>
              ['title', 'fee', 'payment_methods', 'capacity'].includes(change.field)
            ) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <span className="text-red-600 text-lg">🚫</span>
                  <div>
                    <h4 className="font-medium text-red-800">制限項目の変更</h4>
                    <p className="text-sm text-red-700 mt-1">
                      参加者がいる場合、通常は変更できない項目が含まれています。
                    </p>
                  </div>
                </div>
              </div>
            )}

          {/* 通知メールの送信について */}
          {hasAttendees && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-blue-600 text-lg">📧</span>
                <div>
                  <h4 className="font-medium text-blue-800">通知メールの送信</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    変更内容について参加者に自動で通知メールが送信されます。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
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
              '変更を確定'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
