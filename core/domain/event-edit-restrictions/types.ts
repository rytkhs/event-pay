/**
 * イベント編集制限ドメイン - 型定義
 */

/** 制限レベル - 制限の重要度と性質を示す */
export type RestrictionLevel = "structural" | "conditional" | "advisory";

/** 制限状態 - フィールドの制限状況 */
export type RestrictionStatus = "allowed" | "restricted" | "warning";

/** 制限対象フィールド */
export type RestrictableField =
  | "fee"
  | "payment_methods"
  | "capacity"
  | "title"
  | "description"
  | "location"
  | "date"
  | "registration_deadline"
  | "payment_deadline"
  | "allow_payment_after_deadline"
  | "grace_period_days";

/** 制限コンテキスト - 制限判定に必要な不変情報 */
export interface RestrictionContext {
  /** 参加者が存在するか */
  hasAttendees: boolean;
  /** 参加者数 */
  attendeeCount: number;
  /** Stripe決済済み参加者が存在するか */
  hasStripePaid: boolean;
  /** イベントの現在状態 */
  eventStatus: "upcoming" | "ongoing" | "past" | "canceled";
  /** 元イベントデータ（変更検出用） */
  originalEvent: {
    fee: number | null;
    capacity: number | null;
    payment_methods: string[];
    title?: string;
    description?: string;
    location?: string;
    date?: string;
    registration_deadline?: string;
    payment_deadline?: string;
    allow_payment_after_deadline?: boolean;
    grace_period_days?: number;
  };
}

/** フォームデータ - 制限判定の対象となる動的データ */
export interface FormDataSnapshot {
  fee?: string | number;
  capacity?: string | number;
  payment_methods?: string[];
  title?: string;
  description?: string;
  location?: string;
  date?: string;
  registration_deadline?: string;
  payment_deadline?: string;
  allow_payment_after_deadline?: boolean;
  grace_period_days?: string | number;
  [key: string]: unknown;
}

/** 制限ルール - 個別の制限ルール */
export interface RestrictionRule {
  /** ルールID */
  id: string;
  /** 対象フィールド */
  field: RestrictableField;
  /** 制限レベル */
  level: RestrictionLevel;
  /** ルール名 */
  name: string;
  /** 判定関数 */
  evaluate: (
    context: RestrictionContext,
    formData: FormDataSnapshot
  ) => Promise<RestrictionEvaluation> | RestrictionEvaluation;
}

/** 制限評価結果 */
export interface RestrictionEvaluation {
  /** 制限されているか */
  isRestricted: boolean;
  /** 制限状態 */
  status: RestrictionStatus;
  /** ユーザー向けメッセージ */
  message: string;
  /** 詳細説明（オプション） */
  details?: string;
  /** 推奨アクション（オプション） */
  suggestedAction?: string;
}

/** アクティブな制限 - 現在有効な制限 */
export interface ActiveRestriction {
  /** 制限ルール */
  rule: RestrictionRule;
  /** 評価結果 */
  evaluation: RestrictionEvaluation;
  /** 最終更新タイムスタンプ */
  updatedAt: number;
}

/** 制限状態 - すべての制限の現在状況 */
export interface RestrictionState {
  /** 構造的制限（絶対変更不可） */
  structural: ActiveRestriction[];
  /** 条件的制限（条件下で変更不可） */
  conditional: ActiveRestriction[];
  /** 注意事項（変更可能だが注意が必要） */
  advisory: ActiveRestriction[];
  /** 更新タイムスタンプ */
  lastUpdated: number;
  /** エラーがあるか */
  hasErrors: boolean;
}

/** フィールド制限サマリー - フィールド単位の制限状況 */
export interface FieldRestrictionSummary {
  /** フィールド名 */
  field: RestrictableField;
  /** 制限されているか */
  isRestricted: boolean;
  /** 制限レベル */
  highestRestrictionLevel: RestrictionLevel | null;
  /** アクティブな制限一覧 */
  activeRestrictions: ActiveRestriction[];
  /** フィールドが編集可能か */
  isEditable: boolean;
}

/** 制限変更イベント */
export interface RestrictionChangeEvent {
  /** イベントタイプ */
  type: "restriction_added" | "restriction_removed" | "restriction_updated";
  /** 対象フィールド */
  field: RestrictableField;
  /** 制限 */
  restriction: ActiveRestriction | null;
  /** 前の状態（更新・削除時） */
  previousRestriction?: ActiveRestriction;
}

/** 制限エラーイベント */
export interface RestrictionErrorEvent {
  /** エラータイプ */
  type: "evaluation_error" | "context_error" | "rule_error";
  /** エラーメッセージ */
  message: string;
  /** エラー詳細 */
  details?: unknown;
  /** 関連フィールド */
  field?: RestrictableField;
}

/** 制限エンジン設定 */
export interface RestrictionEngineConfig {
  /** デバッグモード */
  debug?: boolean;
  /** 制限評価のスロットリング間隔（ミリ秒） */
  evaluationThrottleMs?: number;
  /** キャッシュを有効にするか */
  enableCache?: boolean;
  /** カスタム制限ルール */
  customRules?: RestrictionRule[];
}

/** フィールド別制限マップ */
export type FieldRestrictionMap = Map<RestrictableField, FieldRestrictionSummary>;
