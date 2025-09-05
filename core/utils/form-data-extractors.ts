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
 */
function extractArrayValues(formData: FormData, key: string): string[] | undefined {
  const values = formData.getAll(key) as string[];
  const filteredValues = values.filter((v) => v !== null && v !== "");
  return filteredValues.length > 0 ? filteredValues : undefined;
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
 * 型安全なブール値抽出関数
 * 内部実装用のヘルパー関数
 */
function extractBooleanValue(formData: FormData, key: string): boolean {
  const value = formData.get(key) as string | null;
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
  registration_deadline?: string;
  payment_deadline?: string;
}

export function extractEventCreateFormData(formData: FormData): EventCreateFormData {
  const extractor = createFormDataExtractor(formData);

  return {
    title: extractor.extractRequiredValue("title"),
    date: extractor.extractRequiredValue("date"),
    fee: extractor.extractRequiredValue("fee"),
    payment_methods: extractor.extractArrayValues("payment_methods"),
    location: extractor.extractOptionalValue("location"),
    description: extractor.extractOptionalValue("description"),
    capacity: extractor.extractOptionalValue("capacity"),
    registration_deadline: extractor.extractOptionalValue("registration_deadline"),
    payment_deadline: extractor.extractOptionalValue("payment_deadline"),
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
    location: extractor.extractOptionalValue("location"),
    description: extractor.extractOptionalValue("description"),
    capacity: extractor.extractOptionalValue("capacity"),
    registration_deadline: extractor.extractOptionalValue("registration_deadline"),
    payment_deadline: extractor.extractOptionalValue("payment_deadline"),
  };
}
