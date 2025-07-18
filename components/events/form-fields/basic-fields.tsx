import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EventFormData, ValidationErrors } from "@/lib/validation/client-validation";
import { getMinDatetimeLocal } from "@/lib/utils/timezone";

interface BasicFieldsProps {
  formData: EventFormData;
  errors: ValidationErrors;
  onInputChange: (name: string, value: string) => void;
}

export default function BasicFields({ formData, errors, onInputChange }: BasicFieldsProps) {
  const titleLength = formData.title.length;
  const descriptionLength = formData.description.length;
  const locationLength = formData.location.length;

  // 参加費の計算（表示用）
  const feeValue = formData.fee ? parseInt(formData.fee) : 0;
  const serviceFee = Math.round(feeValue * 0.036);
  const netAmount = feeValue - serviceFee;

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="title" className="text-sm font-medium">
          タイトル <span className="text-red-500">*</span>
        </Label>
        <Input
          id="title"
          name="title"
          value={formData.title}
          onChange={(e) => onInputChange("title", e.target.value)}
          placeholder="例：年末パーティー2024"
          className={errors.title ? "border-red-500" : ""}
          maxLength={100}
          required
        />
        <div className="flex justify-between items-center">
          <p className="text-xs text-gray-500">参加者にとって魅力的なタイトルを付けましょう</p>
          <span className={`text-xs ${titleLength > 90 ? "text-orange-500" : "text-gray-400"}`}>
            {titleLength}/100
          </span>
        </div>
        {errors.title && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <span>⚠️</span>
            {errors.title}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="date" className="text-sm font-medium">
          開催日時 <span className="text-red-500">*</span>
        </Label>
        <Input
          id="date"
          name="date"
          type="datetime-local"
          value={formData.date}
          onChange={(e) => onInputChange("date", e.target.value)}
          className={errors.date ? "border-red-500" : ""}
          min={getMinDatetimeLocal()}
          required
        />
        <p className="text-xs text-gray-500">イベントの開催日時を選択してください</p>
        {errors.date && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <span>⚠️</span>
            {errors.date}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="location" className="text-sm font-medium">
          場所
          <span className="text-xs text-gray-500 ml-1">(任意)</span>
        </Label>
        <Input
          id="location"
          name="location"
          value={formData.location}
          onChange={(e) => onInputChange("location", e.target.value)}
          placeholder="例：東京都渋谷区〇〇ビル 3F、オンライン（Zoom）"
          className={errors.location ? "border-red-500" : ""}
          maxLength={200}
        />
        <div className="flex justify-between items-center">
          <p className="text-xs text-gray-500">参加者がアクセスしやすい場所の詳細を記載</p>
          <span className={`text-xs ${locationLength > 180 ? "text-orange-500" : "text-gray-400"}`}>
            {locationLength}/200
          </span>
        </div>
        {errors.location && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <span>⚠️</span>
            {errors.location}
          </p>
        )}
      </div>

      {/* 参加費と定員を同じ行に表示 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fee" className="text-sm font-medium">
            参加費 <span className="text-red-500">*</span>
          </Label>
          <div className="relative">
            <Input
              id="fee"
              name="fee"
              type="number"
              inputMode="numeric"
              value={formData.fee}
              onChange={(e) => onInputChange("fee", e.target.value)}
              placeholder="1000"
              className={`${errors.fee ? "border-red-500" : ""} pr-12`}
              min="0"
              max="1000000"
              step="1"
              required
            />
            <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">
              円
            </span>
          </div>
          <p className="text-xs text-gray-500">参加者が支払う金額</p>
          {errors.fee && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <span>⚠️</span>
              {errors.fee}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="capacity" className="text-sm font-medium">
            定員
            <span className="text-xs text-gray-500 ml-1">(任意)</span>
          </Label>
          <Input
            id="capacity"
            name="capacity"
            type="number"
            inputMode="numeric"
            value={formData.capacity}
            onChange={(e) => onInputChange("capacity", e.target.value)}
            placeholder="例：50"
            className={errors.capacity ? "border-red-500" : ""}
            min="1"
            max="10000"
          />
          <p className="text-xs text-gray-500">参加可能な最大人数を設定（未設定の場合は無制限）</p>
          {errors.capacity && (
            <p className="text-sm text-red-500 flex items-center gap-1">
              <span>⚠️</span>
              {errors.capacity}
            </p>
          )}
        </div>
      </div>

      {/* 参加費が入力されている場合の料金詳細 */}
      {formData.fee && parseInt(formData.fee) > 0 && (
        <div className="bg-gray-50 border rounded-lg p-3 space-y-2">
          <h4 className="text-sm font-medium text-gray-700">💰 料金詳細</h4>
          <div className="text-xs text-gray-600 space-y-1">
            <div className="flex justify-between">
              <span>参加費：</span>
              <span>{feeValue.toLocaleString()}円</span>
            </div>
            <div className="flex justify-between">
              <span>サービス手数料（3.6%）：</span>
              <span>-{serviceFee.toLocaleString()}円</span>
            </div>
            <div className="border-t pt-1 flex justify-between font-medium">
              <span>あなたの受取額：</span>
              <span>{netAmount.toLocaleString()}円</span>
            </div>
          </div>
          <p className="text-xs text-gray-500">💡 決済方法によらず、参加者は同じ金額を支払います</p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="description" className="text-sm font-medium">
          説明
          <span className="text-xs text-gray-500 ml-1">(任意)</span>
        </Label>
        <Textarea
          id="description"
          name="description"
          value={formData.description}
          onChange={(e) => onInputChange("description", e.target.value)}
          placeholder="イベントの詳細、持ち物、注意事項などを記載してください"
          className={`${errors.description ? "border-red-500" : ""} min-h-[100px] resize-y`}
          maxLength={1000}
        />
        <div className="flex justify-between items-center">
          <p className="text-xs text-gray-500">参加者が知っておくべき情報を詳しく記載しましょう</p>
          <span
            className={`text-xs ${descriptionLength > 900 ? "text-orange-500" : "text-gray-400"}`}
          >
            {descriptionLength}/1000
          </span>
        </div>
        {errors.description && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <span>⚠️</span>
            {errors.description}
          </p>
        )}
      </div>
    </>
  );
}
