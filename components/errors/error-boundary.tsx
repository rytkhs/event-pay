/**
 * 統一されたReact Error Boundaryコンポーネント
 * 既存のerror-boundary.tsxを完全に置き換える
 */

'use client'

import type { ReactNode } from 'react'
import React from 'react'

import { ErrorLayout } from './error-layout'
import { logError, addBreadcrumb } from './error-logger'
import type { ErrorBoundaryProps, ErrorFallbackProps } from './error-types'

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
  errorInfo?: React.ErrorInfo
}

/**
 * 統一されたError Boundaryコンポーネント
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    })

    // パンくずリスト追加
    addBreadcrumb(
      'error-boundary',
      `React Error Boundary caught error: ${error.message}`,
      'error',
      {
        componentStack: errorInfo.componentStack,
        level: this.props.level || 'component',
      }
    )

    // カスタムエラーハンドラー実行
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // エラーログ記録
    logError(
      {
        code: '500',
        category: 'client',
        severity: this.props.level === 'global' ? 'critical' : 'high',
        title: `${this.props.level === 'global' ? 'アプリケーション' : 'コンポーネント'}でエラーが発生しました`,
        message: error.message || '予期しないエラーが発生しました',
        description: `${this.props.level || 'component'}レベルのError Boundaryでキャッチされました`,
        timestamp: new Date(),
        context: {
          level: this.props.level,
          componentStack: errorInfo.componentStack,
        },
      },
      error,
      {
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
      }
    )
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  render() {
    if (this.state.hasError) {
      // カスタムフォールバック使用
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback
        return (
          <FallbackComponent
            error={this.state.error}
            errorInfo={this.state.errorInfo}
            resetError={this.resetError}
            level={this.props.level}
          />
        )
      }

      // レベルに応じたデフォルトフォールバック
      return (
        <DefaultErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          resetError={this.resetError}
          level={this.props.level}
        />
      )
    }

    return this.props.children
  }
}

/**
 * デフォルトのエラーフォールバック
 */
function DefaultErrorFallback({ error, resetError, level = 'component' }: ErrorFallbackProps) {
  // レベルに応じたエラー表示の調整
  const levelConfig = {
    global: {
      title: 'アプリケーションエラー',
      message: 'アプリケーション全体でエラーが発生しました',
      description: 'ページを再読み込みするか、ホームページに戻ってください。',
      severity: 'critical' as const,
      showSupport: true,
      showRetry: false,
      showBack: false,
    },
    page: {
      title: 'ページエラー',
      message: 'このページでエラーが発生しました',
      description: 'ページを再読み込みするか、前のページに戻ってください。',
      severity: 'high' as const,
      showBack: true,
      showRetry: false,
      showSupport: false,
    },
    component: {
      title: 'エラーが発生しました',
      message: 'コンポーネントの処理中にエラーが発生しました',
      description: '再試行するか、ページを再読み込みしてください。',
      severity: 'medium' as const,
      showRetry: true,
      showBack: false,
      showSupport: false,
    },
  }

  const config = levelConfig[level]

  return (
    <ErrorLayout
      code="500"
      category="client"
      severity={config.severity}
      title={config.title}
      message={config.message}
      description={config.description}
      showRetry={config.showRetry}
      showBack={config.showBack}
      showSupport={config.showSupport}
      onRetry={resetError}
      error={error}
      size={level === 'component' ? 'sm' : 'md'}
    />
  )
}

/**
 * 参加フォーム専用のError Boundary
 */
export function ParticipationErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary level="component" fallback={ParticipationErrorFallback}>
      {children}
    </ErrorBoundary>
  )
}

/**
 * 参加フォーム専用のエラーフォールバック
 */
function ParticipationErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <ErrorLayout
      code="500"
      category="business"
      severity="medium"
      title="参加申し込みエラー"
      message="参加申し込み処理中にエラーが発生しました"
      description="しばらく時間をおいて再度お試しください。"
      showRetry={true}
      showHome={false}
      showBack={false}
      onRetry={resetError}
      error={error}
      size="sm"
    />
  )
}

/**
 * 決済処理専用のError Boundary
 */
export function PaymentErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary level="component" fallback={PaymentErrorFallback}>
      {children}
    </ErrorBoundary>
  )
}

/**
 * 決済処理専用のエラーフォールバック
 */
function PaymentErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <ErrorLayout
      code="PAYMENT_FAILED"
      category="payment"
      severity="high"
      title="決済エラー"
      message="決済処理中にエラーが発生しました"
      description="カード情報をご確認の上、再度お試しください。"
      showRetry={true}
      showSupport={true}
      onRetry={resetError}
      error={error}
      size="sm"
    />
  )
}

/**
 * ページレベルError Boundary
 */
export function PageErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary level="page">{children}</ErrorBoundary>
}

/**
 * グローバルレベルError Boundary
 */
export function GlobalErrorBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary level="global">{children}</ErrorBoundary>
}
