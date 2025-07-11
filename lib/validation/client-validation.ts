import { createEventSchema } from "@/lib/validations/event";
import { ZodError, z } from "zod";

export interface ValidationErrors {
  title?: string;
  description?: string;
  location?: string;
  date?: string;
  capacity?: string;
  registrationDeadline?: string;
  paymentDeadline?: string;
  paymentMethods?: string;
  fee?: string;
  general?: string;
}

export interface EventFormData {
  title: string;
  description: string;
  location: string;
  date: string;
  capacity: string;
  registrationDeadline: string;
  paymentDeadline: string;
  paymentMethods: string;
  fee: string;
}

// 個別フィールドのバリデーションスキーマ
const fieldSchemas = {
  title: z.string().min(1, 'タイトルは必須です').max(100, 'タイトルは100文字以内で入力してください'),
  description: z.string().max(1000, '説明は1000文字以内で入力してください').optional(),
  location: z.string().max(200, '場所は200文字以内で入力してください').optional(),
  date: z.string().min(1, '開催日時は必須です'),
  capacity: z.string().optional().refine((val) => {
    if (!val) return true;
    const capacity = parseInt(val);
    return !isNaN(capacity) && capacity >= 1 && capacity <= 10000;
  }, '定員は1以上10000以下である必要があります'),
  fee: z.string().min(1, '参加費は必須です'),
  payment_methods: z.string().min(1, '決済方法を選択してください'),
};

// フィールド名の変換マップ（camelCase → snake_case）
const fieldNameMap: Record<string, string> = {
  registrationDeadline: "registration_deadline",
  paymentDeadline: "payment_deadline",
  paymentMethods: "payment_methods",
};

// エラーフィールド名の変換マップ（snake_case → camelCase）
const errorFieldMap: Record<string, string> = {
  registration_deadline: "registrationDeadline",
  payment_deadline: "paymentDeadline",
  payment_methods: "paymentMethods",
};

// 効率的なフィールド単位バリデーション
export const validateField = (
  name: string,
  value: string,
  formData: EventFormData
): ValidationErrors => {
  const errors: ValidationErrors = {};
  
  // 1. 特殊バリデーション（基本バリデーションより優先）
  
  // 関連フィールドとの相関バリデーション（日付フィールドのみ）
  if (name === 'date' || name === 'registrationDeadline' || name === 'paymentDeadline') {
    return validateDateRelations(name, formData);
  }
  
  // 支払方法の特殊バリデーション
  if (name === 'paymentMethods') {
    return validatePaymentMethods(value);
  }
  
  // 参加費の特殊バリデーション（決済方法によって制約が変わる）
  if (name === 'fee') {
    return validateFee(value, formData.paymentMethods);
  }
  
  // 2. 単一フィールドの基本バリデーション
  const mappedFieldName = fieldNameMap[name] || name;
  const schema = fieldSchemas[mappedFieldName as keyof typeof fieldSchemas];
  
  if (schema) {
    try {
      schema.parse(value || undefined);
    } catch (error) {
      if (error instanceof ZodError) {
        const errorFieldName = errorFieldMap[mappedFieldName] || name;
        errors[errorFieldName as keyof ValidationErrors] = error.errors[0].message;
        return errors;
      }
    }
  }
  
  return errors;
};

// 日付関連の相関バリデーション
function validateDateRelations(changedField: string, formData: EventFormData): ValidationErrors {
  const errors: ValidationErrors = {};
  
  // 開催日時が空の場合は必須エラーを返す
  if (changedField === 'date' && !formData.date) {
    errors.date = '開催日時は必須です';
    return errors;
  }
  
  if (!formData.date) return errors;
  
  const eventDate = new Date(formData.date);
  const now = new Date();
  
  // 開催日時が未来かチェック
  if (changedField === 'date' && eventDate <= now) {
    errors.date = '開催日時は現在時刻より後である必要があります';
    return errors;
  }
  
  // 参加申込締切の相関チェック
  if (formData.registrationDeadline) {
    const regDeadline = new Date(formData.registrationDeadline);
    if (regDeadline <= now) {
      errors.registrationDeadline = '参加申込締切は現在時刻より後である必要があります';
    } else if (regDeadline >= eventDate) {
      errors.registrationDeadline = '参加申込締切は開催日時より前に設定してください';
    }
  }
  
  // 決済締切の相関チェック
  if (formData.paymentDeadline) {
    const payDeadline = new Date(formData.paymentDeadline);
    if (payDeadline <= now) {
      errors.paymentDeadline = '決済締切は現在時刻より後である必要があります';
    } else if (payDeadline >= eventDate) {
      errors.paymentDeadline = '決済締切は開催日時より前に設定してください';
    } else if (formData.registrationDeadline) {
      const regDeadline = new Date(formData.registrationDeadline);
      if (payDeadline < regDeadline) {
        errors.paymentDeadline = '決済締切は参加申込締切以降に設定してください';
      }
    }
  }
  
  return errors;
}

// 支払方法の特殊バリデーション
function validatePaymentMethods(value: string): ValidationErrors {
  const errors: ValidationErrors = {};
  
  if (!value) {
    errors.paymentMethods = '決済方法を選択してください';
    return errors;
  }
  
  const methods = value.split(',').map(method => method.trim());
  const validMethods = ['stripe', 'cash', 'free'];
  
  const invalidMethods = methods.filter(method => !validMethods.includes(method));
  if (invalidMethods.length > 0) {
    errors.paymentMethods = '有効な決済方法を選択してください';
    return errors;
  }
  
  if (methods.includes('free') && methods.length > 1) {
    errors.paymentMethods = '無料イベントと有料決済方法を同時に選択することはできません';
  }
  
  return errors;
}

// 参加費の特殊バリデーション
function validateFee(value: string, paymentMethods: string): ValidationErrors {
  const errors: ValidationErrors = {};
  
  if (!paymentMethods) {
    // 決済方法が選択されていない場合は基本バリデーションのみ
    if (!value) {
      errors.fee = '参加費は必須です';
    }
    return errors;
  }
  
  const methods = paymentMethods.split(',').map(method => method.trim());
  const isFreeEvent = methods.includes('free');
  
  if (isFreeEvent) {
    // 無料イベントの場合は参加費は0円でなければならない
    if (value !== '0' && value !== '') {
      errors.fee = '無料イベントの参加費は0円である必要があります';
    }
  } else {
    // 有料イベントの場合は参加費は必須
    if (!value) {
      errors.fee = '参加費は必須です';
    } else {
      const fee = parseInt(value);
      if (isNaN(fee) || fee < 0 || fee > 1000000) {
        errors.fee = '参加費は0以上1000000以下である必要があります';
      }
    }
  }
  
  return errors;
}

export const validateAllFields = (formData: EventFormData): ValidationErrors => {
  // フォームデータをZodスキーマ用に変換
  const schemaData = {
    title: formData.title,
    description: formData.description || undefined,
    location: formData.location || undefined,
    date: formData.date,
    capacity: formData.capacity || undefined,
    registration_deadline: formData.registrationDeadline || undefined,
    payment_deadline: formData.paymentDeadline || undefined,
    payment_methods: formData.paymentMethods || "",
    fee: formData.fee,
  };

  try {
    createEventSchema.parse(schemaData);
    return {}; // バリデーション成功
  } catch (error) {
    if (error instanceof ZodError) {
      const errors: ValidationErrors = {};
      
      error.errors.forEach((err) => {
        const fieldPath = err.path[0] as string;
        const errorFieldName = errorFieldMap[fieldPath] || fieldPath;
        errors[errorFieldName as keyof ValidationErrors] = err.message;
      });
      
      return errors;
    }
    return { general: "予期しないエラーが発生しました" };
  }
};
