"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEventForm } from "@/hooks/use-event-form";
import BasicFields from "./form-fields/basic-fields";
import DateFields from "./form-fields/date-fields";
import PaymentFields from "./form-fields/payment-fields";

export default function EventCreateForm() {
  const { formData, errors, isPending, handleInputChange, handleSubmit } = useEventForm();

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>イベント作成</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* 基本情報セクション */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">基本情報</h3>
              <p className="text-sm text-gray-500">イベントの基本的な情報を入力してください</p>
            </div>
            <BasicFields formData={formData} errors={errors} onInputChange={handleInputChange} />
          </div>

          {/* 締切設定セクション */}
          <DateFields formData={formData} errors={errors} onInputChange={handleInputChange} />

          {/* 決済方法セクション */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-medium text-gray-900">決済方法</h3>
              <p className="text-sm text-gray-500">参加者が利用できる決済方法を選択してください</p>
            </div>
            <PaymentFields formData={formData} errors={errors} onInputChange={handleInputChange} />
          </div>

          {/* 全体のエラーメッセージ */}
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600 flex items-center gap-2">
                <span>⚠️</span>
                {errors.general}
              </p>
            </div>
          )}

          {/* 送信ボタン */}
          <Button type="submit" disabled={isPending} className="w-full" size="lg">
            {isPending ? (
              <>
                <div 
                  className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" 
                  role="status" 
                  aria-label="作成中"
                ></div>
                作成中...
              </>
            ) : (
              "イベントを作成"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
