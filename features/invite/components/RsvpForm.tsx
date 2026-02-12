import React, { useState, useMemo } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  CreditCard,
  Banknote,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { useForm, SubmitHandler, Resolver } from "react-hook-form";

import type { InviteEventDetail } from "@core/types/invite";
import {
  createParticipationFormSchema,
  ParticipationFormData,
} from "@core/validation/participation";

import { useParticipationErrorHandler } from "@/core/hooks/useErrorHandler";

interface RsvpFormProps {
  event: InviteEventDetail;
  inviteToken: string;
  onSubmit: (data: ParticipationFormData) => Promise<void>;
  isSubmitting?: boolean;
}

export const RsvpForm: React.FC<RsvpFormProps> = ({
  event,
  inviteToken,
  onSubmit,
  isSubmitting: externalIsSubmitting = false,
}) => {
  const [internalIsSubmitting, setInternalIsSubmitting] = useState(false);
  const isSubmitting = externalIsSubmitting || internalIsSubmitting;
  const { handleError, isError, error, clearError } = useParticipationErrorHandler();

  // Memoize schema
  const validationSchema = useMemo(() => createParticipationFormSchema(event.fee), [event.fee]);

  const form = useForm<ParticipationFormData>({
    resolver: zodResolver(validationSchema) as unknown as Resolver<ParticipationFormData>,
    defaultValues: {
      inviteToken,
      nickname: "",
      email: "",
      attendanceStatus: "attending" as const,
      paymentMethod: "stripe" as const,
    },
    mode: "onChange",
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = form;

  const watchedStatus = watch("attendanceStatus");
  const watchedPaymentMethod = watch("paymentMethod");

  const isJoin = watchedStatus === "attending";

  // Handle status change
  const handleStatusChange = (status: "attending" | "maybe" | "not_attending") => {
    setValue("attendanceStatus", status);
    if (status !== "attending") {
      setValue("paymentMethod", undefined);
    } else {
      // Restore default if coming back to attending
      if (!watchedPaymentMethod) {
        setValue("paymentMethod", "stripe");
      }
    }
    clearError();
  };

  const onFormSubmit: SubmitHandler<ParticipationFormData> = async (data) => {
    try {
      setInternalIsSubmitting(true);
      clearError();
      await onSubmit(data);
    } catch (err) {
      handleError(err, {
        eventId: event.id,
        action: "participation_submit",
      });
    } finally {
      setInternalIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit(async (data) => {
        await onFormSubmit(data as unknown as ParticipationFormData);
      })}
      className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 sm:p-8"
    >
      <h2 className="text-xl font-bold text-slate-900 mb-6">参加登録</h2>

      {isError && error && (
        <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg text-sm">
          <p className="font-bold">エラーが発生しました</p>
          <p>{error.userMessage}</p>
        </div>
      )}

      {/* Hidden Token */}
      <input type="hidden" {...register("inviteToken")} value={inviteToken} />

      <div className="space-y-6">
        {/* Nickname */}
        <div>
          <label htmlFor="nickname" className="block text-sm font-medium text-slate-700 mb-1">
            ニックネーム <span className="text-red-500">*</span>
          </label>
          <input
            {...register("nickname")}
            id="nickname"
            className={`w-full px-4 py-2 rounded-lg border ${
              errors.nickname
                ? "border-destructive focus:ring-destructive/20"
                : "border-input focus:ring-ring/50"
            } focus:border-primary focus:ring focus:outline-none transition-all`}
            placeholder="例: たなか"
          />
          {errors.nickname && (
            <p className="text-red-500 text-xs mt-1">{errors.nickname.message}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
            メールアドレス <span className="text-red-500">*</span>
          </label>
          <input
            {...register("email")}
            type="email"
            id="email"
            className={`w-full px-4 py-2 rounded-lg border ${
              errors.email
                ? "border-destructive focus:ring-destructive/20"
                : "border-input focus:ring-ring/50"
            } focus:border-primary focus:ring focus:outline-none transition-all`}
            placeholder="例: user@example.com"
          />
          <p className="text-xs text-slate-500 mt-1">
            ※ 登録完了メールや、参加者マイページURLが送信されます。
          </p>
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        {/* Status */}
        <div>
          <p className="block text-sm font-medium text-slate-700 mb-3">
            出欠 <span className="text-red-500">*</span>
          </p>
          <div className="grid grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => handleStatusChange("attending")}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                watchedStatus === "attending"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-slate-200 hover:border-primary/40 text-slate-600"
              }`}
            >
              <CheckCircle2
                className={`w-6 h-6 mb-1 ${
                  watchedStatus === "attending" ? "fill-primary text-white" : ""
                }`}
              />
              <span className="text-sm font-bold">参加</span>
            </button>

            <button
              type="button"
              onClick={() => handleStatusChange("maybe")}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                watchedStatus === "maybe"
                  ? "border-warning bg-warning/10 text-warning-foreground"
                  : "border-slate-200 hover:border-warning/40 text-slate-600"
              }`}
            >
              <HelpCircle
                className={`w-6 h-6 mb-1 ${
                  watchedStatus === "maybe" ? "fill-warning text-white" : ""
                }`}
              />
              <span className="text-sm font-bold">未定</span>
            </button>

            <button
              type="button"
              onClick={() => handleStatusChange("not_attending")}
              className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                watchedStatus === "not_attending"
                  ? "border-slate-600 bg-slate-100 text-slate-800"
                  : "border-slate-200 hover:border-slate-300 text-slate-600"
              }`}
            >
              <XCircle
                className={`w-6 h-6 mb-1 ${
                  watchedStatus === "not_attending" ? "fill-slate-600 text-white" : ""
                }`}
              />
              <span className="text-sm font-bold">不参加</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            出欠は申込締切まで何度でも変更できます。
            予定がわからない場合は「未定」で登録することをおすすめします。
          </p>
          {watchedStatus === "maybe" && (
            <p className="text-xs text-warning-foreground mt-2 bg-warning/10 p-2 rounded">
              ※ 「未定」は定員に含まれず、決済も発生しません。参加確定時に変更してください。
            </p>
          )}
        </div>

        {/* Payment Method - Conditional */}
        {isJoin && event.fee > 0 && (
          <div className="animate-fade-in-down">
            <p className="block text-sm font-medium text-slate-700 mb-3">
              支払い方法 <span className="text-red-500">*</span>
            </p>
            <div className="space-y-3">
              {event.payment_methods.includes("stripe") && (
                <label
                  className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${
                    watchedPaymentMethod === "stripe"
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    value="stripe"
                    className="w-4 h-4 text-primary focus:ring-primary border-gray-300"
                    {...register("paymentMethod")}
                  />
                  <div className="ml-3 flex-1">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <CreditCard className="w-4 h-4" /> オンライン決済
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      クレジットカード / Apple Pay / Google Payなど
                    </span>
                  </div>
                </label>
              )}

              {event.payment_methods.includes("cash") && (
                <label
                  className={`flex items-center p-4 border rounded-xl cursor-pointer transition-all ${
                    watchedPaymentMethod === "cash"
                      ? "border-primary bg-primary/10 ring-1 ring-primary"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    value="cash"
                    className="w-4 h-4 text-primary focus:ring-primary border-gray-300"
                    {...register("paymentMethod")}
                  />
                  <div className="ml-3 flex-1">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Banknote className="w-4 h-4" /> 現金決済
                    </span>
                    <span className="block text-xs text-slate-500 mt-0.5">
                      現金で直接お支払いください
                    </span>
                  </div>
                </label>
              )}
            </div>
            {errors.paymentMethod && (
              <p className="text-red-500 text-xs mt-1">{errors.paymentMethod.message}</p>
            )}
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3.5 px-6 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              登録する
              <ArrowRight className="w-5 h-5" />
            </>
          )}
        </button>
      </div>
    </form>
  );
};
