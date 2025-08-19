"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  AlertTriangle,
  Clock,
  Users,
  XCircle,
  RefreshCw,
  Home,
  ArrowLeft,
  Shield,
  Wifi,
  Server,
} from "lucide-react";
import { formatUtcToJst } from "@/lib/utils/timezone";

interface ErrorPageProps {
  title: string;
  message: string;
  description?: string;
  icon?: React.ReactNode;
  showRetry?: boolean;
  showHome?: boolean;
  showBack?: boolean;
  onRetry?: () => void;
  retryLabel?: string;
  children?: React.ReactNode;
}

/**
 * 基本エラーページコンポーネント
 */
function BaseErrorPage({
  title,
  message,
  description,
  icon,
  showRetry = false,
  showHome = true,
  showBack = false,
  onRetry,
  retryLabel = "再試行",
  children,
}: ErrorPageProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  const handleGoHome = () => {
    window.location.href = "/";
  };

  const handleGoBack = () => {
    window.history.back();
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <Card className="max-w-md w-full p-8 text-center">
        <div className="mb-6">
          {icon && <div className="mb-4">{icon}</div>}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{title}</h1>
          <p className="text-gray-600 mb-2">{message}</p>
          {description && <p className="text-sm text-gray-500">{description}</p>}
        </div>

        {children}

        <div className="space-y-3">
          {showRetry && (
            <Button
              onClick={handleRetry}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {retryLabel}
            </Button>
          )}

          {showBack && (
            <Button onClick={handleGoBack} variant="outline" className="w-full">
              <ArrowLeft className="h-4 w-4 mr-2" />
              戻る
            </Button>
          )}

          {showHome && (
            <Button
              onClick={handleGoHome}
              variant={showRetry || showBack ? "outline" : "default"}
              className="w-full"
            >
              <Home className="h-4 w-4 mr-2" />
              ホームに戻る
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * 無効な招待リンクエラーページ
 */
export function InvalidInviteError({ onRetry }: { onRetry?: () => void }) {
  return (
    <BaseErrorPage
      title="無効な招待リンク"
      message="この招待リンクは無効または期限切れです"
      description="正しい招待リンクをご確認いただくか、イベント主催者にお問い合わせください。"
      icon={<XCircle className="h-16 w-16 text-red-500 mx-auto" />}
      showRetry={false}
      showHome={true}
      onRetry={onRetry}
    />
  );
}

/**
 * イベント終了エラーページ
 */
export function EventEndedError({ eventTitle }: { eventTitle?: string }) {
  return (
    <BaseErrorPage
      title="イベント終了"
      message={eventTitle ? `「${eventTitle}」は終了しています` : "このイベントは終了しています"}
      description="既に終了したイベントには参加申し込みできません。"
      icon={<Clock className="h-16 w-16 text-gray-500 mx-auto" />}
      showRetry={false}
      showHome={true}
    />
  );
}

/**
 * 定員到達エラーページ
 */
export function CapacityReachedError({
  eventTitle,
  capacity,
  onRetry,
}: {
  eventTitle?: string;
  capacity?: number;
  onRetry?: () => void;
}) {
  return (
    <BaseErrorPage
      title="定員到達"
      message={
        eventTitle ? `「${eventTitle}」は定員に達しています` : "このイベントは定員に達しています"
      }
      description={capacity ? `定員: ${capacity}名` : "キャンセルが出た場合は再度お試しください。"}
      icon={<Users className="h-16 w-16 text-orange-500 mx-auto" />}
      showRetry={true}
      showHome={true}
      onRetry={onRetry}
      retryLabel="再確認"
    >
      <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-orange-700">
          キャンセルが出た場合は参加可能になることがあります。
          しばらく時間をおいて再度ご確認ください。
        </p>
      </div>
    </BaseErrorPage>
  );
}

/**
 * 登録期限過ぎエラーページ
 */
export function RegistrationDeadlineError({
  eventTitle,
  deadline,
}: {
  eventTitle?: string;
  deadline?: string;
}) {
  const formatDeadline = (deadline: string) => {
    try {
      return formatUtcToJst(new Date(deadline), "yyyy年MM月dd日 HH:mm");
    } catch {
      return deadline;
    }
  };

  return (
    <BaseErrorPage
      title="申込期限終了"
      message={
        eventTitle ? `「${eventTitle}」の申込期限が過ぎています` : "参加申込期限が過ぎています"
      }
      description={
        deadline
          ? `申込期限: ${formatDeadline(deadline)}`
          : "申込期限を過ぎたため、参加申し込みはできません。"
      }
      icon={<Clock className="h-16 w-16 text-red-500 mx-auto" />}
      showRetry={false}
      showHome={true}
    />
  );
}

/**
 * ネットワークエラーページ
 */
export function NetworkError({ onRetry }: { onRetry?: () => void }) {
  return (
    <BaseErrorPage
      title="接続エラー"
      message="インターネット接続に問題があります"
      description="ネットワーク接続をご確認の上、再度お試しください。"
      icon={<Wifi className="h-16 w-16 text-red-500 mx-auto" />}
      showRetry={true}
      showHome={true}
      onRetry={onRetry}
      retryLabel="再接続"
    />
  );
}

/**
 * サーバーエラーページ
 */
export function ServerError({ onRetry }: { onRetry?: () => void }) {
  return (
    <BaseErrorPage
      title="サーバーエラー"
      message="サーバーで問題が発生しています"
      description="しばらく時間をおいて再度お試しください。問題が続く場合は管理者にお問い合わせください。"
      icon={<Server className="h-16 w-16 text-red-500 mx-auto" />}
      showRetry={true}
      showHome={true}
      onRetry={onRetry}
    />
  );
}

/**
 * レート制限エラーページ
 */
export function RateLimitError({ onRetry }: { onRetry?: () => void }) {
  return (
    <BaseErrorPage
      title="アクセス制限"
      message="アクセス頻度が高すぎます"
      description="しばらく時間をおいて再度お試しください。"
      icon={<Shield className="h-16 w-16 text-orange-500 mx-auto" />}
      showRetry={true}
      showHome={true}
      onRetry={onRetry}
      retryLabel="再試行"
    >
      <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-orange-700">
          セキュリティのため、短時間での連続アクセスを制限しています。 5分程度お待ちください。
        </p>
      </div>
    </BaseErrorPage>
  );
}

/**
 * 重複登録エラーページ
 */
export function DuplicateRegistrationError({
  email,
  onRetry,
}: {
  email?: string;
  onRetry?: () => void;
}) {
  const maskedEmail = email ? email.replace(/(.{2}).*@/, "$1***@") : "このメールアドレス";

  return (
    <BaseErrorPage
      title="重複登録"
      message="既に登録済みです"
      description={`${maskedEmail}は既にこのイベントに登録されています。`}
      icon={<AlertTriangle className="h-16 w-16 text-orange-500 mx-auto" />}
      showRetry={false}
      showHome={true}
      showBack={true}
      onRetry={onRetry}
    >
      <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-700">
          参加状況を確認・変更したい場合は、登録完了時に送信されたメールに記載されている管理URLをご利用ください。
        </p>
      </div>
    </BaseErrorPage>
  );
}

/**
 * 汎用エラーページ
 */
export function GenericError({
  title = "エラーが発生しました",
  message = "予期しないエラーが発生しました",
  description,
  onRetry,
}: {
  title?: string;
  message?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <BaseErrorPage
      title={title}
      message={message}
      description={description}
      icon={<AlertTriangle className="h-16 w-16 text-red-500 mx-auto" />}
      showRetry={true}
      showHome={true}
      onRetry={onRetry}
    />
  );
}
