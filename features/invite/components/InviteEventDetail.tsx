"use client";

import { useState, useEffect } from "react";

import { AlertCircle, XCircle, Users, Clock } from "lucide-react";

import type { ServerActionResult } from "@core/types/server-actions";
import type { EventDetail } from "@core/utils/invite-token";
import { type ParticipationFormData } from "@core/validation/participation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

import type { RegisterParticipationData } from "../types";

import { EventDetailView } from "./EventDetailView";
import { RsvpForm } from "./RsvpForm";
import { SuccessView } from "./SuccessView";

interface InviteEventDetailProps {
  event: EventDetail;
  inviteToken: string;
  initialRegistrationData?: RegisterParticipationData | null;
  registerParticipationAction: RegisterParticipationAction;
}

type RegisterParticipationAction = (
  formData: FormData
) => Promise<ServerActionResult<RegisterParticipationData>>;

export function InviteEventDetail({
  event,
  inviteToken,
  initialRegistrationData,
  registerParticipationAction,
}: InviteEventDetailProps): JSX.Element {
  const [registrationData, setRegistrationData] = useState<RegisterParticipationData | null>(
    initialRegistrationData ?? null
  );

  // 申し込み完了時に上部へスクロール
  useEffect(() => {
    if (registrationData && !initialRegistrationData) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [registrationData, initialRegistrationData]);

  // 定員状況の確認
  const isCapacityReached = event.capacity ? event.attendances_count >= event.capacity : false;

  // 申込期限の確認
  const isRegistrationDeadlinePassed = event.registration_deadline
    ? new Date() > new Date(event.registration_deadline)
    : false;

  const canRegister =
    !isCapacityReached && !isRegistrationDeadlinePassed && event.status === "upcoming";

  const handleParticipationSubmit = async (data: ParticipationFormData): Promise<void> => {
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
      if (!result.data) {
        throw { code: "UNKNOWN_ERROR", message: "参加登録に失敗しました。" };
      }
      setRegistrationData(result.data);
      return;
    }

    throw { code: result.code ?? "UNKNOWN_ERROR", message: result.error };
  };

  if (registrationData) {
    return <SuccessView data={registrationData} />;
  }

  return (
    <div className="animate-fade-in space-y-8">
      <EventDetailView event={event} />

      {canRegister ? (
        <RsvpForm event={event} inviteToken={inviteToken} onSubmit={handleParticipationSubmit} />
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 text-center space-y-4">
          <div className="flex justify-center">
            <AlertCircle className="w-12 h-12 text-slate-300" />
          </div>
          <h2 className="text-xl font-bold text-slate-700">参加申し込み受付終了</h2>

          <Alert variant="destructive" className="max-w-md mx-auto text-left">
            <AlertCircle className="h-4 w-4" />
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
                  <XCircle className="h-4 w-4" />
                  <span>このイベントは申し込みを受け付けていません</span>
                </div>
              )}
            </AlertDescription>
          </Alert>

          <p className="text-slate-500 text-sm">
            現在、このイベントへの新規参加申し込みは受け付けておりません。
            <br />
            主催者にお問い合わせください。
          </p>
        </div>
      )}
    </div>
  );
}
