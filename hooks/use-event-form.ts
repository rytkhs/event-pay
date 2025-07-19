"use client";

import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useTransition, useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createEventAction } from "@/app/events/actions";

// フロントエンド専用バリデーションスキーマ
const eventFormSchema = z
  .object({
    title: z
      .string()
      .min(1, "タイトルは必須です")
      .max(100, "タイトルは100文字以内で入力してください"),
    date: z
      .string()
      .min(1, "開催日時は必須です")
      .refine((val) => {
        if (!val) return false;
        const selectedDate = new Date(val);
        const now = new Date();
        return selectedDate > now;
      }, "開催日時は現在時刻より後である必要があります"),
    fee: z
      .string()
      .min(1, "参加費は必須です")
      .refine((val) => {
        const num = Number(val);
        return Number.isFinite(num) && num >= 0 && num <= 1000000;
      }, "参加費は0以上1000000以下である必要があります"),
    payment_methods: z.array(z.string()),
    location: z.string().max(200, "場所は200文字以内で入力してください"),
    description: z.string().max(1000, "説明は1000文字以内で入力してください"),
    capacity: z.string().refine((val) => {
      if (!val || val.trim() === "") return true;
      const num = Number(val);
      return Number.isFinite(num) && num >= 1 && num <= 10000;
    }, "定員は1以上10000以下である必要があります"),
    registration_deadline: z.string(),
    payment_deadline: z.string(),
  })
  .refine(
    (data) => {
      // 参加費に基づく決済方法バリデーション
      const fee = Number(data.fee);
      if (fee > 0) {
        return data.payment_methods && data.payment_methods.length > 0;
      }
      return true;
    },
    {
      message: "有料イベントでは決済方法の選択が必要です",
      path: ["payment_methods"],
    }
  )
  .refine(
    (data) => {
      // 参加申込締切が開催日時より前であることを確認（空文字列は無視）
      if (data.registration_deadline && data.registration_deadline.trim() !== "" && data.date) {
        try {
          const regDate = new Date(data.registration_deadline);
          const eventDate = new Date(data.date);
          return regDate < eventDate;
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "参加申込締切は開催日時より前に設定してください",
      path: ["registration_deadline"],
    }
  )
  .refine(
    (data) => {
      // 決済締切が開催日時より前であることを確認（空文字列は無視）
      if (data.payment_deadline && data.payment_deadline.trim() !== "" && data.date) {
        try {
          const payDate = new Date(data.payment_deadline);
          const eventDate = new Date(data.date);
          return payDate < eventDate;
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "決済締切は開催日時より前に設定してください",
      path: ["payment_deadline"],
    }
  )
  .refine(
    (data) => {
      // 決済締切が参加申込締切以降であることを確認（空文字列は無視）
      if (
        data.registration_deadline &&
        data.registration_deadline.trim() !== "" &&
        data.payment_deadline &&
        data.payment_deadline.trim() !== ""
      ) {
        try {
          const payDate = new Date(data.payment_deadline);
          const regDate = new Date(data.registration_deadline);
          return payDate >= regDate;
        } catch {
          return false;
        }
      }
      return true;
    },
    {
      message: "決済締切は参加申込締切以降に設定してください",
      path: ["payment_deadline"],
    }
  );

type EventFormData = z.infer<typeof eventFormSchema>;

// react-hook-form用のデフォルト値
const defaultValues: EventFormData = {
  title: "",
  description: "",
  location: "",
  date: "",
  capacity: "",
  registration_deadline: "",
  payment_deadline: "",
  payment_methods: [],
  fee: "",
};

/**
 * react-hook-formを使用したイベント作成フォーム用フック
 * セキュリティファースト設計を維持しながら、パフォーマンスと開発効率を向上
 */
export const useEventForm = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // react-hook-formの初期化
  const form = useForm<EventFormData>({
    resolver: zodResolver(eventFormSchema),
    defaultValues,
    mode: "all", // 全フィールドのリアルタイムバリデーション（相関バリデーション対応）
    reValidateMode: "onChange",
  });

  // 参加費をリアルタイムで監視
  const watchedFee = form.watch("fee");
  // 空文字列や未入力の場合は無料イベントとして扱わない
  const currentFee = watchedFee && watchedFee.trim() !== "" ? parseInt(watchedFee, 10) : null;
  const isFreeEvent = currentFee === 0;

  // 無料イベントの場合は決済方法をクリア
  useEffect(() => {
    if (isFreeEvent) {
      form.setValue("payment_methods", []);
    }
  }, [isFreeEvent, form]);

  // フォーム送信処理
  const onSubmit = async (data: EventFormData) => {
    startTransition(async () => {
      try {
        // フォームデータをFormDataオブジェクトに変換
        const formData = new FormData();

        // 基本フィールドの設定
        formData.append("title", data.title);
        formData.append("date", data.date);
        formData.append("fee", data.fee);

        // 決済方法の設定（配列から文字列に変換）
        const paymentMethodsString = Array.isArray(data.payment_methods)
          ? data.payment_methods.join(",")
          : "";
        formData.append("payment_methods", paymentMethodsString);

        // オプショナルフィールドの設定
        if (data.location) {
          formData.append("location", data.location);
        }
        if (data.description) {
          formData.append("description", data.description);
        }
        if (data.capacity) {
          formData.append("capacity", data.capacity);
        }
        if (data.registration_deadline) {
          formData.append("registration_deadline", data.registration_deadline);
        }
        if (data.payment_deadline) {
          formData.append("payment_deadline", data.payment_deadline);
        }

        // Server Actionの実行
        const result = await createEventAction(formData);

        if (result.success) {
          // 成功時はイベント詳細ページにリダイレクト
          router.push(`/events/${result.data.id}`);
        } else {
          // エラー時はフォームにエラーを設定
          form.setError("root", {
            type: "server",
            message: result.error || "エラーが発生しました。もう一度お試しください。",
          });
        }
      } catch (error) {
        console.error("Event creation error:", error);
        form.setError("root", {
          type: "server",
          message: "予期しないエラーが発生しました。もう一度お試しください。",
        });
      }
    });
  };

  // フォーム状態の取得
  const { formState } = form;
  // カスタムルールではなく、実際のエラーの存在で判定
  const hasErrors = Object.keys(formState.errors).length > 0;

  // デバッグ用：フォーム状態をログ出力
  if (process.env.NODE_ENV === "development") {
    console.log("🔍 Form Debug:", {
      errors: formState.errors,
      hasErrors,
      isValid: formState.isValid,
      isDirty: formState.isDirty,
      isSubmitting: formState.isSubmitting,
      currentValues: form.watch(),
    });
  }

  return {
    form,
    onSubmit: form.handleSubmit(onSubmit),
    isPending,
    hasErrors,
    isFreeEvent, // ✨ 新規追加
    // 既存実装との互換性のため
    formData: form.watch(),
    errors: {
      ...formState.errors,
      general: formState.errors.root?.message,
    },
  };
};
