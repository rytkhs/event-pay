import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type EventFormData,
  ValidationErrors,
  validateField,
  validateAllFields,
} from "@/lib/validation/client-validation";
import { createEventAction } from "@/app/events/actions";

export const useEventForm = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [formData, setFormData] = useState<EventFormData>({
    title: "",
    description: "",
    location: "",
    date: "",
    capacity: "",
    registrationDeadline: "",
    paymentDeadline: "",
    paymentMethods: "",
    fee: "",
  });

  const handleInputChange = (name: string, value: string) => {
    const newFormData = { ...formData, [name]: value };
    setFormData(newFormData);

    // 最適化されたリアルタイムバリデーション
    const fieldErrors = validateField(name, value, newFormData);

    // エラー状態を効率的に更新
    setErrors((prev) => {
      const newErrors = { ...prev };
      
      // 該当フィールドのエラーをクリア
      delete newErrors[name as keyof ValidationErrors];
      
      // 新しいエラーがあれば設定
      Object.entries(fieldErrors).forEach(([key, errorMessage]) => {
        if (errorMessage) {
          newErrors[key as keyof ValidationErrors] = errorMessage;
        }
      });
      
      return newErrors;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // 全フィールドのバリデーション実行
    const validationErrors = validateAllFields(formData);

    // エラーを設定（空オブジェクトでも設定して状態を更新）
    setErrors(validationErrors);

    // バリデーションエラーがある場合は送信を中止
    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    // バリデーション通過時のみServer Action実行
    startTransition(() => {
      (async () => {
        try {
          const formDataObj = new FormData();

          // 新しいスキーマに合わせたフィールドマッピング
          const fieldMapping = {
            title: formData.title,
            date: formData.date,
            fee: formData.fee,
            payment_methods: formData.paymentMethods,
            location: formData.location,
            description: formData.description,
            capacity: formData.capacity,
            registration_deadline: formData.registrationDeadline,
            payment_deadline: formData.paymentDeadline,
          };

          Object.entries(fieldMapping).forEach(([key, value]) => {
            if (value) {
              formDataObj.append(key, value.toString());
            }
          });

          const result = await createEventAction(formDataObj);

          if (result.success) {
            router.push(`/events/${result.data.id}`);
          } else {
            setErrors({ general: result.error });
          }
        } catch (error) {
          console.error("Event creation error:", error);
          setErrors({ general: "エラーが発生しました。もう一度お試しください。" });
        }
      })();
    });
  };

  return {
    formData,
    errors,
    isPending,
    handleInputChange,
    handleSubmit,
  };
};
