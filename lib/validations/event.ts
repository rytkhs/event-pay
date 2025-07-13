import { z } from 'zod';
import type { Database } from '@/types/database';
import { isUtcDateFuture } from '@/lib/utils/timezone';

// 決済方法の定数
const PAYMENT_METHODS = ['stripe', 'cash', 'free'] as const;

// 型ガード関数
function isValidPaymentMethod(method: string): method is Database['public']['Enums']['payment_method_enum'] {
  return PAYMENT_METHODS.includes(method as any);
}

// バリデーション用のヘルパー関数
const validateFutureDate = (val: string) => {
  const date = new Date(val);
  return !isNaN(date.getTime()) && isUtcDateFuture(date);
};

const validateOptionalFutureDate = (val: string) => {
  if (!val) return true;
  const date = new Date(val);
  return !isNaN(date.getTime()) && isUtcDateFuture(date);
};

const validatePositiveNumber = (val: string) => {
  const num = parseInt(val);
  return !isNaN(num) && num >= 0 && num <= 1000000;
};

const validateCapacity = (val: string) => {
  if (!val) return true;
  const capacity = parseInt(val);
  return !isNaN(capacity) && capacity >= 1 && capacity <= 10000;
};

export const createEventSchema = z.object({
  title: z.string()
    .min(1, 'タイトルは必須です')
    .max(100, 'タイトルは100文字以内で入力してください'),
  
  date: z.string()
    .min(1, '開催日時は必須です')
    .refine(validateFutureDate, '開催日時は現在時刻より後である必要があります'),
  
  fee: z.string()
    .min(1, '参加費は必須です')
    .refine(validatePositiveNumber, '参加費は0以上1000000以下である必要があります'),
  
  payment_methods: z.string()
    .min(1, '決済方法を選択してください')
    .transform((val) => {
      // カンマ区切りの文字列を配列に変換
      const methods = val.split(',').map(method => method.trim());
      // 重複を除去
      return [...new Set(methods)];
    })
    .refine((methods) => {
      // 全ての決済方法が有効かチェック
      return methods.every(method => isValidPaymentMethod(method));
    }, '有効な決済方法を選択してください')
    .refine((methods) => {
      // 無料と有料の組み合わせはNG
      return !(methods.includes('free') && methods.length > 1);
    }, '無料イベントと有料決済方法を同時に選択することはできません')
    .transform((methods) => {
      // 型安全な変換: string[] → payment_method_enum[]
      return methods.filter(isValidPaymentMethod);
    }),
  
  location: z.string()
    .max(200, '場所は200文字以内で入力してください')
    .optional(),
  
  description: z.string()
    .max(1000, '説明は1000文字以内で入力してください')
    .optional(),
  
  capacity: z.string()
    .refine(validateCapacity, '定員は1以上10000以下である必要があります')
    .optional(),
  
  registration_deadline: z.string()
    .refine(validateOptionalFutureDate, '参加申込締切は現在時刻より後である必要があります')
    .optional(),
  
  payment_deadline: z.string()
    .refine(validateOptionalFutureDate, '決済締切は現在時刻より後である必要があります')
    .optional(),
})
.refine((data) => {
  // 参加申込締切が開催日時より前であることを確認
  if (data.registration_deadline && data.date) {
    return new Date(data.registration_deadline) < new Date(data.date);
  }
  return true;
}, {
  message: '参加申込締切は開催日時より前に設定してください',
  path: ['registration_deadline'],
})
.refine((data) => {
  // 決済締切が開催日時より前であることを確認
  if (data.payment_deadline && data.date) {
    return new Date(data.payment_deadline) < new Date(data.date);
  }
  return true;
}, {
  message: '決済締切は開催日時より前に設定してください',
  path: ['payment_deadline'],
})
.refine((data) => {
  // 決済締切が参加申込締切以降であることを確認
  if (data.registration_deadline && data.payment_deadline) {
    return new Date(data.payment_deadline) >= new Date(data.registration_deadline);
  }
  return true;
}, {
  message: '決済締切は参加申込締切以降に設定してください',
  path: ['payment_deadline'],
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

// 日付フィルター用のバリデーションスキーマ
const dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;

export const dateFilterSchema = z.object({
  start: z.string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      return dateFormatRegex.test(val);
    }, '開始日はYYYY-MM-DD形式で入力してください')
    .refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, '有効な開始日を入力してください'),
  
  end: z.string()
    .optional()
    .refine((val) => {
      if (!val) return true;
      return dateFormatRegex.test(val);
    }, '終了日はYYYY-MM-DD形式で入力してください')
    .refine((val) => {
      if (!val) return true;
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, '有効な終了日を入力してください'),
})
.refine((data) => {
  // 開始日が終了日より前であることを確認
  if (data.start && data.end) {
    return new Date(data.start) <= new Date(data.end);
  }
  return true;
}, {
  message: '開始日は終了日以前に設定してください',
  path: ['start'],
});

export type DateFilterInput = z.infer<typeof dateFilterSchema>;