import React from "react";

import { CheckCircle, Copy, ExternalLink } from "lucide-react";

import type { RegisterParticipationData } from "../actions/register-participation";

interface SuccessViewProps {
  data: RegisterParticipationData;
}

export const SuccessView: React.FC<SuccessViewProps> = ({ data }) => {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const derivedGuestUrl = `${baseUrl}/guest/${data.guestToken}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(derivedGuestUrl);
    alert("リンクをコピーしました");
  };

  return (
    <div className="max-w-xl mx-auto text-center space-y-8 animate-fade-in-up">
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        <div className="flex justify-center mb-4">
          <div className="bg-success/10 p-4 rounded-full">
            <CheckCircle className="w-12 h-12 text-success" />
          </div>
        </div>

        <h2 className="text-2xl font-bold text-slate-900 mb-2">登録完了</h2>
        <p className="text-slate-600">
          {data.participantNickname}さん、ご回答ありがとうございます。
          <br />
          確認メールを <span className="font-semibold">{data.participantEmail}</span>{" "}
          宛に送信しました。
        </p>

        <div className="mt-8 pt-8 border-t border-slate-100">
          <div className="text-left">
            <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center">
              <ExternalLink className="w-5 h-5 mr-2 text-slate-500" />
              参加者マイページ
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              以下のリンクから、いつでも出欠状況の変更や支払い状況の確認が可能です。
              <br />
              <span className="text-warning font-bold">このURLを必ず保存してください。</span>
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
              className="mt-4 block text-center text-primary font-medium hover:underline text-sm"
            >
              参加者マイページに移動する &rarr;
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
