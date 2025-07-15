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

  const handlePaymentMethodChange = (method: string, checked: boolean) => {
    let updatedMethods = [...selectedMethods];

    if (checked) {
      // 無料が選択された場合、他の決済方法をすべて除外
      if (method === "free") {
        updatedMethods = ["free"];
      } else {
        // 有料決済方法が選択された場合、無料を除外
        updatedMethods = updatedMethods.filter((m) => m !== "free");
        if (!updatedMethods.includes(method)) {
          updatedMethods.push(method);
        }
      }
    } else {
      // チェックが外された場合、配列から削除
      updatedMethods = updatedMethods.filter((m) => m !== method);
    }

    // カンマ区切りの文字列として保存
    onInputChange("paymentMethods", updatedMethods.join(","));
  };

  // 無料が選択されている場合は有料決済方法をdisabled
  const isFreeSelected = selectedMethods.includes("free");
  // 有料決済方法が選択されている場合は無料をdisabled
  const isPaidSelected = selectedMethods.some((method) => method === "stripe" || method === "cash");

  // 決済方法説明カードをメモ化してパフォーマンス最適化
  const paymentInfoCard = useMemo(() => {
    if (selectedMethods.length === 0) return null;

    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <h4 className="text-sm font-medium text-blue-800 mb-2">💡 決済方法について</h4>
        <div className="text-xs text-blue-700 space-y-1">
          {selectedMethods.includes("free") && <p>🎉 無料イベントとして設定されました</p>}
          {(selectedMethods.includes("stripe") || selectedMethods.includes("cash")) && (
            <p>参加者は選択された決済方法の中から好みの方法を選択できます</p>
          )}
          {!selectedMethods.includes("free") && selectedMethods.length === 0 && (
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
            決済方法 <span className="text-red-500">*</span>
          </Label>
          <p className="text-xs text-gray-500 mt-1">
            参加者が利用できる決済方法を選択してください（複数選択可）
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="sr-only">決済方法選択</legend>
          <div
            className={`flex items-start space-x-3 p-3 border rounded-lg ${isFreeSelected ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}
          >
            <Checkbox
              id="stripe"
              checked={selectedMethods.includes("stripe")}
              disabled={isFreeSelected}
              onCheckedChange={(checked) => handlePaymentMethodChange("stripe", !!checked)}
            />
            <div className="flex-1">
              <Label
                htmlFor="stripe"
                className={`font-medium ${isFreeSelected ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                💳 Stripe決済
              </Label>
              <p className="text-xs text-gray-500 mt-1">
                クレジットカード・デビットカード対応。参加者にとって最も便利な決済方法です。
              </p>
            </div>
          </div>

          <div
            className={`flex items-start space-x-3 p-3 border rounded-lg ${isFreeSelected ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}
          >
            <Checkbox
              id="cash"
              checked={selectedMethods.includes("cash")}
              disabled={isFreeSelected}
              onCheckedChange={(checked) => handlePaymentMethodChange("cash", !!checked)}
            />
            <div className="flex-1">
              <Label
                htmlFor="cash"
                className={`font-medium ${isFreeSelected ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                💰 現金決済
              </Label>
              <p className="text-xs text-gray-500 mt-1">
                イベント当日に現金で支払い。事前決済なしで参加申込みが可能です。
              </p>
            </div>
          </div>

          <div
            className={`flex items-start space-x-3 p-3 border rounded-lg ${isPaidSelected ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-50"}`}
          >
            <Checkbox
              id="free"
              checked={selectedMethods.includes("free")}
              disabled={isPaidSelected}
              onCheckedChange={(checked) => handlePaymentMethodChange("free", !!checked)}
            />
            <div className="flex-1">
              <Label
                htmlFor="free"
                className={`font-medium ${isPaidSelected ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                🆓 無料
              </Label>
              <p className="text-xs text-gray-500 mt-1">
                参加費無料のイベント。決済処理なしで参加申込みが可能です。
              </p>
            </div>
          </div>
        </fieldset>

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
