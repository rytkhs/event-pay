"use client";

import { useState } from "react";

import {
  CheckCircle,
  Copy,
  ExternalLink,
  CreditCard,
  Banknote,
  Shield,
  Calendar,
  MapPin,
  Clock,
  AlertTriangle,
} from "lucide-react";

import { PAYMENT_METHOD_LABELS } from "@core/constants/payment-methods";
import { useClipboard } from "@core/hooks/use-clipboard";
import { ATTENDANCE_STATUS_LABELS } from "@core/types/enums";
import { EventDetail } from "@core/utils/invite-token";
import { sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { dismissInviteSuccessAction } from "@/features/invite/actions/invite-success-cookie";

import { type RegisterParticipationData } from "../actions/register-participation";

interface ParticipationConfirmationProps {
  registrationData: RegisterParticipationData;
  event: EventDetail;
  inviteToken?: string;
}

export function ParticipationConfirmation({
  registrationData,
  event,
  inviteToken,
}: ParticipationConfirmationProps) {
  const [showGuestUrl, setShowGuestUrl] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { copyToClipboard, isCopied } = useClipboard();

  // アクセシビリティ用のID生成
  const confirmationId = "participation-confirmation";
  const guestUrlSectionId = "guest-url-section";

  // ゲスト管理URLの生成
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
  const guestManagementUrl = `${baseUrl}/guest/${registrationData.guestToken}`;

  // 参加ステータスの日本語表示
  const getAttendanceStatusText = (status: string) => {
    return ATTENDANCE_STATUS_LABELS[status as keyof typeof ATTENDANCE_STATUS_LABELS] || status;
  };

  // 参加ステータスのBadgeバリアント
  const getAttendanceStatusBadge = (status: string) => {
    switch (status) {
      case "attending":
        return { variant: "default" as const, className: "bg-green-500 hover:bg-green-600" };
      case "not_attending":
        return { variant: "destructive" as const, className: "" };
      case "maybe":
        return {
          variant: "secondary" as const,
          className: "bg-yellow-500 hover:bg-yellow-600 text-white",
        };
      default:
        return { variant: "outline" as const, className: "" };
    }
  };

  // 決済方法のアイコン
  const getPaymentMethodIcon = (method?: string) => {
    switch (method) {
      case "stripe":
        return <CreditCard className="h-4 w-4" />;
      case "cash":
        return <Banknote className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const handleCopyGuestUrl = () => {
    copyToClipboard(guestManagementUrl);
  };

  const handleOpenGuestUrl = () => {
    window.open(guestManagementUrl, "_blank");
  };

  const _handleDismiss = async () => {
    if (!inviteToken) return;
    await dismissInviteSuccessAction(inviteToken);
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  return (
    <div
      className="max-w-2xl mx-auto space-y-6"
      role="main"
      aria-labelledby={`${confirmationId}-title`}
    >
      {/* 成功メッセージ */}
      <Alert
        className="border-green-200 bg-green-50 text-green-800"
        role="status"
        aria-live="polite"
      >
        <CheckCircle className="h-5 w-5" />
        <AlertTitle id={`${confirmationId}-title`} className="text-green-800">
          参加申し込みが完了しました！
        </AlertTitle>
        <AlertDescription className="text-green-700">
          ご登録いただいた内容を確認し、管理URLをブックマークしてください
        </AlertDescription>
      </Alert>

      {/* 登録内容確認 */}
      <Card className="p-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-semibold text-foreground" id="registration-details">
              登録内容
            </h3>
            <Badge
              {...getAttendanceStatusBadge(registrationData.attendanceStatus)}
              className={getAttendanceStatusBadge(registrationData.attendanceStatus).className}
              role="status"
              aria-label={`参加ステータス: ${getAttendanceStatusText(registrationData.attendanceStatus)}`}
            >
              {getAttendanceStatusText(registrationData.attendanceStatus)}
            </Badge>
          </div>

          <Separator />

          <div className="space-y-4" role="region" aria-labelledby="registration-details">
            {/* 基本情報 */}
            <div className="grid gap-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  イベント名
                </h4>
                <p className="mt-1 text-base font-medium text-foreground">
                  {sanitizeForEventPay(registrationData.eventTitle)}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  参加者
                </h4>
                <p className="mt-1 text-base font-medium text-foreground">
                  {sanitizeForEventPay(registrationData.participantNickname)}
                </p>
                <p className="text-sm text-muted-foreground">{registrationData.participantEmail}</p>
              </div>

              {registrationData.paymentMethod && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    決済方法
                  </h4>
                  <div className="mt-1 flex items-center space-x-2">
                    <span aria-hidden="true" className="text-primary">
                      {getPaymentMethodIcon(registrationData.paymentMethod)}
                    </span>
                    <span className="text-base font-medium">
                      {PAYMENT_METHOD_LABELS[registrationData.paymentMethod]}
                    </span>
                  </div>
                </div>
              )}

              {registrationData.attendanceStatus === "attending" && event.fee > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    参加費
                  </h4>
                  <p
                    className="mt-1 text-2xl font-bold text-foreground"
                    aria-label={`参加費 ${event.fee.toLocaleString()}円`}
                  >
                    ¥{event.fee.toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* 決済情報（参加かつ有料の場合） */}
      {registrationData.requiresAdditionalPayment && (
        <Alert className="border-blue-200 bg-blue-50">
          {getPaymentMethodIcon(registrationData.paymentMethod)}
          <AlertTitle id="payment-info-title" className="text-blue-900">
            決済について
          </AlertTitle>
          <AlertDescription className="text-blue-800">
            {registrationData.paymentMethod === "stripe" && (
              <>
                <p>クレジットカード決済を選択されました。</p>
                <p className="mt-2">下記の管理URLから決済を完了してください。</p>
              </>
            )}
            {registrationData.paymentMethod === "cash" && (
              <>
                <p>現金決済を選択されました。</p>
                <p className="mt-2">直接現金でお支払いください。</p>
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* ゲスト管理URL - 最重要セクション */}
      <Card
        className="p-6 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10"
        role="region"
        aria-labelledby={guestUrlSectionId}
      >
        <div className="space-y-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 id={guestUrlSectionId} className="text-xl font-semibold text-foreground">
                管理URL
              </h3>
              <p className="text-sm text-muted-foreground">
                参加状況の確認・変更、決済手続きができます
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* 管理URLの表示・アクション */}
            {!showGuestUrl ? (
              <Button
                onClick={() => setShowGuestUrl(true)}
                className="w-full h-12 text-base font-medium"
                aria-expanded={showGuestUrl}
                aria-controls="guest-url-content"
              >
                <Shield className="h-4 w-4 mr-2" />
                管理URLを表示
              </Button>
            ) : (
              <div id="guest-url-content" className="space-y-4">
                <div className="p-4 bg-white border rounded-lg shadow-sm">
                  <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    管理URL
                  </p>
                  <div
                    className="text-sm font-mono text-foreground break-all leading-relaxed p-2 bg-muted/30 rounded border"
                    role="textbox"
                    aria-readonly="true"
                    aria-label="ゲスト管理URL"
                    tabIndex={0}
                  >
                    {guestManagementUrl}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    onClick={handleCopyGuestUrl}
                    variant="outline"
                    className="h-11 font-medium"
                    aria-describedby={isCopied ? "copy-status" : undefined}
                  >
                    <Copy className="h-4 w-4 mr-2" aria-hidden="true" />
                    {isCopied ? "コピー済み ✓" : "URLをコピー"}
                    {isCopied && (
                      <span id="copy-status" className="sr-only" aria-live="polite">
                        URLがクリップボードにコピーされました
                      </span>
                    )}
                  </Button>
                  <Button onClick={handleOpenGuestUrl} className="h-11 font-medium">
                    <ExternalLink className="h-4 w-4 mr-2" aria-hidden="true" />
                    開く
                  </Button>
                </div>

                <Button
                  onClick={() => setShowGuestUrl(false)}
                  variant="ghost"
                  size="sm"
                  className="w-full text-muted-foreground hover:text-foreground"
                >
                  URLを非表示
                </Button>
              </div>
            )}
          </div>

          {/* セキュリティ警告 */}
          <Alert variant="destructive" className="border-orange-200 bg-orange-50">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-orange-900">重要な注意事項</AlertTitle>
            <AlertDescription className="text-orange-800">
              この管理URLは他の人と共有しないでください。URLを知っている人は誰でもあなたの参加状況を変更できます。
            </AlertDescription>
          </Alert>
        </div>
      </Card>

      {/* イベント詳細情報 */}
      <Card className="p-6" role="region" aria-labelledby="event-details-title">
        <div className="space-y-6">
          <h3 id="event-details-title" className="text-xl font-semibold text-foreground">
            イベント詳細
          </h3>

          <Separator />

          <div className="grid gap-4">
            <div className="flex items-start space-x-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  開催日時
                </h4>
                <p className="mt-1 text-base font-medium text-foreground">
                  {formatUtcToJstByType(event.date, "japanese")}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                  開催場所
                </h4>
                <p className="mt-1 text-base font-medium text-foreground">
                  {sanitizeForEventPay(event.location || "未定")}
                </p>
              </div>
            </div>

            {event.registration_deadline && (
              <div className="flex items-start space-x-3">
                <Clock className="h-5 w-5 text-orange-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    申込締切
                  </h4>
                  <p className="mt-1 text-base font-medium text-foreground">
                    {formatUtcToJstByType(event.registration_deadline, "japanese")}
                  </p>
                </div>
              </div>
            )}

            {event.payment_deadline && (
              <div className="flex items-start space-x-3">
                <CreditCard className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                    決済締切
                  </h4>
                  <p className="mt-1 text-base font-medium text-foreground">
                    {formatUtcToJstByType(event.payment_deadline, "japanese")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 次のステップ */}
      <Card
        className="p-6 bg-gradient-to-br from-slate-50 to-slate-100"
        role="region"
        aria-labelledby="next-steps-title"
      >
        <div className="space-y-6">
          <h3 id="next-steps-title" className="text-xl font-semibold text-foreground">
            次のステップ
          </h3>

          <Separator />

          <div className="space-y-6">
            {registrationData.requiresAdditionalPayment && (
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                    1
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <CreditCard className="h-4 w-4 text-blue-500" />
                    <p className="font-semibold text-foreground">決済を完了</p>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    上記の管理URLから「決済を完了する」ボタンをクリックしてください
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {registrationData.requiresAdditionalPayment ? "2" : "1"}
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center space-x-2 mb-1">
                  <Calendar className="h-4 w-4 text-green-500" />
                  <p className="font-semibold text-foreground">イベントなどに参加</p>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">お待ちしています！</p>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="flex items-start space-x-3">
                <Shield className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-blue-900 mb-1">参加状況の変更について</p>
                  <p className="text-sm text-blue-800 leading-relaxed">
                    予定が変わった場合は、上記の管理URLからいつでも参加状況を変更できます。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
