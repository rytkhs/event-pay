"use client";

import { useState } from "react";

import { Mail, Monitor, FileText, ChevronRight, Eye } from "lucide-react";

import * as templates from "@core/notification/templates";

// プレビュー用のダミーデータ
const SAMPLE_DATA = {
  userName: "田中 太郎",
  nickname: "タナカ",
  eventTitle: "第10回 エンジニア交流会",
  eventDate: new Date(),
  attendanceStatus: "attending",
  eventLocation: "東京都渋谷区 ほげほげビル 3F",
  eventDescription:
    "今回の交流会では、最新のテクノロジーについて語り合います。\n飲み物と軽食を用意してお待ちしております。",
  amount: 3500,
  paidAt: new Date(),
  receiptUrl: "https://example.com/receipt/123",
  guestUrl: "https://example.com/guest/abc-123",
  paymentUrl: "https://example.com/pay/xyz-789",
  responseDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  paymentDeadline: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  restrictionReason: "本人確認書類の有効期限が切れています。",
  requiredActions: ["新しい本人確認書類をアップロードしてください", "住所情報を更新してください"],
  dashboardUrl: "https://example.com/dashboard",
  oldStatus: "onboarding",
  newStatus: "verified",
  chargesEnabled: true,
  payoutsEnabled: true,
  subject: "サーバーのCPU使用率が閾値を超えました",
  message: "警告: CPU使用率が 90% を超えています。\n至急確認が必要です。",
  details: {
    instanceId: "i-0123456789abcdef",
    region: "ap-northeast-1",
    threshold: "90%",
    current: "94.5%",
  },
  name: "山田 花子",
  email: "hanako.yamada@example.com",
  messageExcerpt:
    "サービスの使い方について質問があります。決済方法を増やしてほしいのですが、可能でしょうか？",
  receivedAt: new Date(),
};

type TemplateKey = keyof typeof templates;

export default function EmailPreviewPage() {
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey>(
    "buildParticipationRegisteredTemplate"
  );
  const [viewMode, setViewMode] = useState<"html" | "text">("html");

  // テンプレート関数のリストを取得（buildから始まるもののみ）
  const templateKeys = Object.keys(templates).filter((key) =>
    key.startsWith("build")
  ) as TemplateKey[];

  const renderCurrentTemplate = () => {
    const fn = (templates as Record<string, unknown>)[selectedTemplate];
    if (typeof fn !== "function") return null;

    try {
      // 必要なプロパティをサンプルデータから抽出して呼び出し
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (fn as any)(SAMPLE_DATA);
    } catch (e) {
      console.error(e);
      return { subject: "Error", html: "Render Error", text: "Render Error" };
    }
  };

  const preview = renderCurrentTemplate();

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] text-[#0F172A] font-sans selection:bg-cyan-100">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-600 rounded-lg shadow-lg shadow-cyan-200">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
            Email Previewer
          </h1>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 shadow-inner">
            <button
              onClick={() => setViewMode("html")}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                viewMode === "html"
                  ? "bg-white text-cyan-700 shadow-md transform scale-[1.02]"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Monitor className="w-4 h-4" />
              HTML
            </button>
            <button
              onClick={() => setViewMode("text")}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                viewMode === "text"
                  ? "bg-white text-cyan-700 shadow-md transform scale-[1.02]"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <FileText className="w-4 h-4" />
              Plain Text
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-80 bg-white border-r border-slate-200 overflow-y-auto p-6 space-y-3 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest pl-1">
              Templates
            </span>
            <span className="bg-slate-100 text-slate-500 text-[10px] px-2 py-0.5 rounded-full font-bold">
              {templateKeys.length}
            </span>
          </div>

          <div className="space-y-1.5">
            {templateKeys.map((key) => {
              const isActive = selectedTemplate === key;
              const displayName = key.replace("build", "").replace("Template", "");

              return (
                <button
                  key={key}
                  onClick={() => setSelectedTemplate(key)}
                  className={`group w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm transition-all duration-200 ${
                    isActive
                      ? "bg-cyan-50/80 text-cyan-800 font-bold border border-cyan-100 shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 border border-transparent"
                  }`}
                >
                  <span className="truncate pr-2">{displayName}</span>
                  {isActive ? (
                    <Eye className="w-4 h-4 text-cyan-600 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Preview Area */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-50/50 p-10 overflow-hidden">
          {preview && (
            <div className="flex flex-col h-full space-y-6 max-w-5xl mx-auto w-full">
              {/* Subject Display */}
              <div className="group animate-in fade-in slide-in-from-top-4 duration-500">
                <div className="bg-white border border-slate-200/60 p-5 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)] transition-shadow duration-300">
                  <div className="flex items-center gap-4">
                    <div className="flex-none">
                      <span className="text-[10px] font-black text-white uppercase bg-slate-800 px-2.5 py-1 rounded-md tracking-wider">
                        Subject
                      </span>
                    </div>
                    <div className="flex-1 h-px bg-slate-100" />
                    <h2 className="text-slate-700 font-semibold truncate text-lg">
                      {preview.subject}
                    </h2>
                  </div>
                </div>
              </div>

              {/* Preview Box */}
              <div className="flex-1 bg-white border border-slate-200/60 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.05)] overflow-hidden flex flex-col animate-in fade-in fill-mode-both delay-300 duration-700">
                <div className="bg-slate-50/50 border-b border-slate-100 px-6 py-3 flex items-center justify-between shrink-0 text-[11px] font-bold text-slate-400">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-200" />
                  </div>
                  <div className="uppercase tracking-[0.2em]">Preview Console</div>
                  <div className="w-8" />
                </div>

                <div className="flex-1 overflow-hidden relative">
                  {viewMode === "html" ? (
                    <iframe
                      srcDoc={preview.html}
                      title="Email Preview"
                      className="w-full h-full border-none"
                    />
                  ) : (
                    <div className="p-10 h-full overflow-auto bg-[#FAFAFA]">
                      <pre className="font-mono text-sm leading-relaxed text-slate-600 whitespace-pre-wrap selection:bg-cyan-100">
                        {preview.text}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
