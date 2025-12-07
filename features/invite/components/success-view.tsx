import React from "react";

import Link from "next/link";

import { CheckCircle, Copy, ExternalLink, CalendarDays } from "lucide-react";

import type { RegisterParticipationData } from "../actions/register-participation";

interface SuccessViewProps {
  data: RegisterParticipationData;
  guestUrl?: string; // Optional since it might be derived or passed
}

export const SuccessView: React.FC<SuccessViewProps> = ({ data, guestUrl: explicitGuestUrl }) => {
  const isJoin = data.attendanceStatus === "attending";

  const derivedGuestUrl =
    explicitGuestUrl ||
    (typeof window !== "undefined"
      ? `${window.location.origin}/guest/${data.guestToken}`
      : `/guest/${data.guestToken}`);

  const getStatusText = () => {
    switch (data.attendanceStatus) {
      case "attending":
        return "参加登録を受け付けました";
      case "not_attending":
        return "不参加として登録しました";
      case "maybe":
        return "登録しました";
      default:
        return "登録完了";
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(derivedGuestUrl);
    alert("リンクをコピーしました");
  };

  return (
    <div className="max-w-xl mx-auto text-center space-y-8 animate-fade-in-up">
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="flex justify-center mb-4">
          <div className="bg-green-100 p-4 rounded-full">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-2">{getStatusText()}</h2>
        <p className="text-slate-600">
          {data.participantNickname}さん、ご回答ありがとうございます。
          <br />
          確認メールを <span className="font-semibold">{data.participantEmail}</span>{" "}
          宛に送信しました。
        </p>

        {isJoin && data.paymentMethod === "stripe" && (
          <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-lg text-left">
            <p className="text-sm text-indigo-800 font-semibold mb-1">お支払いについて</p>
            <p className="text-sm text-indigo-600">
              この後、自動的に決済画面へ遷移します。もし遷移しない場合は、メール内のリンクから手続きをお願いします。
            </p>
          </div>
        )}

        {isJoin && data.paymentMethod === "cash" && (
          <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-lg text-left">
            <p className="text-sm text-indigo-800 font-semibold mb-1">お支払いについて</p>
            <p className="text-sm text-indigo-600">当日、受付にて現金でお支払いください。</p>
          </div>
        )}

        <div className="mt-8 pt-8 border-t border-slate-100">
          <div className="text-left">
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center">
              <ExternalLink className="w-5 h-5 mr-2 text-slate-500" />
              ゲスト専用管理ページ
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              以下のリンクから、いつでも出欠状況の変更や支払い状況の確認が可能です。
              <br />
              <span className="text-orange-600 font-bold">このURLを必ず保存してください。</span>
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={derivedGuestUrl}
                className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 text-sm rounded-lg p-3 focus:outline-none"
              />
              <button
                onClick={copyToClipboard}
                className="bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-lg transition-colors flex items-center"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
            <a
              href={derivedGuestUrl}
              className="mt-4 block text-center text-indigo-600 font-medium hover:underline text-sm"
            >
              管理ページに移動する &rarr;
            </a>
          </div>
        </div>
      </div>

      <div className="text-center">
        {/* TODO: Add proper link to Top Page */}
        <Link
          href="/"
          className="inline-flex items-center text-slate-500 hover:text-indigo-600 transition-colors"
        >
          <CalendarDays className="w-4 h-4 mr-1.5" />
          みんなの集金トップへ戻る
        </Link>
      </div>
    </div>
  );
};
