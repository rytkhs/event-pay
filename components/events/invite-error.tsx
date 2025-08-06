"use client";

import {
  InvalidInviteError,
  EventEndedError,
  CapacityReachedError,
  RegistrationDeadlineError,
  NetworkError,
  ServerError,
  RateLimitError,
  GenericError,
} from "./error-pages";
import { getErrorDetails as _getErrorDetails } from "@/lib/utils/error-handler";

interface InviteErrorProps {
  errorMessage: string;
  errorCode?: string;
  showRetry?: boolean;
  eventTitle?: string;
  capacity?: number;
  deadline?: string;
}

export function InviteError({
  errorMessage,
  errorCode,
  showRetry = false,
  eventTitle,
  capacity,
  deadline,
}: InviteErrorProps) {
  const handleRetry = () => {
    window.location.reload();
  };

  // エラーコードに基づいて適切なエラーページを表示
  switch (errorCode) {
    case "INVALID_TOKEN":
    case "TOKEN_NOT_FOUND":
    case "TOKEN_EXPIRED":
      return <InvalidInviteError onRetry={showRetry ? handleRetry : undefined} />;

    case "EVENT_ENDED":
      return <EventEndedError eventTitle={eventTitle} />;

    case "CAPACITY_REACHED":
      return (
        <CapacityReachedError eventTitle={eventTitle} capacity={capacity} onRetry={handleRetry} />
      );

    case "REGISTRATION_DEADLINE_PASSED":
      return <RegistrationDeadlineError eventTitle={eventTitle} deadline={deadline} />;

    case "NETWORK_ERROR":
      return <NetworkError onRetry={handleRetry} />;

    case "INTERNAL_SERVER_ERROR":
    case "DATABASE_ERROR":
      return <ServerError onRetry={showRetry ? handleRetry : undefined} />;

    case "RATE_LIMIT_EXCEEDED":
      return <RateLimitError onRetry={handleRetry} />;

    default:
      // エラーコードが指定されていない場合は、メッセージから推測
      if (errorMessage.includes("無効") || errorMessage.includes("期限切れ")) {
        return <InvalidInviteError onRetry={showRetry ? handleRetry : undefined} />;
      }
      if (errorMessage.includes("終了") || errorMessage.includes("過ぎ")) {
        return <EventEndedError eventTitle={eventTitle} />;
      }
      if (errorMessage.includes("定員")) {
        return (
          <CapacityReachedError eventTitle={eventTitle} capacity={capacity} onRetry={handleRetry} />
        );
      }
      if (errorMessage.includes("ネットワーク") || errorMessage.includes("接続")) {
        return <NetworkError onRetry={handleRetry} />;
      }

      // 汎用エラーページを表示
      return (
        <GenericError
          title="アクセスできません"
          message={errorMessage}
          onRetry={showRetry ? handleRetry : undefined}
        />
      );
  }
}
