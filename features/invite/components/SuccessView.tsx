"use client";

import React, { useState } from "react";

import Link from "next/link";

import { CheckCircle, Copy, ExternalLink } from "lucide-react";

import { useToast } from "@core/contexts/toast-context";

import { Button } from "@/components/ui/button";

import type { RegisterParticipationData } from "../types";

interface SuccessViewProps {
  data: RegisterParticipationData;
  onRegisterAnother: () => void | Promise<void>;
}

export const SuccessView: React.FC<SuccessViewProps> = ({ data, onRegisterAnother }) => {
  const { toast } = useToast();
  const [isResetting, setIsResetting] = useState(false);
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (typeof window !== "undefined" ? window.location.origin : "");
  const derivedGuestUrl = `${baseUrl}/guest/${data.guestToken}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(derivedGuestUrl);
    toast({
      title: "リンクをコピーしました",
      variant: "success",
    });
  };

  const handleRegisterAnother = async () => {
    if (isResetting) return;
    setIsResetting(true);
    try {
      await onRegisterAnother();
    } catch {
      // 呼び出し側でサイレント継続するためここでも握りつぶす
    } finally {
      setIsResetting(false);
    }
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
              以下のリンクから、いつでもステータスの変更や支払い状況の確認が可能です。
              <br />
              確認メールからもアクセスできます。
            </p>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={derivedGuestUrl}
                className="flex-1 bg-slate-50 border border-slate-200 text-slate-600 text-sm rounded-lg p-3 focus:outline-none"
              />
              <Button
                onClick={copyToClipboard}
                size="icon"
                variant="secondary"
                className="bg-slate-800 hover:bg-slate-900 text-white rounded-lg"
              >
                <Copy className="w-5 h-5" />
              </Button>
            </div>
            <Button asChild className="mt-4 w-full" size="lg">
              <Link href={derivedGuestUrl}>参加者マイページに移動する &rarr;</Link>
            </Button>
            <Button
              variant="outline"
              onClick={handleRegisterAnother}
              disabled={isResetting}
              className="mt-4 w-full border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              登録フォームに戻る
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
