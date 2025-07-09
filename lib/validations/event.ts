import { z } from 'zod';

// 決済方法の定数
const PAYMENT_METHODS = ['stripe', 'cash', 'free'] as const;

// バリデーション用のヘルパー関数
const validateFutureDate = (val: string) => {
  const date = new Date(val);
  return !isNaN(date.getTime()) && date > new Date();
};

const validatePositiveNumber = (val: string) => {
  const num = parseInt(val);
  return !isNaN(num) && num >= 0;
};

const validateCapacity = (val: string) => {
  if (!val) return true;
  const capacity = parseInt(val);
  return !isNaN(capacity) && capacity >= 1;
};

export const createEventSchema = z.object({
  title: z.string()
    .min(1, 'タイトルは必須です')
    .max(100, 'タイトルは100文字以内で入力してください'),
  
  date: z.string()
    .min(1, '開催日は必須です')
    .refine(validateFutureDate, '開催日は現在時刻以降で設定してください'),
  
  fee: z.string()
    .min(1, '参加費は必須です')
    .refine(validatePositiveNumber, '参加費は0円以上で設定してください'),
  
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
      return methods.every(method => PAYMENT_METHODS.includes(method as any));
    }, '有効な決済方法を選択してください'),
  
  location: z.string()
    .max(200, '場所は200文字以内で入力してください')
    .optional(),
  
  description: z.string()
    .max(1000, '説明は1000文字以内で入力してください')
    .optional(),
  
  capacity: z.string()
    .refine(validateCapacity, '定員は1名以上で設定してください')
    .optional(),
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type PaymentMethod = typeof PAYMENT_METHODS[number];