/**
 * ローディング関連の共通型定義
 * コンポーネント間で一貫性を保つため
 */

// 基本的なサイズ
export type ComponentSize = "sm" | "md" | "lg";

// ローディングバリアント
export type LoadingVariant = "spinner" | "dots" | "pulse";

// スケルトンバリアント
export type SkeletonVariant = "text" | "image" | "button" | "card";

// 進捗値（0-100の範囲）
export type Progress = number & { readonly __brand: "Progress" };

// ローディング状態
export interface LoadingState {
  readonly isLoading: boolean;
  readonly progress?: Progress;
  readonly message?: string;
  readonly canCancel: boolean;
  readonly error?: LoadingError;
  readonly activeTasks: readonly LoadingTask[];
  readonly estimatedTimeRemaining?: number;
}

// ローディングタスク
export interface LoadingTask {
  readonly id: string;
  readonly message: string;
  readonly progress?: Progress;
  readonly startTime: number;
}

// ローディングエラー
export interface LoadingError {
  readonly message: string;
  readonly code?: string;
  readonly timestamp: number;
}

// ローディング操作のオプション
export interface LoadingOptions {
  readonly canCancel?: boolean;
  readonly timeout?: number;
  readonly id?: string;
  readonly onCancel?: () => void;
  readonly onTimeout?: () => void;
}

// レスポンシブ対応のベースプロパティ
export interface ResponsiveProps {
  readonly responsive?: boolean;
  readonly className?: string;
}

// アニメーション対応のベースプロパティ
export interface AnimationProps {
  readonly animate?: boolean;
  readonly animationDuration?: string;
}

// アクセシビリティ対応のベースプロパティ
export interface AccessibilityProps {
  readonly "aria-label"?: string;
  readonly "data-testid"?: string;
}

// 共通のローディングコンポーネントプロパティ
export interface BaseLoadingProps extends ResponsiveProps, AnimationProps, AccessibilityProps {
  readonly size?: ComponentSize;
}

// LoadingSpinnerのプロパティ
export interface LoadingSpinnerProps extends BaseLoadingProps {
  readonly variant?: LoadingVariant;
  readonly color?: string;
}

// SkeletonLoaderのプロパティ
export interface SkeletonLoaderProps extends BaseLoadingProps {
  readonly width?: string | number;
  readonly height?: string | number;
  readonly variant?: SkeletonVariant;
  readonly style?: React.CSSProperties;
}

// 型ガード関数
export function isProgress(value: number): value is Progress {
  return typeof value === "number" && !isNaN(value) && value >= 0 && value <= 100;
}

export function isLoadingVariant(value: string): value is LoadingVariant {
  return ["spinner", "dots", "pulse"].includes(value);
}

export function isSkeletonVariant(value: string): value is SkeletonVariant {
  return ["text", "image", "button", "card"].includes(value);
}

export function isComponentSize(value: string): value is ComponentSize {
  return ["sm", "md", "lg"].includes(value);
}
