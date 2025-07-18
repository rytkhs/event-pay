import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { EventFormData, ValidationErrors } from "@/lib/validation/client-validation";

interface PaymentFieldsProps {
  formData: EventFormData;
  errors: ValidationErrors;
  onInputChange: (name: string, value: string) => void;
}

export default function PaymentFields({ formData, errors, onInputChange }: PaymentFieldsProps) {
  // 現在選択されている決済方法を配列として管理（useMemoで最適化）
  const selectedMethods = useMemo(
    () => (formData.paymentMethods ? formData.paymentMethods.split(",") : []),
    [formData.paymentMethods]
  );

  // 参加費0円の場合は無料イベント
  const isFreeEvent = formData.fee === "0" || formData.fee === "";

  const handlePaymentMethodChange = (method: string, checked: boolean) => {
    let updatedMethods = [...selectedMethods];

    if (checked) {
      // 選択された決済方法を追加
      if (!updatedMethods.includes(method)) {
        updatedMethods.push(method);
      }
    } else {
      // チェックが外された場合、配列から削除
      updatedMethods = updatedMethods.filter((m) => m !== method);
    }

    // カンマ区切りの文字列として保存
    onInputChange("paymentMethods", updatedMethods.join(","));
  };

  // 無料選択肢を削除したため、これらの状態管理は不要

  // 決済方法説明カードをメモ化してパフォーマンス最適化
  const paymentInfoCard = useMemo(() => {
    if (selectedMethods.length === 0) return null;

    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <h4 className="text-sm font-medium text-blue-800 mb-2">💡 決済方法について</h4>
        <div className="text-xs text-blue-700 space-y-1">
          {(selectedMethods.includes("stripe") || selectedMethods.includes("cash")) && (
            <p>参加者は選択された決済方法の中から好みの方法を選択できます</p>
          )}
          {selectedMethods.length === 0 && (
            <p>決済方法を選択してください</p>
          )}
        </div>
      </div>
    );
  }, [selectedMethods]);

  return (
    <>
      <div className="space-y-4">
        <div>
          <Label className="text-sm font-medium">
            決済方法 {!isFreeEvent && <span className="text-red-500">*</span>}
          </Label>
          <p className="text-xs text-gray-500 mt-1">
            {isFreeEvent 
              ? "参加費0円のため決済方法の選択は不要です（無料イベント）" 
              : "参加者が利用できる決済方法を選択してください（複数選択可）"
            }
          </p>
        </div>

        {isFreeEvent ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-2">
              <span className="text-green-600">🎉</span>
              <span className="text-sm font-medium text-green-800">無料イベント</span>
            </div>
            <p className="text-xs text-green-700 mt-1">
              参加費0円のため、決済処理は行われません。参加者は無料で参加できます。
            </p>
          </div>
        ) : (
          <fieldset className="space-y-3">
            <legend className="sr-only">決済方法選択</legend>
            <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
              <Checkbox
                id="stripe"
                checked={selectedMethods.includes("stripe")}
                onCheckedChange={(checked) => handlePaymentMethodChange("stripe", !!checked)}
              />
              <div className="flex-1">
                <Label htmlFor="stripe" className="font-medium cursor-pointer">
                  💳 Stripe決済
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  クレジットカード・デビットカード対応。参加者にとって最も便利な決済方法です。
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 p-3 border rounded-lg hover:bg-gray-50">
              <Checkbox
                id="cash"
                checked={selectedMethods.includes("cash")}
                onCheckedChange={(checked) => handlePaymentMethodChange("cash", !!checked)}
              />
              <div className="flex-1">
                <Label htmlFor="cash" className="font-medium cursor-pointer">
                  💰 現金決済
                </Label>
                <p className="text-xs text-gray-500 mt-1">
                  イベント当日に現金で支払い。事前決済なしで参加申込みが可能です。
                </p>
              </div>
            </div>
          </fieldset>
        )}

        {errors.paymentMethods && (
          <p className="text-sm text-red-500 flex items-center gap-1">
            <span>⚠️</span>
            {errors.paymentMethods}
          </p>
        )}

        {/* 決済方法の組み合わせに関する注意事項 */}
        {paymentInfoCard}
      </div>
    </>
  );
}
