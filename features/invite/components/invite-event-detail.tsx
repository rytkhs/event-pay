"use client";

import { useRef, useState, useEffect } from "react";

// アイコンインポート
import {
  Calendar,
  MapPin,
  Users,
  DollarSign,
  Clock,
  CreditCard,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar as CalendarIcon,
  Star,
  Loader2,
} from "lucide-react";

import { PAYMENT_METHOD_LABELS } from "@core/constants/payment-methods";
import { EVENT_STATUS_LABELS } from "@core/types/enums";
import { EventDetail } from "@core/utils/invite-token";
import { sanitizeEventDescription, sanitizeForEventPay } from "@core/utils/sanitize";
import { formatUtcToJstByType } from "@core/utils/timezone";
import { type ParticipationFormData } from "@core/validation/participation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  registerParticipationAction,
  type RegisterParticipationData,
} from "../actions/register-participation";

import { ParticipationConfirmation } from "./participation-confirmation";
import { ParticipationForm } from "./participation-form";

interface InviteEventDetailProps {
  event: EventDetail;
  inviteToken: string;
  initialRegistrationData?: RegisterParticipationData | null;
}

export function InviteEventDetail({
  event,
  inviteToken,
  initialRegistrationData,
}: InviteEventDetailProps): JSX.Element {
  const [showForm, setShowForm] = useState(false);
  const [registrationData, setRegistrationData] = useState<RegisterParticipationData | null>(
    initialRegistrationData ?? null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // 申し込み完了時に上部へスクロール
  useEffect(() => {
    if (registrationData && !initialRegistrationData) {
      // ページの上部にスムーススクロール
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
  }, [registrationData, initialRegistrationData]);

  const formatCurrency = (amount: number): string => {
    return amount === 0 ? "無料" : `${amount.toLocaleString()}円`;
  };

  const getStatusText = (status: string): string => {
    return EVENT_STATUS_LABELS[status as keyof typeof EVENT_STATUS_LABELS] ?? status;
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" => {
    switch (status) {
      case "upcoming":
        return "default";
      case "ongoing":
        return "secondary";
      case "completed":
      case "cancelled":
        return "destructive";
      default:
        return "secondary";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "upcoming":
        return <CheckCircle className="h-4 w-4" />;
      case "ongoing":
        return <Star className="h-4 w-4" />;
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "cancelled":
        return <XCircle className="h-4 w-4" />;
      default:
        return <AlertCircle className="h-4 w-4" />;
    }
  };

  // 定員状況の確認
  const isCapacityReached = event.capacity ? event.attendances_count >= event.capacity : false;

  // 申込期限の確認
  const isRegistrationDeadlinePassed = event.registration_deadline
    ? new Date() > new Date(event.registration_deadline)
    : false;

  const canRegister =
    !isCapacityReached && !isRegistrationDeadlinePassed && event.status === "upcoming";

  const handleParticipationSubmit = async (data: ParticipationFormData): Promise<void> => {
    try {
      setIsSubmitting(true);
      setError(null);

      // FormDataを作成
      const formData = new FormData();
      formData.append("inviteToken", data.inviteToken);
      formData.append("nickname", data.nickname);
      formData.append("email", data.email);
      formData.append("attendanceStatus", data.attendanceStatus);
      if (data.paymentMethod) {
        formData.append("paymentMethod", data.paymentMethod);
      }

      // 参加登録サーバーアクションを実行
      const result = await registerParticipationAction(formData);

      if (result.success) {
        // 成功時は確認ページを表示
        setRegistrationData(result.data);
        setShowForm(false);
      } else {
        // エラーはフォーム側で処理するためスローして委譲
        throw { code: result.code ?? "UNKNOWN_ERROR", message: result.error };
      }
    } catch (err) {
      // 親では握りつぶさずフォーム側のエラーハンドラに委譲
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  // 確認ページが表示される場合
  if (registrationData) {
    return (
      <ParticipationConfirmation
        registrationData={registrationData}
        event={event}
        inviteToken={inviteToken}
      />
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* エラーメッセージ */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>エラーが発生しました</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* イベントタイトル＆ステータスカード */}
      <Card className="overflow-hidden shadow-sm">
        <div className="bg-primary px-6 py-8 text-primary-foreground">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-2xl sm:text-3xl font-bold break-words mb-2">
                {sanitizeForEventPay(event.title)}
              </h2>
              <div className="flex items-center gap-2">
                {getStatusIcon(event.status)}
                <Badge variant={getStatusBadgeVariant(event.status)} className="text-sm">
                  {getStatusText(event.status)}
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* イベント基本情報カード */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 開催情報 */}
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              開催情報
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <CalendarIcon className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">開催日時</div>
                <div className="font-medium text-foreground break-words">
                  {formatUtcToJstByType(event.date, "japanese")}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">開催場所</div>
                <div className="font-medium text-foreground break-words">
                  {sanitizeForEventPay(event.location ?? "未定")}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Users className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">定員</div>
                <div className="font-medium text-foreground">
                  {event.capacity === null ? (
                    <span className="text-success">制限なし</span>
                  ) : event.capacity === 0 ? (
                    <span className="text-destructive">募集停止</span>
                  ) : event.capacity < 0 ? (
                    <span className="text-destructive">無効な定員</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span>
                        {event.attendances_count}/{event.capacity}人
                      </span>
                      {isCapacityReached ? (
                        <Badge variant="destructive" className="text-xs">
                          満員
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          募集中
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 申込・決済情報 */}
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              申込・決済情報
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 参加費表示 */}
            <div className="flex items-start gap-3">
              <DollarSign
                className={`h-5 w-5 mt-0.5 flex-shrink-0 ${event.fee === 0 ? "text-success" : "text-muted-foreground"}`}
              />
              <div className="flex-1">
                <div className="text-sm text-muted-foreground">参加費</div>
                <div
                  className={`font-bold text-lg ${event.fee === 0 ? "text-success" : "text-foreground"}`}
                >
                  {formatCurrency(event.fee)}
                </div>
              </div>
            </div>

            {event.registration_deadline && (
              <div className="flex items-start gap-3">
                <Clock className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground">申込締切</div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground break-words">
                      {formatUtcToJstByType(event.registration_deadline, "japanese")}
                    </span>
                    {isRegistrationDeadlinePassed && (
                      <Badge variant="destructive" className="text-xs">
                        締切済み
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}

            {event.payment_deadline && (
              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground">オンライン決済締切</div>
                  <div className="font-medium text-foreground break-words">
                    {formatUtcToJstByType(event.payment_deadline, "japanese")}
                  </div>
                </div>
              </div>
            )}

            {event.fee > 0 && (
              <div className="flex items-start gap-3">
                <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="text-sm text-muted-foreground">決済方法</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {event.payment_methods.map((method) => (
                      <Badge key={method} variant="outline" className="text-xs">
                        {PAYMENT_METHOD_LABELS[method]}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* イベント詳細説明 */}
      {event.description && (
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">イベント詳細</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap break-words">
              {sanitizeEventDescription(event.description)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 参加申し込みCTAセクション */}
      <Card className="border-2 border-primary/20 bg-primary/5 shadow-sm">
        <CardContent className="pt-6">
          <div className="text-center space-y-4">
            {canRegister ? (
              <>
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-foreground">参加申し込み</h3>
                  <p className="text-sm text-muted-foreground">
                    下のボタンから参加申し込みを開始できます
                  </p>
                </div>
                <Button
                  onClick={() => {
                    setShowForm(true);
                    // フォーム表示後にスクロール
                    setTimeout(() => {
                      formRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      });
                    }, 100);
                  }}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground px-8 py-4 text-lg font-semibold shadow-sm hover:shadow-md transform hover:scale-105 transition-all duration-200 min-w-[200px]"
                  size="lg"
                >
                  {isSubmitting ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      処理中...
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5" />
                      参加申し込みをする
                    </div>
                  )}
                </Button>
                <div className="text-xs text-muted-foreground">
                  ✓ 簡単な情報入力だけで申し込み完了
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-muted-foreground">参加申し込み受付終了</h3>
                  <Alert variant="destructive" className="shadow-sm">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>申し込みできません</AlertTitle>
                    <AlertDescription className="space-y-2 mt-2">
                      {isCapacityReached && (
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          <span>定員に達しています</span>
                        </div>
                      )}
                      {isRegistrationDeadlinePassed && (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          <span>申込期限が過ぎています</span>
                        </div>
                      )}
                      {event.status !== "upcoming" && (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          <span>このイベントは申し込みを受け付けていません</span>
                        </div>
                      )}
                    </AlertDescription>
                  </Alert>
                </div>
                <Button
                  disabled
                  variant="secondary"
                  size="lg"
                  className="w-full sm:w-auto px-8 py-4 text-lg min-w-[200px] opacity-60"
                >
                  参加申し込み不可
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 参加申し込みフォーム */}
      {showForm && (
        <div ref={formRef} className="scroll-mt-4">
          <ParticipationForm
            event={event}
            inviteToken={inviteToken}
            onSubmit={handleParticipationSubmit}
            onCancel={() => {
              setShowForm(false);
              setError(null);
            }}
            isSubmitting={isSubmitting}
          />
        </div>
      )}
    </div>
  );
}
