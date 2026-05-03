import React from "react";

import Link from "next/link";

import {
  Calendar,
  MapPin,
  Banknote,
  CheckCircle2,
  HelpCircle,
  XCircle,
  CreditCard,
  ArrowRight,
  Wallet,
  AlertTriangle,
  CalendarCheck,
  ChevronRight,
} from "lucide-react";

import { FadeIn } from "./ui/FadeIn";

/* ─────────────────────────── スマホフレーム ─────────────────────────── */
const PhoneMockup: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => (
  <div
    className={`mx-auto w-[260px] rounded-[2rem] bg-slate-900 p-2 shadow-2xl ring-1 ring-slate-700/50 ${className}`}
  >
    {/* スクリーン */}
    <div className="bg-slate-50 rounded-[1.5rem] overflow-hidden min-h-[380px] flex flex-col">
      {children}
    </div>
  </div>
);

/* ─────────────────────── 招待ページ スクリーン ─────────────────────── */
const InviteScreenMock: React.FC = () => (
  <div className="flex flex-col h-full text-[11px]">
    {/* ヘッダー */}
    <div className="bg-white px-4 pt-4 pb-3 border-b border-slate-100">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[9px] font-bold">
          募集中
        </span>
        <span className="text-slate-400 text-[9px]">テニスサークル</span>
      </div>
      <h3 className="font-bold text-slate-900 text-sm leading-tight">夏の納涼会🍺</h3>
    </div>

    {/* イベント詳細 */}
    <div className="bg-white px-4 py-3 space-y-2.5">
      <div className="flex items-center gap-2 text-slate-700">
        <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
        <span>8月25日 (土) 18:00〜</span>
      </div>
      <div className="flex items-center gap-2 text-slate-700">
        <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
        <span>渋谷 居酒屋はなまる</span>
      </div>
      <div className="flex items-center gap-2 text-slate-700">
        <Banknote className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="font-bold">¥3,500</span>
      </div>
    </div>

    {/* 区切り */}
    <div className="h-2 bg-slate-100" />

    {/* フォーム */}
    <div className="bg-white px-4 py-3 flex-1">
      <p className="font-bold text-slate-800 text-xs mb-2.5">参加登録</p>

      {/* ニックネーム */}
      <div className="mb-2">
        <span className="text-[9px] font-bold text-slate-500 block mb-0.5">ニックネーム</span>
        <div className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 text-slate-700">
          山田 太郎
        </div>
      </div>

      {/* 出欠 */}
      <div className="mb-2">
        <span className="text-[9px] font-bold text-slate-500 block mb-0.5">出欠</span>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="flex flex-col items-center p-1.5 rounded-lg border-2 border-primary bg-primary/10 text-primary">
            <CheckCircle2 className="w-4 h-4 mb-0.5 fill-primary text-white" />
            <span className="text-[9px] font-bold">参加</span>
          </div>
          <div className="flex flex-col items-center p-1.5 rounded-lg border border-slate-200 text-slate-400">
            <HelpCircle className="w-4 h-4 mb-0.5" />
            <span className="text-[9px]">未定</span>
          </div>
          <div className="flex flex-col items-center p-1.5 rounded-lg border border-slate-200 text-slate-400">
            <XCircle className="w-4 h-4 mb-0.5" />
            <span className="text-[9px]">不参加</span>
          </div>
        </div>
      </div>

      {/* 支払い方法 */}
      <div className="mb-3">
        <span className="text-[9px] font-bold text-slate-500 block mb-0.5">支払い方法</span>
        <div className="flex items-center p-2 border-2 border-primary bg-primary/5 rounded-lg mb-1">
          <div className="w-3 h-3 rounded-full bg-primary mr-2 flex items-center justify-center">
            <div className="w-1 h-1 bg-white rounded-full" />
          </div>
          <CreditCard className="w-3 h-3 text-slate-600 mr-1.5" />
          <span className="text-[10px] font-bold text-slate-800">オンライン</span>
        </div>
        <div className="flex items-center p-2 border border-slate-200 rounded-lg">
          <div className="w-3 h-3 rounded-full border border-slate-300 mr-2" />
          <Banknote className="w-3 h-3 text-slate-400 mr-1.5" />
          <span className="text-[10px] text-slate-500">現金</span>
        </div>
      </div>

      {/* 送信ボタン */}
      <div className="bg-primary text-white text-center py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1">
        登録する
        <ArrowRight className="w-3.5 h-3.5" />
      </div>
    </div>
  </div>
);

/* ─────────────────────── ゲストページ スクリーン ─────────────────────── */
const GuestScreenMock: React.FC = () => (
  <div className="flex flex-col h-full text-[11px]">
    {/* チケット風ステータスカード */}
    <div className="mx-3 mt-4 rounded-2xl overflow-hidden shadow-md">
      {/* 上部ステータス */}
      <div className="bg-amber-500 text-white p-5 flex flex-col items-center text-center">
        <AlertTriangle className="w-8 h-8 mb-1.5" />
        <p className="font-bold text-sm">参加予定・決済待ち</p>
        <p className="text-[9px] opacity-90 mt-1">決済を完了してください。</p>
        <div className="bg-white/20 backdrop-blur-sm rounded-md px-4 py-2 mt-2.5 min-w-[140px]">
          <p className="text-[9px] opacity-80 mb-0.5">参加費</p>
          <p className="text-xl font-bold font-mono">¥3,500</p>
        </div>
      </div>

      {/* 切り取り線 */}
      <div className="h-3 w-full relative bg-amber-500">
        <div className="absolute top-0 left-0 w-full h-full bg-white rounded-t-xl" />
      </div>

      {/* ユーザー情報 */}
      <div className="bg-white px-4 pb-4 pt-1">
        <div className="grid grid-cols-2 gap-3 text-[10px]">
          <div>
            <p className="text-slate-400 uppercase text-[8px] mb-0.5">Guest Name</p>
            <p className="font-semibold text-slate-800">山田 太郎</p>
          </div>
          <div>
            <p className="text-slate-400 uppercase text-[8px] mb-0.5">Event</p>
            <p className="font-semibold text-slate-800">夏の納涼会🍺</p>
          </div>
        </div>
      </div>
    </div>

    {/* アクションエリア — 決済待ちの表示例 */}
    <div className="mx-3 mt-3 bg-white rounded-xl p-3 shadow-sm border border-amber-100">
      <div className="flex items-center gap-1.5 mb-2">
        <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-[8px] font-bold">
          ACTION
        </span>
        <span className="text-[10px] font-bold text-slate-700">決済が完了していません</span>
      </div>
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white text-center py-2.5 rounded-lg font-bold text-[10px] flex items-center justify-center gap-1">
        <CreditCard className="w-3.5 h-3.5" />
        オンライン決済へ進む
      </div>
      <p className="text-[8px] text-slate-400 text-center mt-1.5">
        Stripeの安全な決済ページへ移動します
      </p>
    </div>

    {/* 出欠変更エリア */}
    <div className="mx-3 mt-3 mb-4 bg-white rounded-xl p-3 shadow-sm border border-slate-100">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CalendarCheck className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-[10px] font-medium text-slate-600">登録情報の変更</span>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
      </div>
    </div>
  </div>
);

/* ─────────────────────────── メインセクション ─────────────────────────── */
export const ParticipantFlowSection: React.FC = () => {
  return (
    <section className="py-20 md:py-28 bg-slate-50 overflow-hidden">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        {/* セクションヘッダー */}
        <FadeIn direction="up" className="text-center mb-16 md:mb-20">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">
            参加者はリンクを開くだけ。アカウント登録不要。
          </h2>
          <p className="text-slate-500 text-lg max-w-2xl mx-auto">
            参加者にアプリのインストールや会員登録をお願いする必要はありません。
            <br className="hidden md:block" />
            招待リンクを開いて参加登録した後は、ゲストページからいつでも確認・変更できます。
          </p>
        </FadeIn>

        {/* ─── Phase 1: 招待ページ ─── */}
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16 mb-20 md:mb-24 ">
          {/* テキスト */}
          <FadeIn direction="right" delay={0.1} className="flex-1 order-2 md:order-1">
            <div className="flex items-center gap-3 mb-4">
              <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                1
              </span>
              <span className="text-primary font-bold text-sm tracking-wider uppercase">
                招待ページ
              </span>
            </div>
            <h3 className="text-2xl md:text-3xl font-bold text-slate-800 mb-4 leading-snug">
              リンクを開いて、
              <br />
              30秒で参加登録。
            </h3>
            <p className="text-slate-500 text-base leading-relaxed mb-6">
              主催者から共有された招待リンクを開くだけで、イベントの詳細を確認できます。
              名前・メール・出欠・支払い方法を1つのフォームで入力したら、参加登録は完了です。
            </p>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5 text-slate-600">
                <div className="bg-primary/10 p-1 rounded-full text-primary mt-0.5 shrink-0">
                  <CheckCircle2 size={12} strokeWidth={3} />
                </div>
                イベント詳細をひと目で確認
              </li>
              <li className="flex items-start gap-2.5 text-slate-600">
                <div className="bg-primary/10 p-1 rounded-full text-primary mt-0.5 shrink-0">
                  <CheckCircle2 size={12} strokeWidth={3} />
                </div>
                「参加」「未定」「不参加」から出欠を選択
              </li>
              <li className="flex items-start gap-2.5 text-slate-600">
                <div className="bg-primary/10 p-1 rounded-full text-primary mt-0.5 shrink-0">
                  <CheckCircle2 size={12} strokeWidth={3} />
                </div>
                オンライン決済・現金払いから支払い方法を選択
              </li>
            </ul>
          </FadeIn>

          {/* スマホモック */}
          <FadeIn direction="up" delay={0.3} className="order-1 md:order-2 shrink-0">
            <PhoneMockup>
              <InviteScreenMock />
            </PhoneMockup>
          </FadeIn>
        </div>

        {/* ─── 矢印コネクタ ─── */}
        <FadeIn direction="up" className="flex justify-center mb-20 md:mb-24">
          <div className="flex flex-col items-center gap-2 text-slate-300">
            <div className="w-px h-8 bg-gradient-to-b from-transparent via-slate-300 to-slate-300" />
            <div className="bg-white border-2 border-slate-200 rounded-full px-5 py-2 text-xs font-bold text-slate-500 shadow-sm">
              登録完了 → ゲストページURLを発行
            </div>
            <div className="w-px h-8 bg-gradient-to-b from-slate-300 via-slate-300 to-transparent" />
          </div>
        </FadeIn>

        {/* ─── Phase 2: ゲストページ ─── */}
        <div className="flex flex-col md:flex-row items-center gap-10 md:gap-16">
          {/* スマホモック */}
          <FadeIn direction="up" delay={0.3} className="shrink-0">
            <PhoneMockup>
              <GuestScreenMock />
            </PhoneMockup>
          </FadeIn>

          {/* テキスト */}
          <FadeIn direction="left" delay={0.1} className="flex-1">
            <div className="flex items-center gap-3 mb-4">
              <span className="bg-primary text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0">
                2
              </span>
              <span className="text-primary font-bold text-sm tracking-wider uppercase">
                ゲストページ
              </span>
            </div>
            <h3 className="text-2xl md:text-3xl font-bold text-slate-800 mb-4 leading-snug">
              登録後もいつでも、
              <br />
              確認・変更・決済。
            </h3>
            <p className="text-slate-500 text-base leading-relaxed mb-6">
              参加登録後に発行されるゲストページから、自分の参加状況をいつでも確認できます。
              出欠の変更やオンライン決済もここから行えます。
            </p>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2.5 text-slate-600">
                <div className="bg-emerald-500/10 p-1 rounded-full text-emerald-600 mt-0.5 shrink-0">
                  <CheckCircle2 size={12} strokeWidth={3} />
                </div>
                参加状況・支払い状況を確認
              </li>
              <li className="flex items-start gap-2.5 text-slate-600">
                <div className="bg-emerald-500/10 p-1 rounded-full text-emerald-600 mt-0.5 shrink-0">
                  <Wallet size={12} strokeWidth={3} />
                </div>
                ボタンひとつでオンライン決済
              </li>
              <li className="flex items-start gap-2.5 text-slate-600">
                <div className="bg-emerald-500/10 p-1 rounded-full text-emerald-600 mt-0.5 shrink-0">
                  <CalendarCheck size={12} strokeWidth={3} />
                </div>
                出欠や支払い方法をいつでも変更可能
              </li>
            </ul>
          </FadeIn>
        </div>

        {/* 文脈リンク */}
        <FadeIn direction="up" delay={0.2}>
          <div className="mt-16 text-center">
            <Link
              href="/guide/participant-flow"
              className="text-primary hover:text-primary/80 text-sm font-medium transition-colors"
            >
              詳しい参加者画面の流れ →
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
};
