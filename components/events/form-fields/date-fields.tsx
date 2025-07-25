import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EventFormData, ValidationErrors } from "@/lib/validation/client-validation";
import { getMinDatetimeLocal } from "@/lib/utils/timezone";

interface DateFieldsProps {
  formData: EventFormData;
  errors: ValidationErrors;
  onInputChange: (name: string, value: string) => void;
}

export default function DateFields({ formData, errors, onInputChange }: DateFieldsProps) {
  // 現在のJST時刻から1時間後を最小値として設定
  const minDateTime = getMinDatetimeLocal();

  return (
    <>
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">締切設定</h3>
          <p className="text-sm text-gray-500">参加申込と決済の締切を設定してください（任意）</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="registrationDeadline" className="text-sm font-medium">
              参加申込締切
              <span className="text-xs text-gray-500 ml-1">(任意)</span>
            </Label>
            <Input
              id="registrationDeadline"
              name="registrationDeadline"
              type="datetime-local"
              value={formData.registrationDeadline}
              onChange={(e) => onInputChange("registrationDeadline", e.target.value)}
              className={errors.registrationDeadline ? "border-red-500" : ""}
              min={minDateTime}
              max={formData.date || undefined}
            />
            <p className="text-xs text-gray-500">参加申込の締切日時（開催日時より前）</p>
            {errors.registrationDeadline && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <span>⚠️</span>
                {errors.registrationDeadline}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="paymentDeadline" className="text-sm font-medium">
              決済締切
              <span className="text-xs text-gray-500 ml-1">(任意)</span>
            </Label>
            <Input
              id="paymentDeadline"
              name="paymentDeadline"
              type="datetime-local"
              value={formData.paymentDeadline}
              onChange={(e) => onInputChange("paymentDeadline", e.target.value)}
              className={errors.paymentDeadline ? "border-red-500" : ""}
              min={formData.registrationDeadline || minDateTime}
              max={formData.date || undefined}
            />
            <p className="text-xs text-gray-500">
              決済の締切日時（参加申込締切以降、開催日時より前）
            </p>
            {errors.paymentDeadline && (
              <p className="text-sm text-red-500 flex items-center gap-1">
                <span>⚠️</span>
                {errors.paymentDeadline}
              </p>
            )}
          </div>
        </div>

        {/* 日付フィールドの関係性を視覚的に示すヘルプ */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <h4 className="text-sm font-medium text-blue-800 mb-2">📅 締切設定のガイド</h4>
          <div className="text-xs text-blue-700 space-y-1">
            <p>
              • <strong>参加申込締切</strong>：参加者が申込みできる最終日時
            </p>
            <p>
              • <strong>決済締切</strong>：参加者が決済を完了する最終日時
            </p>
          </div>
          <div className="mt-2 text-xs text-blue-600">
            <p>
              💡 <strong>推奨設定</strong>：参加申込締切 ≤ 決済締切 ≤ 開催日時の順で設定
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
