"use client";

import React, { useState } from "react";

import { Check, CreditCard, Banknote, MoreHorizontal, RotateCcw } from "lucide-react";

interface Participant {
  id: number;
  name: string;
  attendance: "参加" | "未定" | "不参加";
  paymentMethod?: "stripe" | "cash";
  status?: "済" | "未";
}

export const ParticipantTableMock: React.FC = () => {
  const [participants, setParticipants] = useState<Participant[]>([
    {
      id: 1,
      name: "田中 太郎",
      attendance: "参加",
      paymentMethod: "stripe",
      status: "済",
    },
    {
      id: 2,
      name: "鈴木 次郎",
      attendance: "参加",
      paymentMethod: "cash",
      status: "未",
    },
    {
      id: 3,
      name: "佐藤 花子",
      attendance: "参加",
      paymentMethod: "cash",
      status: "済",
    },
    {
      id: 4,
      name: "山田 未定",
      attendance: "未定",
    },
    {
      id: 5,
      name: "高橋 不参加",
      attendance: "不参加",
    },
  ]);

  const handleReceive = (id: number) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "済" as const } : p))
    );
  };

  const handleCancel = (id: number) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === id ? { ...p, status: "未" as const } : p))
    );
  };

  return (
    <div className="w-full max-w-md bg-white rounded-xl text-slate-800 overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="bg-slate-100 border-b border-slate-200 px-4 py-3 flex items-center">
        <div className="flex gap-1.5">
          <div
            className="w-3 h-3 rounded-full bg-[#FF5F56] border border-[#E0443E]"
            aria-hidden="true"
          ></div>
          <div
            className="w-3 h-3 rounded-full bg-[#FFBD2E] border border-[#DEA123]"
            aria-hidden="true"
          ></div>
          <div
            className="w-3 h-3 rounded-full bg-[#27C93F] border border-[#1AAB29]"
            aria-hidden="true"
          ></div>
        </div>
        <div className="flex-1 text-center font-bold text-slate-600 text-xs">参加者一覧</div>
        <div className="w-10"></div>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-1 px-2.5 py-2 bg-slate-50/80 text-[9px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
        <div className="col-span-3 pl-1">ニックネーム</div>
        <div className="col-span-2 text-center">参加状況</div>
        <div className="col-span-3 text-center">決済方法</div>
        <div className="col-span-2 text-center">決済状況</div>
        <div className="col-span-2 text-center">アクション</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-slate-50">
        {participants.map((participant) => {
          const isActionRequired = participant.paymentMethod === "cash" && participant.status === "未";

          const rowClassName = isActionRequired
            ? "bg-red-50/60 border-l-2 !border-l-red-500"
            : "border-l-2 border-l-transparent";

          return (
            <div
              key={participant.id}
              className={`grid grid-cols-12 gap-1 px-2.5 py-2 items-center transition-all duration-300 ${rowClassName}`}
            >
              <div className="col-span-3 font-semibold text-slate-700 text-[11px] pl-1 truncate">
                {participant.name}
              </div>
              <div className="col-span-2 flex justify-center">
                <span className={`border px-1.5 py-0.5 rounded-[5px] text-[9px] font-semibold tracking-wide ${
                  participant.attendance === "参加"
                    ? "text-emerald-700 border-emerald-500/20 bg-emerald-500/10"
                    : participant.attendance === "未定"
                      ? "text-amber-700 border-amber-500/30 bg-amber-500/10"
                      : "text-rose-700 border-rose-500/20 bg-rose-500/10"
                }`}>
                  {participant.attendance}
                </span>
              </div>
              <div className="col-span-3 flex justify-center">
                {participant.paymentMethod ? (
                  <span
                    className={`border px-1.5 py-0.5 rounded-[5px] text-[9px] font-semibold tracking-wide flex items-center gap-1 ${
                      participant.paymentMethod === "stripe"
                        ? "text-indigo-700 border-indigo-500/20 bg-indigo-500/10"
                        : "text-amber-700 border-amber-500/30 bg-amber-500/10"
                    }`}
                  >
                    {participant.paymentMethod === "stripe" ? (
                      <CreditCard className="h-2.5 w-2.5" />
                    ) : (
                      <Banknote className="h-2.5 w-2.5" />
                    )}
                    {participant.paymentMethod === "stripe" ? "オンライン" : "現金"}
                  </span>
                ) : (
                  <span className="text-slate-300 text-[10px]">-</span>
                )}
              </div>
              <div className="col-span-2 flex justify-center">
                {participant.status ? (
                  <span
                    className={`border px-1.5 py-0.5 rounded-[5px] text-[9px] font-semibold tracking-wide transition-all duration-300 ${
                      participant.status === "済"
                        ? "text-emerald-700 border-emerald-500/20 bg-emerald-500/10"
                        : "text-rose-700 border-rose-500/20 bg-rose-500/10"
                    }`}
                  >
                    {participant.status}
                  </span>
                ) : (
                  <span className="text-slate-300 text-[10px]">-</span>
                )}
              </div>
              <div className="col-span-2 flex justify-center">
                {participant.paymentMethod === "cash" ? (
                  participant.status === "未" ? (
                    <button
                      onClick={() => handleReceive(participant.id)}
                      className="flex items-center gap-0.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 text-[9px] font-bold px-1.5 py-0.5 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-sm"
                      title="現金決済を受領済みにする"
                    >
                      <Check className="h-2.5 w-2.5" />
                      受領
                    </button>
                  ) : (
                    <button
                      onClick={() => handleCancel(participant.id)}
                      className="flex items-center gap-0.5 border border-slate-300 bg-slate-100 text-slate-500 hover:bg-slate-200 text-[9px] font-bold px-1.5 py-0.5 rounded-lg transition-all transform hover:scale-105 active:scale-95 shadow-sm"
                      title="受領を取り消す"
                    >
                      <RotateCcw className="h-2.5 w-2.5" />
                    </button>
                  )
                ) : (
                  <div className="text-slate-300 cursor-default">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
