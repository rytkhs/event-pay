"use client";

import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createEventAction } from "@/app/events/actions";
import type { EventFormDataRHF } from "@/types/models";

// react-hook-form用のデフォルト値
const defaultValues: EventFormDataRHF = {
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

// 基本的なバリデーションルール
const validationRules = {
  title: {
    required: "タイトルは必須です",
    maxLength: {
      value: 100,
      message: "タイトルは100文字以内で入力してください",
    },
  },
  date: {
    required: "開催日時は必須です",
    validate: (value: string) => {
      if (!value) return "開催日時は必須です";
      const selectedDate = new Date(value);
      const now = new Date();
      return selectedDate > now || "開催日時は現在時刻より後である必要があります";
    },
  },
  fee: {
    required: "参加費は必須です",
    min: {
      value: 0,
      message: "参加費は0以上である必要があります",
    },
    max: {
      value: 1000000,
      message: "参加費は1000000以下である必要があります",
    },
  },
  payment_methods: {
    validate: (value: string[]) => {
      if (!value || value.length === 0) {
        return "決済方法を選択してください";
      }
      return true;
    },
  },
  location: {
    maxLength: {
      value: 200,
      message: "場所は200文字以内で入力してください",
    },
  },
  description: {
    maxLength: {
      value: 1000,
      message: "説明は1000文字以内で入力してください",
    },
  },
  capacity: {
    min: {
      value: 1,
      message: "定員は1以上である必要があります",
    },
    max: {
      value: 10000,
      message: "定員は10000以下である必要があります",
    },
  },
};

/**
 * react-hook-formを使用したイベント作成フォーム用フック
 * セキュリティファースト設計を維持しながら、パフォーマンスと開発効率を向上
 */
export const useEventForm = () => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // react-hook-formの初期化
  const form = useForm<EventFormDataRHF>({
    defaultValues,
    mode: "onChange", // リアルタイムバリデーション
    reValidateMode: "onChange",
  });

  // フォーム送信処理
  const onSubmit = async (data: EventFormDataRHF) => {
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
  const hasErrors = !formState.isValid || !!formState.errors.root;

  return {
    form,
    onSubmit: form.handleSubmit(onSubmit),
    isPending,
    hasErrors,
    validationRules,
    // 既存実装との互換性のため
    formData: form.watch(),
    errors: {
      ...formState.errors,
      general: formState.errors.root?.message,
    },
  };
};
