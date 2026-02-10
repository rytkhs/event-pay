/**
 * エラー種別に応じた統一アイコンコンポーネント
 */

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  XCircle,
  Wifi,
  Server,
  Shield,
  Clock,
  Users,
  CreditCard,
  FileQuestion,
  Lock,
  Ban,
  Wrench,
  HelpCircle,
} from "lucide-react";

import type { ErrorCategory, ErrorCode } from "@core/errors/types";
import { cn } from "@core/utils";

interface ErrorIconProps {
  category?: ErrorCategory;
  code?: ErrorCode;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

/**
 * エラーカテゴリに応じたアイコンマッピング
 */
const categoryIconMap: Record<ErrorCategory, LucideIcon> = {
  system: Server,
  external: Wifi,
  auth: Lock,
  validation: AlertTriangle,
  business: Ban,
  payment: CreditCard,
  security: Shield,
  "not-found": FileQuestion,
  unknown: HelpCircle,
};

/**
 * エラーコードに応じたアイコンマッピング（カテゴリより優先）
 */
const codeIconMap: Partial<Record<ErrorCode, LucideIcon>> = {
  UNAUTHORIZED: Lock,
  FORBIDDEN: Shield,
  NOT_FOUND: FileQuestion,
  RATE_LIMITED: Shield,
  INTERNAL_ERROR: Server,
  DATABASE_ERROR: Server,
  EXTERNAL_SERVICE_ERROR: Wifi,
  MAINTENANCE: Wrench,
  NETWORK_ERROR: Wifi,
  TIMEOUT_ERROR: Clock,
  EVENT_ENDED: Clock,
  EVENT_FULL: Users,
  REGISTRATION_CLOSED: Clock,
  DUPLICATE_REGISTRATION: Ban,
  INVITE_TOKEN_INVALID: XCircle,
  PAYMENT_FAILED: CreditCard,
  PAYMENT_PROCESSING_ERROR: CreditCard,
  PAYMENT_SESSION_CREATION_FAILED: CreditCard,
  CONNECT_ACCOUNT_NOT_FOUND: CreditCard,
  CONNECT_ACCOUNT_RESTRICTED: CreditCard,
  STRIPE_CONFIG_ERROR: CreditCard,
};

/**
 * エラーカテゴリに応じた色クラスマッピング
 */
const categoryColorMap: Record<ErrorCategory, string> = {
  system: "text-destructive",
  external: "text-warning",
  auth: "text-warning",
  validation: "text-warning",
  business: "text-info",
  payment: "text-destructive",
  security: "text-destructive",
  "not-found": "text-muted-foreground",
  unknown: "text-muted-foreground",
};

/**
 * サイズクラスマッピング
 */
const sizeClassMap = {
  sm: "h-6 w-6",
  md: "h-8 w-8",
  lg: "h-12 w-12",
  xl: "h-16 w-16",
};

/**
 * エラーアイコンコンポーネント
 */
export function ErrorIcon({ category = "unknown", code, size = "xl", className }: ErrorIconProps) {
  // コードが指定されている場合はそれを優先、なければカテゴリから選択
  const IconComponent = (code && codeIconMap[code]) || categoryIconMap[category];

  // 色はカテゴリベースで決定
  const colorClass = categoryColorMap[category];
  const sizeClass = sizeClassMap[size];

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <IconComponent className={cn(sizeClass, colorClass)} />
    </div>
  );
}
