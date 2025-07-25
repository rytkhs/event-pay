"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface FormData {
  fee: string;
  capacity: string;
  payment_methods: string[];
}

interface FormErrors {
  fee?: string;
  capacity?: string;
  payment_methods?: string;
}

interface EventEditPricingFieldsProps {
  formData: FormData;
  errors: FormErrors;
  onInputChange: (field: string, value: string | string[]) => void;
  isFieldRestricted: (field: string) => boolean;
}

export function EventEditPricingFields({
  formData,
  errors,
  onInputChange,
  isFieldRestricted,
}: EventEditPricingFieldsProps) {
  const handlePaymentMethodChange = (method: string, checked: boolean) => {
    const currentMethods = formData.payment_methods || [];
    const newMethods = checked
      ? [...currentMethods, method]
      : currentMethods.filter((m) => m !== method);

    onInputChange("payment_methods", newMethods);
  };

  // 無料イベント関連の表示を削除

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-medium text-gray-900">料金・定員設定</h3>
        <p className="text-sm text-gray-500">参加費と定員を設定してください</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fee">
            参加費 (円)
            {isFieldRestricted("fee") && (
              <span className="text-yellow-600 text-sm ml-2">(参加者がいるため編集不可)</span>
            )}
          </Label>
          <Input
            id="fee"
            type="number"
            min="0"
            step="1"
            value={formData.fee}
            onChange={(e) => onInputChange("fee", e.target.value)}
            disabled={isFieldRestricted("fee")}
            aria-disabled={isFieldRestricted("fee")}
            aria-describedby={
              isFieldRestricted("fee") ? "fee-restriction" : errors.fee ? "fee-error" : undefined
            }
            className={isFieldRestricted("fee") ? "bg-gray-100" : ""}
          />
          {isFieldRestricted("fee") && (
            <p id="fee-restriction" className="text-sm text-yellow-600">
              参加者がいるため編集できません
            </p>
          )}
          {errors.fee && (
            <p id="fee-error" className="text-sm text-red-600">
              {errors.fee}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="capacity">
            定員
            {isFieldRestricted("capacity") && (
              <span className="text-yellow-600 text-sm ml-2">(参加者がいるため減少不可)</span>
            )}
          </Label>
          <Input
            id="capacity"
            type="number"
            min="1"
            step="1"
            value={formData.capacity}
            onChange={(e) => onInputChange("capacity", e.target.value)}
            aria-describedby={
              isFieldRestricted("capacity")
                ? "capacity-restriction"
                : errors.capacity
                  ? "capacity-error"
                  : "capacity-help"
            }
            className={isFieldRestricted("capacity") ? "border-yellow-300 bg-yellow-50" : ""}
            placeholder="未設定（制限なし）"
          />
          <p id="capacity-help" className="text-sm text-gray-500">
            空欄の場合は制限なしとなります
          </p>
          {isFieldRestricted("capacity") && (
            <p id="capacity-restriction" className="text-sm text-yellow-600">
              現在の参加者数未満には設定できません。増加は可能です。
            </p>
          )}
          {errors.capacity && (
            <p id="capacity-error" className="text-sm text-red-600">
              {errors.capacity}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>
          決済方法
          {isFieldRestricted("payment_methods") && (
            <span className="text-yellow-600 text-sm ml-2">(参加者がいるため編集不可)</span>
          )}
        </Label>

        <div
          className="space-y-2"
          role="group"
          aria-labelledby="payment-methods-label"
          aria-describedby={
            isFieldRestricted("payment_methods")
              ? "payment-methods-restriction"
              : errors.payment_methods
                ? "payment-methods-error"
                : undefined
          }
        >
          <div className="flex items-center space-x-2">
            <Checkbox
              id="payment_stripe"
              checked={formData.payment_methods.includes("stripe")}
              onCheckedChange={(checked) => handlePaymentMethodChange("stripe", checked as boolean)}
              disabled={isFieldRestricted("payment_methods")}
              aria-disabled={isFieldRestricted("payment_methods")}
            />
            <Label htmlFor="payment_stripe" className="text-sm">
              クレジットカード決済 (Stripe)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="payment_cash"
              checked={formData.payment_methods.includes("cash")}
              onCheckedChange={(checked) => handlePaymentMethodChange("cash", checked as boolean)}
              disabled={isFieldRestricted("payment_methods")}
              aria-disabled={isFieldRestricted("payment_methods")}
            />
            <Label htmlFor="payment_cash" className="text-sm">
              現金決済
            </Label>
          </div>
        </div>
        {isFieldRestricted("payment_methods") && (
          <p id="payment-methods-restriction" className="text-sm text-yellow-600">
            参加者がいるため編集できません
          </p>
        )}
        {errors.payment_methods && (
          <p id="payment-methods-error" className="text-sm text-red-600">
            {errors.payment_methods}
          </p>
        )}
      </div>
    </div>
  );
}
