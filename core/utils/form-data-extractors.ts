/**
 * イベント専用FormData抽出ユーティリティ
 *
 * イベント作成・更新のServer Actions向けの型安全なFormData抽出機能を提供
 * nullチェックと空文字チェックを統一的に処理
 */

import type { UpdateEventFormData } from "@core/validation/event";

/**
 * 型安全な値抽出関数（オプショナル）
 * 内部実装用のヘルパー関数
 */
function extractOptionalValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key) as string | null;
  // nullと空文字をundefinedに変換
  return value !== null && value !== "" ? value : undefined;
}

/**
 * 型安全な値抽出関数（clearable）
 * 空文字はクリア意図としてそのまま返す（undefinedは未指定）
 */
function extractClearableValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key) as string | null;
  if (value === null) return undefined; // 未指定
  return value; // 空文字はそのまま返す
}

/**
 * 型安全な値抽出関数（必須）
 * 内部実装用のヘルパー関数
 */
function extractRequiredValue(formData: FormData, key: string): string {
  const value = formData.get(key) as string | null;
  // nullの場合は空文字列を返す（必須フィールドのデフォルト値）
  return value !== null && value !== "" ? value : "";
}

/**
 * 型安全な配列値抽出関数
 * 内部実装用のヘルパー関数
 * カンマ区切りの文字列と複数の値の両方に対応
 */
function extractArrayValues(formData: FormData, key: string): string[] | undefined {
  const values = formData.getAll(key) as string[];

  if (values.length === 0) {
    // キーが存在するかチェックして、存在する場合は明示的クリア、存在しない場合は未指定
    return formData.has(key) ? [] : undefined;
  }

  // 値が1つ以上存在するが、全て空文字列 → 明示的クリア
  const allEmpty = values.every((v) => v === "");
  if (allEmpty) {
    return [];
  }

  if (values.length > 1) {
    // 複数の値が送られている場合（従来の動作）
    const filteredValues = values.filter((v) => v !== null && v !== "");
    return filteredValues.length > 0 ? filteredValues : [];
  }

  // 単一の値の場合、カンマ区切りの文字列を考慮
  const singleValue = values[0];
  if (singleValue === "") {
    return [];
  }
  const splitValues = singleValue
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v !== "");
  return splitValues.length > 0 ? splitValues : [];
}

/**
 * 型安全な数値抽出関数
 * 内部実装用のヘルパー関数
 */
function extractNumberValue(formData: FormData, key: string): number | undefined {
  const value = extractOptionalValue(formData, key);
  if (!value) return undefined;

  // safeParseNumberを使用して型安全な変換を行う
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed !== 0 || value.trim() !== "" ? parsed : undefined;
}

/**
 * 型安全なブール値抽出関数（必須）
 * 内部実装用のヘルパー関数
 */
function extractBooleanValue(formData: FormData, key: string): boolean {
  const value = formData.get(key) as string | null;
  return value === "true" || value === "on";
}

/**
 * 型安全なブール値抽出関数（オプション）
 * キーが存在しない場合はundefinedを返す
 * 更新処理での意図しない上書きを防ぐため
 */
function extractOptionalBooleanValue(formData: FormData, key: string): boolean | undefined {
  const value = formData.get(key) as string | null;
  // キーが存在しない場合はundefinedを返す（未変更として扱う）
  if (value === null) return undefined;
  return value === "true" || value === "on";
}

/**
 * FormData抽出のベースインターフェース
 * 内部実装用
 */
interface FormDataExtractor {
  extractOptionalValue: (key: string) => string | undefined;
  extractRequiredValue: (key: string) => string;
  extractArrayValues: (key: string) => string[] | undefined;
  extractNumberValue: (key: string) => number | undefined;
  extractBooleanValue: (key: string) => boolean;
}

/**
 * FormData抽出器のファクトリー関数
 * 内部実装用のヘルパー関数
 */
function createFormDataExtractor(formData: FormData): FormDataExtractor {
  return {
    extractOptionalValue: (key) => extractOptionalValue(formData, key),
    extractRequiredValue: (key) => extractRequiredValue(formData, key),
    extractArrayValues: (key) => extractArrayValues(formData, key),
    extractNumberValue: (key) => extractNumberValue(formData, key),
    extractBooleanValue: (key) => extractBooleanValue(formData, key),
  };
}

/**
 * イベント作成用のFormData抽出
 * 内部実装用
 */
interface EventCreateFormData {
  title: string;
  date: string;
  fee: string;
  payment_methods: string[];
  location?: string;
  description?: string;
  capacity?: string;
  registration_deadline: string;
  payment_deadline?: string;
  allow_payment_after_deadline?: boolean;
  grace_period_days?: number;
}

export function extractEventCreateFormData(formData: FormData): EventCreateFormData {
  const extractor = createFormDataExtractor(formData);

  return {
    title: extractor.extractRequiredValue("title"),
    date: extractor.extractRequiredValue("date"),
    fee: extractor.extractRequiredValue("fee"),
    payment_methods: extractor.extractArrayValues("payment_methods") || [],
    location: extractor.extractOptionalValue("location"),
    description: extractor.extractOptionalValue("description"),
    capacity: extractor.extractOptionalValue("capacity"),
    registration_deadline: extractor.extractRequiredValue("registration_deadline"),
    payment_deadline: extractor.extractOptionalValue("payment_deadline"),
    allow_payment_after_deadline: extractor.extractBooleanValue("allow_payment_after_deadline"),
    grace_period_days: extractor.extractNumberValue("grace_period_days"),
  };
}

/**
 * イベント更新用のFormData抽出
 * バリデーションスキーマと一致する型を使用
 */

export function extractEventUpdateFormData(formData: FormData): Partial<UpdateEventFormData> {
  const extractor = createFormDataExtractor(formData);

  return {
    title: extractor.extractOptionalValue("title"),
    date: extractor.extractOptionalValue("date"),
    fee: extractor.extractOptionalValue("fee"),
    payment_methods: extractor.extractArrayValues("payment_methods"),
    location: extractClearableValue(formData, "location"),
    description: extractClearableValue(formData, "description"),
    capacity: extractClearableValue(formData, "capacity"),
    registration_deadline: extractOptionalValue(formData, "registration_deadline"),
    payment_deadline: extractClearableValue(formData, "payment_deadline"),
    allow_payment_after_deadline: extractOptionalBooleanValue(
      formData,
      "allow_payment_after_deadline"
    ),
    grace_period_days: extractor.extractNumberValue("grace_period_days"),
  };
}
