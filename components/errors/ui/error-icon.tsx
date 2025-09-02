/**
 * エラー種別に応じた統一アイコンコンポーネント
 */

import type { LucideIcon } from 'lucide-react'
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
} from 'lucide-react'

import { cn } from '@core/utils'

import type { ErrorCategory, ErrorCode } from '../error-types'

interface ErrorIconProps {
  category?: ErrorCategory
  code?: ErrorCode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

/**
 * エラーカテゴリに応じたアイコンマッピング
 */
const categoryIconMap: Record<ErrorCategory, LucideIcon> = {
  network: Wifi,
  auth: Lock,
  validation: AlertTriangle,
  business: Ban,
  server: Server,
  client: AlertTriangle,
  security: Shield,
  payment: CreditCard,
  'not-found': FileQuestion,
  unknown: HelpCircle,
}

/**
 * エラーコードに応じたアイコンマッピング（カテゴリより優先）
 */
const codeIconMap: Partial<Record<ErrorCode, LucideIcon>> = {
  '401': Lock,
  '403': Shield,
  '404': FileQuestion,
  '429': Shield,
  '500': Server,
  '502': Server,
  '503': Wrench,
  '504': Server,
  EVENT_ENDED: Clock,
  EVENT_FULL: Users,
  REGISTRATION_CLOSED: Clock,
  DUPLICATE_REGISTRATION: Ban,
  INVALID_INVITE: XCircle,
  PAYMENT_FAILED: CreditCard,
  RATE_LIMITED: Shield,
  MAINTENANCE: Wrench,
}

/**
 * エラーカテゴリに応じた色クラスマッピング
 */
const categoryColorMap: Record<ErrorCategory, string> = {
  network: 'text-red-500',
  auth: 'text-amber-500',
  validation: 'text-orange-500',
  business: 'text-blue-500',
  server: 'text-red-600',
  client: 'text-orange-500',
  security: 'text-red-600',
  payment: 'text-red-500',
  'not-found': 'text-gray-500',
  unknown: 'text-gray-600',
}

/**
 * サイズクラスマッピング
 */
const sizeClassMap = {
  sm: 'h-6 w-6',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
  xl: 'h-16 w-16',
}

/**
 * エラーアイコンコンポーネント
 */
export function ErrorIcon({ category = 'unknown', code, size = 'xl', className }: ErrorIconProps) {
  // コードが指定されている場合はそれを優先、なければカテゴリから選択
  const IconComponent = (code && codeIconMap[code]) || categoryIconMap[category]

  // 色はカテゴリベースで決定
  const colorClass = categoryColorMap[category]
  const sizeClass = sizeClassMap[size]

  return (
    <div className={cn('flex items-center justify-center', className)}>
      <IconComponent className={cn(sizeClass, colorClass)} />
    </div>
  )
}

/**
 * エラーカテゴリに応じたアイコンを取得する関数
 */
export function getErrorIcon(category: ErrorCategory, code?: ErrorCode): LucideIcon {
  return (code && codeIconMap[code]) || categoryIconMap[category]
}

/**
 * エラーカテゴリに応じた色クラスを取得する関数
 */
export function getErrorColor(category: ErrorCategory): string {
  return categoryColorMap[category]
}

/**
 * プリセットエラーアイコンコンポーネント
 */
export const NetworkErrorIcon = ({ size = 'xl', className }: Omit<ErrorIconProps, 'category'>) => (
  <ErrorIcon category="network" size={size} className={className} />
)

export const AuthErrorIcon = ({ size = 'xl', className }: Omit<ErrorIconProps, 'category'>) => (
  <ErrorIcon category="auth" size={size} className={className} />
)

export const ServerErrorIcon = ({ size = 'xl', className }: Omit<ErrorIconProps, 'category'>) => (
  <ErrorIcon category="server" size={size} className={className} />
)

export const NotFoundIcon = ({ size = 'xl', className }: Omit<ErrorIconProps, 'category'>) => (
  <ErrorIcon category="not-found" size={size} className={className} />
)

export const PaymentErrorIcon = ({ size = 'xl', className }: Omit<ErrorIconProps, 'category'>) => (
  <ErrorIcon category="payment" size={size} className={className} />
)

export const SecurityErrorIcon = ({ size = 'xl', className }: Omit<ErrorIconProps, 'category'>) => (
  <ErrorIcon category="security" size={size} className={className} />
)

export const BusinessErrorIcon = ({ size = 'xl', className }: Omit<ErrorIconProps, 'category'>) => (
  <ErrorIcon category="business" size={size} className={className} />
)
